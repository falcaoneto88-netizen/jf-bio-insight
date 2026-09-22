-- 1) Registro de uso único das assinaturas do despertador interno.
create table if not exists jornada_events.wakeup_nonce (
  nonce text primary key,
  used_at timestamptz not null default now()
);
revoke all on jornada_events.wakeup_nonce from public;

-- 2) Verificação da assinatura: finalidade fixa, janela curta, uso único.
create or replace function jornada_events.wakeup_valid(_epoch bigint, _nonce text, _sig text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_key text; v_expected text;
begin
  if _epoch is null or _nonce is null or _sig is null then return false; end if;
  if _nonce !~ '^[a-f0-9]{32}$' or _sig !~ '^[a-f0-9]{64}$' then return false; end if;
  if abs(floor(extract(epoch from now()))::bigint - _epoch) > 120 then return false; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'jornada_outbox_worker';
  if v_key is null then return false; end if;
  v_expected := encode(extensions.hmac('jornada-outbox-wakeup|' || _epoch || '|' || _nonce, v_key, 'sha256'), 'hex');
  if v_expected <> _sig then return false; end if;
  insert into jornada_events.wakeup_nonce(nonce) values (_nonce) on conflict do nothing;
  if not found then return false; end if;
  delete from jornada_events.wakeup_nonce where used_at < now() - interval '1 hour';
  return true;
end;
$$;
revoke all on function jornada_events.wakeup_valid(bigint, text, text) from public, anon, authenticated;

-- 3) Reserva assinada: devolve a reserva com lease/fencing e apenas a cadeia
--    administrativa necessária (sem nenhum conteúdo clínico).
create or replace function public.jornada_outbox_claim_signed(_epoch bigint, _nonce text, _sig text, _limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_batch jsonb;
begin
  if not jornada_events.wakeup_valid(_epoch, _nonce, _sig) then
    raise exception 'DESPERTADOR_INVALIDO' using errcode = '42501';
  end if;
  with claimed as (
    select * from public.jornada_outbox_claim(greatest(1, least(coalesce(_limit, 10), 25)), 120)
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
    'invitation', (
      select jsonb_build_object('id', i.id, 'location_id', i.location_id, 'contact_id', i.contact_id,
                                'consultation_id', i.consultation_id, 'revoked_at', i.revoked_at,
                                'submission_id', i.submission_id)
        from public.intake_invitations i
       where i.id = (select s2.invitation_id from public.anamnesis_submissions s2 where s2.id = c.record_id))
  )), '[]'::jsonb) into v_batch
  from claimed c;
  return v_batch;
end;
$$;
revoke all on function public.jornada_outbox_claim_signed(bigint, text, text, integer) from public, authenticated;
grant execute on function public.jornada_outbox_claim_signed(bigint, text, text, integer) to anon;

-- 4) Conclusão autenticada pelo bilhete de reserva (fencing), sem acesso privilegiado.
create or replace function public.jornada_outbox_complete_signed(_id uuid, _lease uuid, _status text, _error text default null, _receipt text default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if _status not in ('sent','failed','blocked') then raise exception 'ESTADO_INVALIDO'; end if;
  if _error is not null and _error !~ '^[a-z_]{1,40}$' then raise exception 'CODIGO_INVALIDO'; end if;
  if _receipt is not null and _receipt not in ('received','duplicate') then raise exception 'RECIBO_INVALIDO'; end if;
  return public.jornada_outbox_complete(_id, _lease, _status, _error, _receipt);
end;
$$;
revoke all on function public.jornada_outbox_complete_signed(uuid, uuid, text, text, text) from public, authenticated;
grant execute on function public.jornada_outbox_complete_signed(uuid, uuid, text, text, text) to anon;

-- 5) Despertador interno: sem credencial no cabeçalho, sem identificadores de paciente.
--    pg_net segue redirects (CURLOPT_FOLLOWLOCATION), por isso o corpo carrega apenas
--    uma assinatura de finalidade única, uso único e validade de 2 minutos.
create or replace function public.jornada_outbox_tick()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_key text; v_url text; v_request bigint;
        v_epoch bigint := floor(extract(epoch from now()))::bigint;
        v_nonce text := encode(extensions.gen_random_bytes(16), 'hex');
        v_sig text;
begin
  select worker_url into v_url from jornada_events.config where singleton and enabled;
  if v_url is null then return null; end if;
  if not exists (
    select 1 from jornada_events.outbox
     where status in ('pending','failed') and next_attempt_at <= now() and attempts < max_attempts
  ) then
    return null;
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'jornada_outbox_worker';
  if v_key is null then return null; end if;
  v_sig := encode(extensions.hmac('jornada-outbox-wakeup|' || v_epoch || '|' || v_nonce, v_key, 'sha256'), 'hex');
  select net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('ts', v_epoch, 'nonce', v_nonce, 'sig', v_sig),
    timeout_milliseconds := 55000
  ) into v_request;
  return v_request;
end;
$$;

-- 6) A credencial fixa deixa de existir como porta de entrada.
drop function if exists public.jornada_worker_auth(text);

-- 7) Fecha permissões públicas herdadas das tabelas técnicas de requisições internas.
revoke all on table net.http_request_queue from public;
revoke all on table net._http_response from public;
revoke all on sequence net.http_request_queue_id_seq from public;