-- === 1. Recuperação de reservas vencidas preservando o limite de tentativas ===
-- Uma queda na última tentativa deixava a linha em 'sending'; ao voltar para
-- 'pending' com attempts >= max_attempts ela nunca mais era reservada.
create or replace function jornada_events.recover_expired()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_count integer := 0;
begin
  with recovered as (
    update jornada_events.outbox o
       set status = case when o.attempts >= o.max_attempts then 'exhausted' else 'pending' end,
           last_error_code = case
             when o.attempts >= o.max_attempts then 'reserva_expirada_esgotada'
             else coalesce(o.last_error_code, 'reserva_expirada') end,
           lease_token = null,
           lease_until = null,
           updated_at = now()
     where o.status = 'sending' and (o.lease_until is null or o.lease_until < now())
    returning 1)
  select count(*) into v_count from recovered;
  return v_count;
end; $$;
revoke all on function jornada_events.recover_expired() from public, anon, authenticated;

-- === 2. Reserva usa a recuperação correta ===
create or replace function public.jornada_outbox_claim(_limit integer default 10, _lease_seconds integer default 60)
returns table(id uuid, event_type text, record_id uuid, consultation_id uuid, scope_location_id text,
              attempts integer, lease_token uuid)
language plpgsql security definer set search_path to 'public' as $$
declare v_token uuid := gen_random_uuid(); v_cfg jornada_events.config%rowtype; v_lease integer;
begin
  select * into v_cfg from jornada_events.config where singleton;
  if not found or v_cfg.enabled is not true or coalesce(v_cfg.location_id,'') = '' then
    return;
  end if;
  v_lease := greatest(20, least(coalesce(_lease_seconds, 60), 120));

  perform jornada_events.recover_expired();

  return query
  with due as (
    select o.id from jornada_events.outbox o
     where o.status in ('pending','failed')
       and o.scope_location_id = v_cfg.location_id
       and o.next_attempt_at <= now()
       and o.attempts < o.max_attempts
     order by o.next_attempt_at, o.enqueued_at
     limit greatest(1, least(coalesce(_limit, 10), 25))
     for update skip locked
  )
  update jornada_events.outbox o
     set status = 'sending',
         lease_token = v_token,
         lease_until = now() + make_interval(secs => v_lease),
         attempts = o.attempts + 1,
         last_attempt_at = now(),
         updated_at = now()
    from due
   where o.id = due.id
  returning o.id, o.event_type, o.record_id, o.consultation_id, o.scope_location_id, o.attempts, o.lease_token;
end; $$;
revoke all on function public.jornada_outbox_claim(integer, integer) from public, anon, authenticated;

-- === 3. Verificação periódica usa a mesma recuperação ===
create or replace function public.jornada_outbox_tick()
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare v_key text; v_cfg jornada_events.config%rowtype; v_request bigint;
        v_epoch bigint := floor(extract(epoch from now()))::bigint;
        v_nonce text := encode(extensions.gen_random_bytes(16), 'hex');
        v_sig text;
begin
  select * into v_cfg from jornada_events.config where singleton;
  if not found then return null; end if;

  -- Reconciliação e recuperação acontecem mesmo pausado e mesmo sem outros itens.
  perform jornada_events.reconcile(200);
  perform jornada_events.recover_expired();

  if v_cfg.enabled is not true or coalesce(v_cfg.worker_url,'') = '' then return null; end if;
  if not exists (
    select 1 from jornada_events.outbox
     where status in ('pending','failed')
       and scope_location_id = v_cfg.location_id
       and next_attempt_at <= now()
       and attempts < max_attempts
  ) then
    return null;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'jornada_outbox_worker';
  if v_key is null then return null; end if;
  v_sig := encode(extensions.hmac('jornada-outbox-wakeup|' || v_epoch || '|' || v_nonce, v_key, 'sha256'), 'hex');
  select net.http_post(
    url := v_cfg.worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('ts', v_epoch, 'nonce', v_nonce, 'sig', v_sig),
    timeout_milliseconds := 55000
  ) into v_request;
  return v_request;
end; $$;
revoke all on function public.jornada_outbox_tick() from public, anon, authenticated;

-- === 4. Listagem administrativa da fila, independente da agenda do GHL ===
-- Somente administrador autenticado; apenas dados administrativos mínimos.
create or replace function public.jornada_outbox_list(_limit integer default 20, _offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_cfg jornada_events.config%rowtype; v_limit integer; v_offset integer; v_rows jsonb; v_total bigint;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  select * into v_cfg from jornada_events.config where singleton;
  if not found or coalesce(v_cfg.location_id,'') = '' then
    return jsonb_build_object('total', 0, 'limit', 0, 'offset', 0, 'rows', '[]'::jsonb);
  end if;
  v_limit := greatest(1, least(coalesce(_limit, 20), 50));
  v_offset := greatest(0, coalesce(_offset, 0));

  select count(*) into v_total from jornada_events.outbox o
   where o.scope_location_id = v_cfg.location_id;

  with ordered as (
    select o.*,
           case o.status
             when 'blocked' then 0
             when 'exhausted' then 1
             when 'failed' then 2
             when 'sending' then 3
             when 'pending' then 4
             else 9 end as priority
      from jornada_events.outbox o
     where o.scope_location_id = v_cfg.location_id
     order by priority, o.updated_at desc
     limit v_limit offset v_offset)
  select coalesce(jsonb_agg(jsonb_build_object(
    'outbox_id', x.id,
    'consultation_id', x.consultation_id,
    'record_id', x.record_id,
    'status', x.status,
    'attempts', x.attempts,
    'max_attempts', x.max_attempts,
    'enqueued_at', x.enqueued_at,
    'last_attempt_at', x.last_attempt_at,
    'next_attempt_at', x.next_attempt_at,
    'last_error_code', x.last_error_code,
    'sent_at', x.sent_at
  ) order by x.priority, x.updated_at desc), '[]'::jsonb) into v_rows from ordered x;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end; $$;
revoke all on function public.jornada_outbox_list(integer, integer) from public, anon;
grant execute on function public.jornada_outbox_list(integer, integer) to authenticated;