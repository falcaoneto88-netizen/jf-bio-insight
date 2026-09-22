alter table jornada_events.config
  add column if not exists worker_url text not null default 'https://project--26a42c4a-b53d-4fa2-b737-3b14bf0e0665.lovable.app/api/public/hooks/jornada-outbox';

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'jornada_outbox_worker') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'jornada_outbox_worker',
      'Credencial interna do trabalhador da fila de avisos ao Jornada AI'
    );
  end if;
end;
$$;

create or replace function public.jornada_worker_auth(_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = 'jornada_outbox_worker';
  return v is not null and _token is not null and length(_token) = length(v) and _token = v;
end;
$$;

create or replace function public.jornada_outbox_tick()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_secret text; v_url text; v_request bigint;
begin
  select worker_url into v_url from jornada_events.config where singleton and enabled;
  if v_url is null then return null; end if;
  if not exists (
    select 1 from jornada_events.outbox
     where status in ('pending','failed') and next_attempt_at <= now() and attempts < max_attempts
  ) then
    return null;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'jornada_outbox_worker';
  if v_secret is null then return null; end if;
  select net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_request;
  return v_request;
end;
$$;

revoke all on function public.jornada_worker_auth(text) from public, anon, authenticated;
revoke all on function public.jornada_outbox_tick() from public, anon, authenticated;
grant execute on function public.jornada_worker_auth(text) to service_role;
grant execute on function public.jornada_outbox_tick() to service_role;