BEGIN;

-- Narrow capability-based entry points. Existing table policies/grants are unchanged.
CREATE TABLE public.intake_automation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  location_id text NOT NULL,
  workflow_id uuid NOT NULL,
  secret_hash text NOT NULL CHECK (secret_hash ~ '^[a-f0-9]{64}$'),
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ghl_patient_links (
  location_id text NOT NULL,
  contact_id text NOT NULL,
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  PRIMARY KEY (location_id, contact_id)
);
CREATE TABLE public.intake_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  contact_id text NOT NULL,
  appointment_id text NOT NULL,
  appointment_start timestamptz NOT NULL,
  consultation_id uuid NOT NULL UNIQUE REFERENCES public.consultations(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  submitted_at timestamptz,
  submission_id uuid UNIQUE REFERENCES public.anamnesis_submissions(id),
  UNIQUE(location_id, appointment_id, appointment_start),
  CHECK ((submitted_at IS NULL) = (submission_id IS NULL))
);
CREATE INDEX intake_invitations_quota ON public.intake_invitations(created_at);
ALTER TABLE public.intake_automation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_patient_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.intake_automation, public.ghl_patient_links, public.intake_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT (singleton,location_id,workflow_id,enabled,updated_at) ON public.intake_automation TO authenticated;
GRANT SELECT ON public.ghl_patient_links TO authenticated;
GRANT SELECT (id,location_id,contact_id,appointment_id,appointment_start,consultation_id,created_at,expires_at,revoked_at,submitted_at,submission_id) ON public.intake_invitations TO authenticated;
CREATE POLICY intake_config_admin_read ON public.intake_automation FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY intake_links_admin_read ON public.ghl_patient_links FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY intake_invites_admin_read ON public.intake_invitations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- A confirmed invitation is attributed to that invitation, never to a fabricated user.
ALTER TABLE public.anamnesis_submissions ALTER COLUMN submitted_by DROP NOT NULL;
ALTER TABLE public.anamnesis_submissions ADD COLUMN invitation_id uuid UNIQUE REFERENCES public.intake_invitations(id);
ALTER TABLE public.anamnesis_submissions ADD CONSTRAINT anamnesis_attribution CHECK (
  (submitted_by IS NOT NULL AND invitation_id IS NULL) OR (submitted_by IS NULL AND invitation_id IS NOT NULL)
);

CREATE FUNCTION public.configure_intake_automation(_location_id text, _workflow_id uuid, _secret_hash text, _enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Acesso restrito.' USING ERRCODE='42501';
  END IF;
  IF _enabled IS FALSE THEN UPDATE public.intake_automation SET enabled=false,updated_by=auth.uid(),updated_at=now(); RETURN; END IF;
  IF _location_id !~ '^[a-zA-Z0-9_-]{10,100}$' OR _secret_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Configuração inválida.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.intake_automation(location_id,workflow_id,secret_hash,enabled,updated_by)
    VALUES(_location_id,_workflow_id,_secret_hash,_enabled,auth.uid())
    ON CONFLICT(singleton) DO UPDATE SET location_id=excluded.location_id, workflow_id=excluded.workflow_id,
      secret_hash=excluded.secret_hash, enabled=excluded.enabled, updated_by=excluded.updated_by, updated_at=now();
END; $$;

-- Private helper; callers cannot invoke it directly or read the stored digest.
CREATE FUNCTION public.check_intake_key(_secret text, _location_id text DEFAULT NULL, _workflow_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(_secret ~ '^[a-f0-9]{64}$' AND EXISTS (
    SELECT 1 FROM public.intake_automation a WHERE a.enabled
      AND a.secret_hash=encode(sha256(convert_to(_secret,'UTF8')),'hex')
      AND (_location_id IS NULL OR a.location_id=_location_id)
      AND (_workflow_id IS NULL OR a.workflow_id=_workflow_id)
  ), false);
$$;

CREATE FUNCTION public.issue_intake_invitation(
  _secret text, _location_id text, _workflow_id uuid, _contact_id text, _appointment_id text,
  _appointment_start timestamptz, _consultation_date date, _name text, _email text, _token_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation public.intake_invitations%ROWTYPE; pid uuid; cid uuid; old_name text;
BEGIN
  IF NOT public.check_intake_key(_secret,_location_id,_workflow_id) THEN
    RAISE EXCEPTION 'Integração não autorizada.' USING ERRCODE='42501';
  END IF;
  IF _contact_id IS NULL OR _contact_id !~ '^[a-zA-Z0-9_-]{10,100}$'
    OR _appointment_id IS NULL OR _appointment_id !~ '^[a-zA-Z0-9_-]{10,100}$'
    OR _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 2 AND 150
    OR _email IS NULL OR char_length(_email)>254 OR _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$'
    OR _appointment_start IS NULL OR _appointment_start <= now() OR _appointment_start > now()+interval '1 year'
    OR _consultation_date IS NULL OR abs(_consultation_date - (_appointment_start AT TIME ZONE 'UTC')::date)>1 THEN
    RAISE EXCEPTION 'Dados do convite inválidos.' USING ERRCODE='22023';
  END IF;
  -- Serializes quota, contact mapping and appointment retries in the same transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended('bioreport-intake-issue',0));
  IF EXISTS(SELECT 1 FROM public.intake_invitations WHERE location_id=_location_id AND appointment_id=_appointment_id AND contact_id<>_contact_id) THEN
    RAISE EXCEPTION 'Agendamento vinculado a outro contato.' USING ERRCODE='P0003';
  END IF;
  SELECT * INTO invitation FROM public.intake_invitations
    WHERE location_id=_location_id AND appointment_id=_appointment_id AND appointment_start=_appointment_start FOR UPDATE;
  IF FOUND THEN
    IF invitation.revoked_at IS NOT NULL OR invitation.expires_at<=now() OR invitation.token_hash<>_token_hash THEN
      RAISE EXCEPTION 'Convite indisponível. Peça revisão à clínica.' USING ERRCODE='P0003';
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM public.consultations c
      JOIN public.ghl_patient_links g ON g.patient_id=c.patient_id
      JOIN public.patients p ON p.id=c.patient_id
      WHERE c.id=invitation.consultation_id AND g.location_id=_location_id AND g.contact_id=_contact_id
        AND lower(btrim(c.patient_name))=lower(btrim(_name))
        AND lower(btrim(p.name))=lower(btrim(_name)) AND c.consultation_date=_consultation_date
    ) THEN
      RAISE EXCEPTION 'Dados do paciente alterados. Confira o vínculo.' USING ERRCODE='P0003';
    END IF;
    RETURN jsonb_build_object('status',CASE WHEN invitation.submitted_at IS NULL THEN 'pending' ELSE 'submitted' END,
      'consultation_id',invitation.consultation_id,'expires_at',invitation.expires_at);
  END IF;
  IF (SELECT count(*) FROM public.intake_invitations WHERE created_at>now()-interval '1 hour')>=100 THEN
    RAISE EXCEPTION 'Limite de convites atingido.' USING ERRCODE='P0001';
  END IF;
  SELECT patient_id INTO pid FROM public.ghl_patient_links WHERE location_id=_location_id AND contact_id=_contact_id;
  IF pid IS NULL THEN
    INSERT INTO public.patients(name,email) VALUES(btrim(_name),lower(btrim(_email))) RETURNING id INTO pid;
    INSERT INTO public.ghl_patient_links VALUES(_location_id,_contact_id,pid);
  ELSE
    SELECT name INTO old_name FROM public.patients WHERE id=pid;
    IF lower(btrim(old_name))<>lower(btrim(_name)) THEN
      RAISE EXCEPTION 'Nome do contato alterado. Confira o vínculo.' USING ERRCODE='P0003';
    END IF;
  END IF;
  -- Rescheduling creates a new consultation; the earlier clinical record is preserved.
  UPDATE public.intake_invitations SET revoked_at=now()
    WHERE location_id=_location_id AND appointment_id=_appointment_id AND submitted_at IS NULL AND revoked_at IS NULL;
  INSERT INTO public.consultations(patient_id,patient_name,consultation_date,invite_email)
    VALUES(pid,btrim(_name),_consultation_date,'') RETURNING id INTO cid;
  INSERT INTO public.consultation_drafts(consultation_id) VALUES(cid);
  INSERT INTO public.intake_invitations(location_id,contact_id,appointment_id,appointment_start,consultation_id,token_hash,expires_at)
    VALUES(_location_id,_contact_id,_appointment_id,_appointment_start,cid,_token_hash,least(now()+interval '14 days',_appointment_start+interval '1 day'))
    RETURNING * INTO invitation;
  RETURN jsonb_build_object('status','pending','consultation_id',cid,'expires_at',invitation.expires_at);
END; $$;

CREATE FUNCTION public.resolve_intake_invitation(_secret text, _token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation public.intake_invitations%ROWTYPE; c public.consultations%ROWTYPE;
BEGIN
  IF NOT public.check_intake_key(_secret) OR _token IS NULL OR _token !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Convite indisponível.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO invitation FROM public.intake_invitations
    WHERE token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex') AND revoked_at IS NULL AND expires_at>now();
  IF NOT FOUND OR NOT public.check_intake_key(_secret,invitation.location_id) THEN RAISE EXCEPTION 'Convite indisponível.' USING ERRCODE='42501'; END IF;
  IF invitation.submitted_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','submitted','confirmed_at',invitation.submitted_at);
  END IF;
  SELECT * INTO c FROM public.consultations WHERE id=invitation.consultation_id;
  RETURN jsonb_build_object('status','pending','consultation_id',c.id,'patient_name',c.patient_name,
    'consultation_date',c.consultation_date,'expires_at',invitation.expires_at);
END; $$;

CREATE FUNCTION public.submit_intake_invitation(_secret text, _token text, _id uuid, _answers jsonb, _name text, _accepted boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation public.intake_invitations%ROWTYPE; prior public.anamnesis_submissions%ROWTYPE; c public.consultations%ROWTYPE;
BEGIN
  IF NOT public.check_intake_key(_secret) OR _token IS NULL OR _token !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Convite indisponível.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO invitation FROM public.intake_invitations WHERE token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex')
    AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND OR NOT public.check_intake_key(_secret,invitation.location_id) THEN RAISE EXCEPTION 'Convite indisponível.' USING ERRCODE='42501'; END IF;
  IF _id IS NULL OR _accepted IS DISTINCT FROM true OR _answers IS NULL OR jsonb_typeof(_answers)<>'object'
    OR octet_length(_answers::text)>100000 OR _name IS NULL OR char_length(btrim(_name)) NOT BETWEEN 3 AND 150 THEN
    RAISE EXCEPTION 'Confirmação inválida.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO c FROM public.consultations WHERE id=invitation.consultation_id;
  IF lower(btrim(coalesce(_answers->>'patientName','')))<>lower(btrim(c.patient_name))
    OR _answers->>'consultationDate' IS DISTINCT FROM c.consultation_date::text THEN
    RAISE EXCEPTION 'Identidade ou data divergente.' USING ERRCODE='22023';
  END IF;
  IF invitation.submitted_at IS NOT NULL THEN
    SELECT * INTO prior FROM public.anamnesis_submissions WHERE id=invitation.submission_id;
    IF prior.id<>_id OR prior.answers<>_answers OR prior.confirmed_name<>btrim(_name) THEN
      RAISE EXCEPTION 'Este convite já foi respondido.' USING ERRCODE='P0003';
    END IF;
    RETURN jsonb_build_object('confirmed_at',prior.confirmed_at);
  END IF;
  INSERT INTO public.anamnesis_submissions(id,consultation_id,answers,confirmed_name,accepted,submitted_by,invitation_id)
    VALUES(_id,c.id,_answers,btrim(_name),true,NULL,invitation.id) RETURNING * INTO prior;
  UPDATE public.intake_invitations SET submitted_at=prior.confirmed_at,submission_id=prior.id WHERE id=invitation.id;
  RETURN jsonb_build_object('confirmed_at',prior.confirmed_at);
END; $$;

CREATE FUNCTION public.revoke_intake_invitation(_consultation_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Acesso restrito.' USING ERRCODE='42501'; END IF;
  UPDATE public.intake_invitations SET revoked_at=coalesce(revoked_at,now()) WHERE consultation_id=_consultation_id;
END; $$;

REVOKE ALL ON FUNCTION public.check_intake_key(text,text,uuid), public.configure_intake_automation(text,uuid,text,boolean),
 public.issue_intake_invitation(text,text,uuid,text,text,timestamptz,date,text,text,text), public.resolve_intake_invitation(text,text),
 public.submit_intake_invitation(text,text,uuid,jsonb,text,boolean), public.revoke_intake_invitation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_intake_automation(text,uuid,text,boolean), public.revoke_intake_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_intake_invitation(text,text,uuid,text,text,timestamptz,date,text,text,text),
 public.resolve_intake_invitation(text,text), public.submit_intake_invitation(text,text,uuid,jsonb,text,boolean) TO anon;
COMMIT;
