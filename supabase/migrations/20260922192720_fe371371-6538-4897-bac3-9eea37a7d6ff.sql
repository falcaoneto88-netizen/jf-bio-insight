-- 1. Nonces de prova (separados dos nonces de despertador)
create table if not exists jornada_events.proof_nonce(
  nonce text primary key,
  purpose text not null,
  used_at timestamptz not null default now()
);
revoke all on jornada_events.proof_nonce from public;

-- 2. Chave derivada da prova: gravada só por rotina restrita, nunca devolvida
create or replace function public.jornada_outbox_provision_claim_key(_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  if _key is null or _key !~ '^[a-f0-9]{64}$' then
    raise exception 'CHAVE_INVALIDA' using errcode = '22023';
  end if;
  if exists (select 1 from vault.decrypted_secrets where name = 'jornada_outbox_claim') then
    perform vault.update_secret(
      (select id from vault.decrypted_secrets where name = 'jornada_outbox_claim'), _key);
  else
    perform vault.create_secret(_key, 'jornada_outbox_claim', 'Prova de reserva da fila Jornada AI');
  end if;
  return jsonb_build_object('ready', true);
end; $$;
revoke all on function public.jornada_outbox_provision_claim_key(text) from public, anon;
grant execute on function public.jornada_outbox_provision_claim_key(text) to authenticated;

-- 3. Validação da prova do servidor (finalidade + escopo + tempo + nonce único)
create or replace function jornada_events.proof_valid(
  _purpose text, _payload text, _epoch bigint, _nonce text, _sig text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_key text; v_expected text;
begin
  if _purpose not in ('claim','renew','complete') then return false; end if;
  if _epoch is null or _nonce is null or _sig is null or _payload is null then return false; end if;
  if _nonce !~ '^[a-f0-9]{32}$' or _sig !~ '^[a-f0-9]{64}$' then return false; end if;
  if abs(floor(extract(epoch from now()))::bigint - _epoch) > 120 then return false; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'jornada_outbox_claim';
  if v_key is null then return false; end if;
  v_expected := encode(extensions.hmac(
    'jornada-outbox-' || _purpose || '|' || _payload || '|' || _epoch || '|' || _nonce,
    v_key, 'sha256'), 'hex');
  if v_expected <> _sig then return false; end if;
  insert into jornada_events.proof_nonce(nonce, purpose) values (_nonce, _purpose) on conflict do nothing;
  if not found then return false; end if;
  delete from jornada_events.proof_nonce where used_at < now() - interval '1 hour';
  return true;
end; $$;
revoke all on function jornada_events.proof_valid(text, text, bigint, text, text) from public, anon, authenticated;

-- 4. Despertador: apenas acorda, nunca devolve dados nem reserva
create or replace function public.jornada_outbox_wake_signed(_epoch bigint, _nonce text, _sig text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  return jornada_events.wakeup_valid(_epoch, _nonce, _sig);
end; $$;
grant execute on function public.jornada_outbox_wake_signed(bigint, text, text) to anon, authenticated;

-- 5. Reserva: prova do servidor, não aceita assinatura de despertador
drop function if exists public.jornada_outbox_claim_signed(bigint, text, text, text, integer);
create or replace function public.jornada_outbox_claim_signed(
  _epoch bigint, _nonce text, _sig text, _org_fp text, _location_id text, _limit integer default 10)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_batch jsonb; v_cfg jornada_events.config%rowtype; v_limit integer;
begin
  v_limit := greatest(1, least(coalesce(_limit, 10), 25));
  if _org_fp is null or _org_fp !~ '^[a-f0-9]{64}$' or coalesce(_location_id,'') = '' then
    raise exception 'ESCOPO_INVALIDO' using errcode = '42501';
  end if;
  if not jornada_events.proof_valid('claim', _org_fp || ':' || _location_id || ':' || v_limit,
                                    _epoch, _nonce, _sig) then
    raise exception 'PROVA_INVALIDA' using errcode = '42501';
  end if;
  select * into v_cfg from jornada_events.config where singleton for update;
  if not found or coalesce(v_cfg.location_id,'') <> _location_id then
    raise exception 'ESCOPO_INVALIDO' using errcode = '42501';
  end if;
  if v_cfg.org_fingerprint is null then
    update jornada_events.config set org_fingerprint = _org_fp, updated_at = now() where singleton;
  elsif v_cfg.org_fingerprint <> _org_fp then
    raise exception 'ESCOPO_INVALIDO' using errcode = '42501';
  end if;

  with claimed as (
    select * from public.jornada_outbox_claim(v_limit, 60)
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
grant execute on function public.jornada_outbox_claim_signed(bigint, text, text, text, text, integer) to anon, authenticated;

-- 6. Renovação e conclusão: mesma autoridade de prova, ligada ao bilhete
drop function if exists public.jornada_outbox_renew_signed(uuid, uuid);
create or replace function public.jornada_outbox_renew_signed(
  _id uuid, _lease uuid, _epoch bigint, _nonce text, _sig text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if not jornada_events.proof_valid('renew', _id::text || ':' || _lease::text, _epoch, _nonce, _sig) then
    raise exception 'PROVA_INVALIDA' using errcode = '42501';
  end if;
  update jornada_events.outbox
     set lease_until = now() + interval '60 seconds', updated_at = now()
   where id = _id and lease_token = _lease and status = 'sending'
     and lease_until is not null and lease_until > now();
  return found;
end; $$;
grant execute on function public.jornada_outbox_renew_signed(uuid, uuid, bigint, text, text) to anon, authenticated;

drop function if exists public.jornada_outbox_complete_signed(uuid, uuid, text, text, text);
create or replace function public.jornada_outbox_complete_signed(
  _id uuid, _lease uuid, _status text, _epoch bigint, _nonce text, _sig text,
  _error text default null, _receipt text default null)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if _status not in ('sent','failed','blocked') then raise exception 'ESTADO_INVALIDO'; end if;
  if _error is not null and _error !~ '^[a-z_]{1,40}$' then raise exception 'CODIGO_INVALIDO'; end if;
  if _receipt is not null and _receipt not in ('received','duplicate') then raise exception 'RECIBO_INVALIDO'; end if;
  if not jornada_events.proof_valid('complete', _id::text || ':' || _lease::text || ':' || _status,
                                    _epoch, _nonce, _sig) then
    raise exception 'PROVA_INVALIDA' using errcode = '42501';
  end if;
  return public.jornada_outbox_complete(_id, _lease, _error is not null and false or _status, _error, _receipt);
end; $$;
grant execute on function public.jornada_outbox_complete_signed(uuid, uuid, text, bigint, text, text, text, text) to anon, authenticated;

-- 7. Rotinas internas nunca expostas diretamente
revoke all on function public.jornada_outbox_claim(integer, integer) from public, anon, authenticated;
revoke all on function public.jornada_outbox_complete(uuid, uuid, text, text, text) from public, anon, authenticated;

-- 8. Endereço publicado real do trabalhador
update jornada_events.config
   set worker_url = 'https://jf-bio-insight.lovable.app/api/public/hooks/jornada-outbox',
       updated_at = now()
 where singleton;

-- 9. Situação inclui o preparo da chave de prova
create or replace function public.jornada_outbox_settings()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_cfg jornada_events.config%rowtype; v_intake text; v_job boolean; v_key boolean;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  select * into v_cfg from jornada_events.config where singleton;
  select location_id into v_intake from public.intake_automation where singleton and enabled;
  select active into v_job from cron.job where jobname = 'jornada-outbox-tick';
  select exists (select 1 from vault.decrypted_secrets where name = 'jornada_outbox_claim') into v_key;
  return jsonb_build_object(
    'enabled', coalesce(v_cfg.enabled, false),
    'activated_at', v_cfg.activated_at,
    'first_activated_at', v_cfg.first_activated_at,
    'reconciled_at', v_cfg.reconciled_at,
    'location_id', coalesce(v_cfg.location_id, ''),
    'job_active', coalesce(v_job, false),
    'key_ready', coalesce(v_key, false),
    'config_ok', coalesce(v_intake, '') <> ''
      and (coalesce(v_cfg.location_id, '') = '' or v_cfg.location_id = v_intake)
      and coalesce(v_key, false),
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