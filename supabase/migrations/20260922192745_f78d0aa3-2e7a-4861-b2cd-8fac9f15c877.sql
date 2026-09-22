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
  return public.jornada_outbox_complete(_id, _lease, _status, _error, _receipt);
end; $$;