-- Liga a análise ao atendimento sem alterar o acesso às jornadas existentes.
ALTER TABLE public.jornadas_clinicas
  ADD COLUMN consultation_id uuid REFERENCES public.consultations(id) ON DELETE RESTRICT,
  ADD COLUMN source_draft_version integer,
  ADD COLUMN source_received_id uuid REFERENCES public.anamnesis_submissions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT jornada_consultation_source CHECK (
    (consultation_id IS NULL AND source_draft_version IS NULL AND source_received_id IS NULL)
    OR (consultation_id IS NOT NULL AND source_draft_version IS NOT NULL AND source_draft_version >= 0)
  );
CREATE UNIQUE INDEX jornadas_owner_consultation_unique
  ON public.jornadas_clinicas(owner_id, consultation_id) WHERE consultation_id IS NOT NULL;

-- O lock também serializa uma nova resposta com a leitura/aprovação da análise.
CREATE FUNCTION public.lock_anamnesis_consultation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.consultation_drafts WHERE consultation_id = NEW.consultation_id FOR UPDATE;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_anamnesis_consultation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER anamnesis_consultation_lock BEFORE INSERT ON public.anamnesis_submissions
FOR EACH ROW EXECUTE FUNCTION public.lock_anamnesis_consultation();

CREATE FUNCTION public.check_journey_consultation_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_version integer; v_received uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.consultation_id IS DISTINCT FROM NEW.consultation_id THEN
    RAISE EXCEPTION 'Não é permitido trocar o atendimento de uma análise.';
  END IF;
  IF NEW.consultation_id IS NULL THEN RETURN NEW; END IF;
  SELECT version INTO v_version FROM public.consultation_drafts
    WHERE consultation_id = NEW.consultation_id FOR UPDATE;
  SELECT id INTO v_received FROM public.anamnesis_submissions
    WHERE consultation_id = NEW.consultation_id ORDER BY confirmed_at DESC, id DESC LIMIT 1;
  IF v_version IS NULL OR NEW.source_draft_version IS DISTINCT FROM v_version
     OR NEW.source_received_id IS DISTINCT FROM v_received THEN
    RAISE EXCEPTION 'A consulta recebeu novos dados. Atualize a análise pela Consulta do paciente antes de continuar.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_journey_consultation_source() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER journey_consultation_source BEFORE INSERT OR UPDATE ON public.jornadas_clinicas
FOR EACH ROW EXECUTE FUNCTION public.check_journey_consultation_source();

-- Escrita restrita e transacional. Não concede INSERT/UPDATE diretos na tabela.
-- Repetir a abertura devolve a mesma análise do profissional, sem sobrescrever conteúdo.
CREATE FUNCTION public.open_consultation_journey(
  _consultation_id uuid, _draft_version integer, _received_id uuid,
  _anamnese jsonb, _bio jsonb, _content_hash text,
  _refresh_id uuid DEFAULT NULL, _expected_version integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_name text; v_draft integer; v_received uuid;
  v_row public.jornadas_clinicas%ROWTYPE;
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito: apenas administradores.' USING ERRCODE = '42501';
  END IF;
  SELECT patient_name INTO v_name FROM public.consultations WHERE id = _consultation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consulta não encontrada.'; END IF;
  -- Mesmo lock/ordem das aprovações: primeiro jornada, depois fonte.
  SELECT * INTO v_row FROM public.jornadas_clinicas
    WHERE owner_id = v_user AND consultation_id = _consultation_id FOR UPDATE;
  IF FOUND AND _refresh_id IS NULL THEN RETURN to_jsonb(v_row); END IF;
  IF _refresh_id IS NOT NULL AND (v_row.id IS DISTINCT FROM _refresh_id
     OR v_row.version IS DISTINCT FROM _expected_version) THEN
    RAISE EXCEPTION 'A análise mudou. Reabra a consulta antes de atualizar.';
  END IF;
  SELECT version INTO v_draft FROM public.consultation_drafts
    WHERE consultation_id = _consultation_id FOR UPDATE;
  SELECT id INTO v_received FROM public.anamnesis_submissions
    WHERE consultation_id = _consultation_id ORDER BY confirmed_at DESC, id DESC LIMIT 1;
  IF v_draft IS NULL OR v_draft IS DISTINCT FROM _draft_version OR v_received IS DISTINCT FROM _received_id THEN
    RAISE EXCEPTION 'A consulta mudou. Reabra a consulta para usar os dados atuais.';
  END IF;
  IF jsonb_typeof(_anamnese) IS DISTINCT FROM 'object' OR jsonb_typeof(_bio) IS DISTINCT FROM 'object'
     OR length(_anamnese::text) > 256000 OR length(_bio::text) > 256000
     OR _content_hash IS NULL OR _content_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Dados da análise inválidos.';
  END IF;
  IF _refresh_id IS NOT NULL THEN
    UPDATE public.jornadas_clinicas SET
      patient_name = v_name, anamnese = _anamnese, bio = _bio, protocolo = NULL,
      confirmations = '{"anamnese":false,"bio":false,"revisao":false}',
      status = 'anamnese', version = version + 1, content_hash = _content_hash,
      approved_version = NULL, approved_at = NULL, approved_by = NULL, approved_hash = NULL,
      source_draft_version = _draft_version, source_received_id = _received_id
    WHERE id = _refresh_id AND owner_id = v_user RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.jornadas_clinicas(owner_id, patient_name, consultation_id,
      source_draft_version, source_received_id, anamnese, bio, content_hash, confirmations)
    VALUES(v_user, v_name, _consultation_id, _draft_version, _received_id,
      _anamnese, _bio, _content_hash, '{"anamnese":false,"bio":false,"revisao":false}')
    ON CONFLICT (owner_id, consultation_id) WHERE consultation_id IS NOT NULL DO NOTHING
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
      SELECT * INTO v_row FROM public.jornadas_clinicas
        WHERE owner_id = v_user AND consultation_id = _consultation_id;
    END IF;
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.open_consultation_journey(uuid,integer,uuid,jsonb,jsonb,text,uuid,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_consultation_journey(uuid,integer,uuid,jsonb,jsonb,text,uuid,integer)
  TO authenticated;