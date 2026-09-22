create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create schema if not exists jornada_events;
revoke all on schema jornada_events from public;
revoke usage on schema jornada_events from anon, authenticated;

create table if not exists jornada_events.config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  activated_at timestamptz not null default now(),
  location_id text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists jornada_events.outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('anamnese_recebida')),
  record_id uuid not null,
  consultation_id uuid not null,
  scope_location_id text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','blocked')),
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_attempt_at timestamptz,
  last_error_code text,
  sent_at timestamptz,
  receipt_status text,
  enqueued_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_type, record_id, scope_location_id)
);
create index if not exists jornada_outbox_due_idx on jornada_events.outbox (status, next_attempt_at);
create index if not exists jornada_outbox_consultation_idx on jornada_events.outbox (consultation_id);

revoke all on all tables in schema jornada_events from public, anon, authenticated;

insert into jornada_events.config (singleton, enabled, location_id)
values (true, false, coalesce((select location_id from public.intake_automation where singleton), ''))
on conflict (singleton) do nothing;

-- Gatilho: registra apenas identificadores, nunca chama rede e nunca bloqueia o salvamento.
create or replace function public.jornada_enqueue_anamnese()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_cfg jornada_events.config%rowtype;
begin
  begin
    if new.accepted is not true then return null; end if;
    select * into v_cfg from jornada_events.config where singleton;
    if not found or v_cfg.enabled is not true or coalesce(v_cfg.location_id,'') = '' then return null; end if;
    if new.confirmed_at is null or new.confirmed_at < v_cfg.activated_at then return null; end if;
    insert into jornada_events.outbox (event_type, record_id, consultation_id, scope_location_id)
    values ('anamnese_recebida', new.id, new.consultation_id, v_cfg.location_id)
    on conflict (event_type, record_id, scope_location_id) do nothing;
  exception when others then
    return null;
  end;
  return null;
end;
$$;

drop trigger if exists jornada_enqueue_anamnese on public.anamnesis_submissions;
create trigger jornada_enqueue_anamnese
after insert on public.anamnesis_submissions
for each row execute function public.jornada_enqueue_anamnese();

-- Reserva de lote com validade (lease) e recuperação de trabalhador reiniciado.
create or replace function public.jornada_outbox_claim(_limit integer default 10, _lease_seconds integer default 120)
returns table(id uuid, event_type text, record_id uuid, consultation_id uuid, scope_location_id text, attempts integer, lease_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare v_token uuid := gen_random_uuid();
begin
  update jornada_events.outbox o
     set status = 'pending', lease_token = null, lease_until = null, updated_at = now()
   where o.status = 'sending' and o.lease_until is not null and o.lease_until < now();

  return query
  with due as (
    select o.id from jornada_events.outbox o
     where o.status in ('pending','failed')
       and o.next_attempt_at <= now()
       and o.attempts < o.max_attempts
     order by o.next_attempt_at, o.enqueued_at
     limit greatest(1, least(coalesce(_limit,10), 50))
     for update skip locked
  )
  update jornada_events.outbox o
     set status = 'sending',
         lease_token = v_token,
         lease_until = now() + make_interval(secs => greatest(30, least(coalesce(_lease_seconds,120), 600))),
         attempts = o.attempts + 1,
         last_attempt_at = now(),
         updated_at = now()
    from due
   where o.id = due.id
  returning o.id, o.event_type, o.record_id, o.consultation_id, o.scope_location_id, o.attempts, o.lease_token;
end;
$$;

create or replace function public.jornada_outbox_complete(_id uuid, _lease uuid, _status text, _error text default null, _receipt text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_row jornada_events.outbox%rowtype; v_delay integer;
begin
  if _status not in ('sent','failed','blocked') then
    raise exception 'ESTADO_INVALIDO';
  end if;
  select * into v_row from jornada_events.outbox
   where id = _id and lease_token = _lease and status = 'sending' for update;
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
  else
    v_delay := least(3600, 60 * power(2, greatest(v_row.attempts - 1, 0))::integer);
    update jornada_events.outbox
       set status = 'failed', last_error_code = left(coalesce(_error,'falha'), 60),
           next_attempt_at = now() + make_interval(secs => v_delay),
           lease_token = null, lease_until = null, updated_at = now()
     where id = _id;
  end if;
  return true;
end;
$$;

-- Funções administrativas: exigem administrador autenticado.
create or replace function public.jornada_outbox_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_cfg jornada_events.config%rowtype;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  select * into v_cfg from jornada_events.config where singleton;
  return jsonb_build_object(
    'enabled', coalesce(v_cfg.enabled,false),
    'activated_at', v_cfg.activated_at,
    'location_id', coalesce(v_cfg.location_id,''),
    'pending', (select count(*) from jornada_events.outbox where status in ('pending','sending','failed')),
    'blocked', (select count(*) from jornada_events.outbox where status = 'blocked'),
    'sent', (select count(*) from jornada_events.outbox where status = 'sent')
  );
end;
$$;

create or replace function public.jornada_outbox_configure(_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_location text;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  select location_id into v_location from public.intake_automation where singleton and enabled;
  if _enabled and coalesce(v_location,'') = '' then
    raise exception 'RECEBIMENTO_DESATIVADO';
  end if;
  update jornada_events.config
     set enabled = _enabled,
         location_id = case when _enabled then v_location else location_id end,
         activated_at = case when _enabled then now() else activated_at end,
         updated_by = auth.uid(),
         updated_at = now()
   where singleton;
  return public.jornada_outbox_settings();
end;
$$;

create or replace function public.jornada_outbox_status(_consultation_ids uuid[])
returns table(consultation_id uuid, record_id uuid, status text, attempts integer, last_attempt_at timestamptz, next_attempt_at timestamptz, last_error_code text, sent_at timestamptz, outbox_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  return query
  select o.consultation_id, o.record_id, o.status, o.attempts, o.last_attempt_at,
         o.next_attempt_at, o.last_error_code, o.sent_at, o.id
    from jornada_events.outbox o
   where o.consultation_id = any(coalesce(_consultation_ids, array[]::uuid[]))
   order by o.enqueued_at desc
   limit 500;
end;
$$;

create or replace function public.jornada_outbox_retry(_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Acesso restrito.' using errcode = '42501';
  end if;
  update jornada_events.outbox
     set status = 'pending', attempts = 0, next_attempt_at = now(),
         lease_token = null, lease_until = null, updated_at = now()
   where id = _id and status in ('failed','blocked');
  return found;
end;
$$;

revoke all on function public.jornada_outbox_claim(integer, integer) from public, anon, authenticated;
revoke all on function public.jornada_outbox_complete(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.jornada_outbox_claim(integer, integer) to service_role;
grant execute on function public.jornada_outbox_complete(uuid, uuid, text, text, text) to service_role;

revoke all on function public.jornada_outbox_settings() from public, anon;
revoke all on function public.jornada_outbox_configure(boolean) from public, anon;
revoke all on function public.jornada_outbox_status(uuid[]) from public, anon;
revoke all on function public.jornada_outbox_retry(uuid) from public, anon;
grant execute on function public.jornada_outbox_settings() to authenticated, service_role;
grant execute on function public.jornada_outbox_configure(boolean) to authenticated, service_role;
grant execute on function public.jornada_outbox_status(uuid[]) to authenticated, service_role;
grant execute on function public.jornada_outbox_retry(uuid) to authenticated, service_role;