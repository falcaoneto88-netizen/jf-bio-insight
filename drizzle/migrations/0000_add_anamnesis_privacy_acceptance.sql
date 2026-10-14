-- Aceitação da Política de Privacidade no envio da anamnese.
-- Aditivo: nenhuma coluna existente é alterada, renomeada ou removida;
-- nenhuma política de segurança, concessão de leitura ou linha existente é tocada.
-- Registros anteriores permanecem com as colunas novas em branco e continuam válidos.

ALTER TABLE public.anamnesis_submissions
  ADD COLUMN IF NOT EXISTS privacy_policy_version text,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz;

COMMENT ON COLUMN public.anamnesis_submissions.privacy_policy_version IS
  'Versão da Política de Privacidade aceita por quem confirmou; em branco nos registros anteriores a 14/10/2026.';
COMMENT ON COLUMN public.anamnesis_submissions.privacy_accepted_at IS
  'Momento em que a aceitação da Política de Privacidade foi registrada.';

-- As duas marcas andam juntas: não existe aceitação sem data nem data sem versão.
ALTER TABLE public.anamnesis_submissions
  DROP CONSTRAINT IF EXISTS anamnesis_privacy_pair,
  ADD CONSTRAINT anamnesis_privacy_pair CHECK (
    (privacy_policy_version IS NULL) = (privacy_accepted_at IS NULL)
  ) NOT VALID;
ALTER TABLE public.anamnesis_submissions
  VALIDATE CONSTRAINT anamnesis_privacy_pair;

-- O fluxo antigo confirma pelo cliente autenticado, que só tem INSERT por colunas.
GRANT INSERT (privacy_policy_version, privacy_accepted_at) ON public.anamnesis_submissions TO authenticated;

-- Nova variante do envio por convite: mesma validação de chave, token, vínculo e
-- identidade da função atual, gravando também a versão da política aceita.
-- A função de seis parâmetros permanece no ar intacta para o build já publicado.
CREATE FUNCTION public.submit_intake_invitation(_secret text, _token text, _id uuid, _answers jsonb, _name text, _accepted boolean, _privacy_version text)
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
  IF _privacy_version IS NULL OR char_length(btrim(_privacy_version)) NOT BETWEEN 8 AND 64 THEN
    RAISE EXCEPTION 'Aceitação da Política de Privacidade ausente.' USING ERRCODE='22023';
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
  INSERT INTO public.anamnesis_submissions(id,consultation_id,answers,confirmed_name,accepted,submitted_by,invitation_id,privacy_policy_version,privacy_accepted_at)
    VALUES(_id,c.id,_answers,btrim(_name),true,NULL,invitation.id,btrim(_privacy_version),now()) RETURNING * INTO prior;
  UPDATE public.intake_invitations SET submitted_at=prior.confirmed_at,submission_id=prior.id WHERE id=invitation.id;
  RETURN jsonb_build_object('confirmed_at',prior.confirmed_at);
END; $$;

REVOKE ALL ON FUNCTION public.submit_intake_invitation(text,text,uuid,jsonb,text,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_intake_invitation(text,text,uuid,jsonb,text,boolean,text) TO anon;

COMMENT ON FUNCTION public.submit_intake_invitation(text,text,uuid,jsonb,text,boolean) IS
  'DEPRECATED: substituída pela variante de sete parâmetros, que registra privacy_policy_version. Mantida apenas enquanto o build publicado chama a forma antiga.';
