-- === 1. Config: marca d'água da primeira ativação, escopo de organização e reconciliação ===
alter table jornada_events.config add column if not exists first_activated_at timestamptz;
alter table jornada_events.config add column if not exists org_fingerprint text;
alter table jornada_events.config add column if not exists reconciled_at timestamptz;

-- === 2. Estado "esgotado": falha que exige intervenção ===
alter table jornada_events.outbox drop constraint if exists outbox_status_check;
alter table jornada_events.outbox add constraint outbox_status_check
  check (status in ('pending','sending','sent','failed','blocked','exhausted'));

create index if not exists outbox_due_idx
  on jornada_events.outbox (status, next_attempt_at);

-- === 3. Reconciliação: só confirmações elegíveis desde a PRIMEIRA ativação ===
create or replace function jornada_events.reconcile(_limit integer default 200)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_cfg jornada_events.config%rowtype; v_count integer := 0;
begin
  select * into v_cfg from jornada_events.config where singleton;
  if not found or v_cfg.first_activated_at is null or coalesce(v_cfg.location_id,'') = '' then
    return 0;
  end if;
  with eligible as (
    select s.id, s.consultation_id
      from public.anamnesis_submissions s
     where s.accepted
       and s.confirmed_at >= v_cfg.first_activated_at
       and not exists (
         select 1 from jornada_events.outbox o
          where o.event_type = 'anamnese_recebida'
            and o.record_id = s.id
            and o.scope_location_id = v_cfg.location_id)
     order by s.confirmed_at
     limit greatest(1, least(coalesce(_limit, 200), 500))
  ), inserted as (
    insert into jornada_events.outbox (event_type, record_id, consultation_id, scope_location_id)
    select 'anamnese_recebida', e.id, e.consultation_id, v_cfg.location_id from eligible e
    on conflict (event_type, record_id, scope_location_id) do nothing
    returning 1
  )
  select count(*) into v_count from inserted;
  update jornada_events.config set reconciled_at = now() where singleton;
  return v_count;
end; $$;
revoke all on function jornada_events.reconcile(integer) from public;

-- === 4. Gatilho: registra mesmo pausado, a partir da marca d'água ===
create or replace function public.jornada_enqueue_anamnese()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_cfg jornada_events.config%rowtype;
begin
  begin
    if new.accepted is not true then return null; end if;
    select * into v_cfg from jornada_events.config where singleton;
    if not found or coalesce(v_cfg.location_id,'') = '' or v_cfg.first_activated_at is null then
      return null;
    end if;
    if new.confirmed_at is null or new.confirmed_at < v_cfg.first_activated_at then return null; end if;
    insert into jornada_events.outbox (event_type, record_id, consultation_id, scope_location_id)
    values ('anamnese_recebida', new.id, new.consultation_id, v_cfg.location_id)
    on conflict (event_type, record_id, scope_location_id) do nothing;
  exception when others then
    -- Nunca impede a gravação da anamnese; a reconciliação periódica recupera a ausência.
    return null;
  end;
  return null;
end; $$;
revoke all on function public.jornada_enqueue_anamnese() from public, anon, authenticated;

-- === 5. Reserva: exige config ativa, escopo da clínica e recupera reservas vencidas ===
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

  update jornada_events.outbox o
     set status = 'pending', lease_token = null, lease_until = null, updated_at = now()
   where o.status = 'sending' and (o.lease_until is null or o.lease_until < now());

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

-- === 6. Conclusão: exige reserva viva; tentativas esgotadas exigem intervenção ===
create or replace function public.jornada_outbox_complete(_id uuid, _lease uuid, _status text,
  _error text default null, _receipt text default null)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_row jornada_events.outbox%rowtype; v_delay integer;
begin
  if _status not in ('sent','failed','blocked') then
    raise exception 'ESTADO_INVALIDO';
  end if;
  select * into v_row from jornada_events.outbox
   where id = _id and lease_token = _lease and status = 'sending'
     and lease_until is not null and lease_until > now()
   for update;
  if not found then return false; end if;

  if _status = 'sent' then
    update jornada_events.outbox
       set status = 'sent', sent_at = now(), receipt_status = left(coalesce(_receipt,''), 40),
           last_error_code = null, lease_token = null, lease_until = null, updated_at = now()
     where id = _id;
  elsif _status = 'blocked' then
    update jornada_events.outbox
       set status = 'blocked', last_error_code = left(coalesce(_error,'vinculo'), 60),
           lease_token = null, lease_until = null, updated_at = now()
     where id = _id;
  elsif v_row.attempts >= v_row.max_attempts then
    update jornada_events.outbox
       set status = 'exhausted', last_error_code = left(coalesce(_error,'falha'), 60),
           lease_token = null, lease_until = null, updated_at = now()
     where id = _id;
  else
    v_delay := least(3600, 60 * power(2, greatest(v_row.attempts - 1, 0))::integer);
    update jornada_events.outbox
       set status = 'failed', last_error_code = left(coalesce(_error,'falha'), 60),
           next_attempt_at = now() + make_interval(secs => v_delay),
           lease_token = null, lease_until = null, updated_at = now()
     where id = _id;
  end if;
  return true;
end; $$;

-- === 7. Renovação da reserva durante o lote (autenticada pelo bilhete atual) ===
create or replace function public.jornada_outbox_renew_signed(_id uuid, _lease uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  update jornada_events.outbox
     set lease_until = now() + interval '60 seconds', updated_at = now()
   where id = _id and lease_token = _lease and status = 'sending'
     and lease_until is not null and lease_until > now();
  return found;
end; $$;
revoke all on function public.jornada_outbox_renew_signed(uuid, uuid) from public, authenticated;
grant execute on function public.jornada_outbox_renew_signed(uuid, uuid) to anon;

-- === 8. Reserva assinada: escopo de organização fixado + cadeia completa ===
drop function if exists public.jornada_outbox_claim_signed(bigint, text, text, integer);
create or replace function public.jornada_outbox_claim_signed(_epoch bigint, _nonce text, _sig text,
  _org_fp text, _limit integer default 10)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_batch jsonb; v_cfg jornada_events.config%rowtype;
begin
  if not jornada_events.wakeup_valid(_epoch, _nonce, _sig) then
    raise exception 'DESPERTADOR_INVALIDO' using errcode = '42501';
  end if;
  if _org_fp is null or _org_fp !~ '^[a-f0-9]{64}$' then
    raise exception 'ESCOPO_INVALIDO' using errcode = '42501';
  end if;
  select * into v_cfg from jornada_events.config where singleton for update;
  if not found then raise exception 'ESCOPO_INVALIDO' using errcode = '42501'; end if;
  if v_cfg.org_fingerprint is null then
    update jornada_events.config set org_fingerprint = _org_fp, updated_at = now() where singleton;
  elsif v_cfg.org_fingerprint <> _org_fp then
    raise exception 'ESCOPO_INVALIDO' using errcode = '42501';
  end if;

  with claimed as (
    select * from public.jornada_outbox_claim(greatest(1, least(coalesce(_limit, 10), 25)), 60)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'event_type', c.event_type,
    'record_id', c.record_id,
    'consultation_id', c.consultation_id,
    'scope_location_id', c.scope_location_id,
    'attempts', c.attempts,
    'lease_token', c.lease_token,
    'submission', (
      select jsonb_build_object('id', s.id, 'consultation_id', s.consultation_id, 'accepted', s.accepted,
                                'confirmed_at', s.confirmed_at, 'invitation_id', s.invitation_id)
        from public.anamnesis_submissions s where s.id = c.record_id),
    'consultation', (
      select jsonb_build_object('id', k.id, 'patient_id', k.patient_id)
        from public.consultations k where k.id = c.consultation_id),
    'links', (
      select coalesce(jsonb_agg(jsonb_build_object('location_id', g.location_id, 'contact_id', g.contact_id,
                                                   'patient_id', g.patient_id)), '[]'::jsonb)
        from public.ghl_patient_links g
       where g.patient_id = (select k2.patient_id from public.consultations k2 where k2.id = c.consultation_id)),
    -- Unicidade resolvida no SQL completo: contagem sem truncamento.
    'link_contacts', (
      select count(distinct g.contact_id)
        from public.ghl_patient_links g
       where g.location_id = c.scope_location_id
         and g.patient_id = (select k3.patient_id from public.consultations k3 where k3.id = c.consultation_id)),
    'invitation', (
      select jsonb_build_object('id', i.id, 'location_id', i.location_id, 'contact_id', i.contact_id,
                                'consultation_id', i.consultation_id, 'revoked_at', i.revoked_at,
                                'submitted_at', i.submitted_at, 'submission_id', i.submission_id)
        from public.intake_invitations i
       where i.id = (select s2.invitation_id from public.anamnesis_submissions s2 where s2.id = c.record_id))
  )), '[]'::jsonb) into v_batch
  from claimed c;
  return v_batch;
end; $$;
revoke all on function public.jornada_outbox_claim_signed(bigint, text, text, text, integer)
  from public, authenticated;
grant execute on function public.jornada_outbox_claim_signed(bigint, text, text, text, integer) to anon;

-- === 9. Batida: reconcilia ausências e recupera reservas vencidas antes de acordar ===
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
  update jornada_events.outbox
     set status = 'pending', lease_token = null, lease_until = null, updated_at = now()
   where status = 'sending' and (lease_until is null or lease_until < now());

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

-- === 10. Situação administrativa: pausado x configuração indisponível x esgotado ===
create or replace function public.jornada_outbox_settings()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_cfg jornada_events.config%rowtype; v_intake text; v_job boolean;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  select * into v_cfg from jornada_events.config where singleton;
  select location_id into v_intake from public.intake_automation where singleton and enabled;
  select active into v_job from cron.job where jobname = 'jornada-outbox-tick';
  return jsonb_build_object(
    'enabled', coalesce(v_cfg.enabled, false),
    'activated_at', v_cfg.activated_at,
    'first_activated_at', v_cfg.first_activated_at,
    'reconciled_at', v_cfg.reconciled_at,
    'location_id', coalesce(v_cfg.location_id, ''),
    'job_active', coalesce(v_job, false),
    'config_ok', coalesce(v_intake, '') <> ''
      and (coalesce(v_cfg.location_id, '') = '' or v_cfg.location_id = v_intake),
    'pending', (select count(*) from jornada_events.outbox where status in ('pending','sending','failed')),
    'blocked', (select count(*) from jornada_events.outbox where status = 'blocked'),
    'exhausted', (select count(*) from jornada_events.outbox where status = 'exhausted'),
    'sent', (select count(*) from jornada_events.outbox where status = 'sent'),
    'missing', (
      select count(*) from public.anamnesis_submissions s
       where v_cfg.first_activated_at is not null
         and coalesce(v_cfg.location_id,'') <> ''
         and s.accepted and s.confirmed_at >= v_cfg.first_activated_at
         and not exists (select 1 from jornada_events.outbox o
                          where o.event_type = 'anamnese_recebida' and o.record_id = s.id
                            and o.scope_location_id = v_cfg.location_id))
  );
end; $$;

-- === 11. Ativar/pausar: escopo imutável e marca d'água preservada ===
create or replace function public.jornada_outbox_configure(_enabled boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_location text; v_cfg jornada_events.config%rowtype;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  select * into v_cfg from jornada_events.config where singleton for update;
  if _enabled then
    select location_id into v_location from public.intake_automation where singleton and enabled;
    if coalesce(v_location,'') = '' then raise exception 'RECEBIMENTO_DESATIVADO'; end if;
    if coalesce(v_cfg.location_id,'') <> '' and v_cfg.location_id <> v_location then
      raise exception 'ESCOPO_DIVERGENTE';
    end if;
    update jornada_events.config
       set enabled = true,
           location_id = v_location,
           activated_at = now(),
           first_activated_at = coalesce(v_cfg.first_activated_at, now()),
           updated_by = auth.uid(),
           updated_at = now()
     where singleton;
  else
    -- Pausar preserva a marca d'água e a clínica: novas confirmações continuam registradas.
    update jornada_events.config
       set enabled = false, updated_by = auth.uid(), updated_at = now()
     where singleton;
  end if;
  return public.jornada_outbox_settings();
end; $$;

-- === 12. Reenvio administrativo cobre também tentativas esgotadas ===
create or replace function public.jornada_outbox_retry(_id uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  update jornada_events.outbox
     set status = 'pending', attempts = 0, next_attempt_at = now(),
         lease_token = null, lease_until = null, updated_at = now()
   where id = _id and status in ('failed','blocked','exhausted');
  return found;
end; $$;
