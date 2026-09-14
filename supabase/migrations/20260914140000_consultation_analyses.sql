BEGIN;

-- All operations use the authenticated user's permissions and RLS.
CREATE FUNCTION public.clinical_analysis_source(_consultation_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE source jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'consultation', jsonb_build_object('id', c.id, 'patient_id', c.patient_id, 'patient_name', c.patient_name, 'consultation_date', c.consultation_date),
    'draft', jsonb_build_object('version', d.version, 'anamnesis_id', d.anamnesis_id, 'body_composition', d.body_composition, 'clinical_data', d.clinical_data),
    'anamnesis', jsonb_build_object('id', s.id, 'answers', s.answers, 'confirmed_at', s.confirmed_at, 'accepted', s.accepted)
  ) INTO source FROM public.consultations c
  JOIN public.consultation_drafts d ON d.consultation_id = c.id
  JOIN public.anamnesis_submissions s ON s.id = d.anamnesis_id AND s.consultation_id = c.id
  WHERE c.id = _consultation_id;
  RETURN source;
END;
$$;

CREATE TABLE public.consultation_analyses (
  id uuid PRIMARY KEY,
  consultation_id uuid NOT NULL REFERENCES public.consultations(id),
  anamnesis_id uuid NOT NULL,
  source_version integer NOT NULL CHECK (source_version >= 0),
  source_hash text NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 100),
  prompt_version text NOT NULL CHECK (char_length(prompt_version) BETWEEN 1 AND 100),
  goal text NOT NULL CHECK (goal IN ('analise','emagrecimento','recomposicao','hipertrofia')),
  professional_instructions text NOT NULL DEFAULT '' CHECK (char_length(professional_instructions) <= 3000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','draft','failed','stale')),
  result jsonb CHECK (result IS NULL OR (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 40000)),
  error_code text CHECK (error_code IN ('credentials','quota','timeout','invalid_response','unavailable','interrupted','stale')),
  CHECK ((status = 'draft' AND result IS NOT NULL AND error_code IS NULL) OR (status <> 'draft' AND result IS NULL)),
  FOREIGN KEY (anamnesis_id, consultation_id) REFERENCES public.anamnesis_submissions(id, consultation_id)
);
CREATE INDEX consultation_analyses_history ON public.consultation_analyses(consultation_id, created_at DESC);
CREATE INDEX consultation_analyses_quota ON public.consultation_analyses(created_by, created_at DESC);
ALTER TABLE public.consultation_analyses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consultation_analyses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.consultation_analyses TO authenticated;
GRANT INSERT (id, consultation_id, anamnesis_id, source_version, source_hash, model, prompt_version, goal, professional_instructions) ON public.consultation_analyses TO authenticated;
GRANT UPDATE (status, result, error_code) ON public.consultation_analyses TO authenticated;
CREATE POLICY analysis_admin_read ON public.consultation_analyses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY analysis_admin_insert ON public.consultation_analyses FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY analysis_admin_finish ON public.consultation_analyses FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (created_by = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE FUNCTION public.guard_consultation_analysis() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE source jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Serializes generations per consultation and hourly quota per administrator,
    -- including direct inserts. No caller can set the timestamp or author.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.consultation_id::text, 1));
    PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 2));
    IF (SELECT count(*) FROM public.consultation_analyses WHERE created_by = auth.uid() AND created_at > now() - interval '1 hour') >= 10 THEN
      RAISE EXCEPTION 'Limite de dez análises por hora atingido.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.consultation_analyses WHERE consultation_id = NEW.consultation_id AND status = 'pending' AND created_at > now() - interval '5 minutes') THEN
      RAISE EXCEPTION 'Já existe uma análise em andamento nesta consulta.' USING ERRCODE = 'P0002';
    END IF;
    source := public.clinical_analysis_source(NEW.consultation_id);
    IF source IS NULL OR (source #>> '{draft,version}')::integer <> NEW.source_version
      OR source #>> '{anamnesis,id}' <> NEW.anamnesis_id::text
      OR source #> '{draft,body_composition}' = 'null'::jsonb THEN
      RAISE EXCEPTION 'Carregue a anamnese e salve o exame antes da análise.' USING ERRCODE = 'P0003';
    END IF;
    IF NEW.source_hash <> encode(sha256(convert_to(source::text, 'UTF8')), 'hex') THEN
      RAISE EXCEPTION 'Os dados da consulta foram alterados.' USING ERRCODE = 'P0003';
    END IF;
  ELSE
    IF OLD.status <> 'pending' OR NEW.status NOT IN ('draft','failed','stale') THEN
      RAISE EXCEPTION 'Esta análise já foi concluída.' USING ERRCODE = 'P0003';
    END IF;
    IF NEW.status = 'draft' THEN
      -- Lock the source draft while validating and committing the result.
      PERFORM 1 FROM public.consultation_drafts WHERE consultation_id = OLD.consultation_id FOR UPDATE;
      source := public.clinical_analysis_source(OLD.consultation_id);
      IF source IS NULL OR OLD.source_hash <> encode(sha256(convert_to(source::text, 'UTF8')), 'hex') THEN
        NEW.status := 'stale'; NEW.result := NULL; NEW.error_code := 'stale';
      ELSIF OLD.created_at < now() - interval '5 minutes' THEN
        NEW.status := 'failed'; NEW.result := NULL; NEW.error_code := 'interrupted';
      END IF;
    END IF;
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_consultation_analysis BEFORE INSERT OR UPDATE ON public.consultation_analyses
  FOR EACH ROW EXECUTE FUNCTION public.guard_consultation_analysis();

CREATE FUNCTION public.begin_consultation_analysis(
  _id uuid, _consultation_id uuid, _expected_version integer, _model text,
  _prompt_version text, _goal text, _professional_instructions text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE source jsonb; existing public.consultation_analyses%ROWTYPE; inserted public.consultation_analyses%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_consultation_id::text, 1));
  SELECT * INTO existing FROM public.consultation_analyses WHERE id = _id;
  IF FOUND THEN
    IF existing.created_by <> auth.uid() OR existing.consultation_id <> _consultation_id
      OR existing.source_version <> _expected_version OR existing.goal <> _goal
      OR existing.professional_instructions <> _professional_instructions THEN
      RAISE EXCEPTION 'Identificador de análise já utilizado.' USING ERRCODE = 'P0003';
    END IF;
    RETURN jsonb_build_object('created', false, 'analysis', to_jsonb(existing));
  END IF;
  source := public.clinical_analysis_source(_consultation_id);
  IF source IS NULL OR (source #>> '{draft,version}')::integer <> _expected_version THEN
    RAISE EXCEPTION 'Reabra a consulta e confira os dados salvos.' USING ERRCODE = 'P0003';
  END IF;
  INSERT INTO public.consultation_analyses(id, consultation_id, anamnesis_id, source_version, source_hash, model, prompt_version, goal, professional_instructions)
    VALUES (_id, _consultation_id, (source #>> '{anamnesis,id}')::uuid, _expected_version,
      encode(sha256(convert_to(source::text, 'UTF8')), 'hex'), _model, _prompt_version, _goal, _professional_instructions)
    RETURNING * INTO inserted;
  RETURN jsonb_build_object('created', true, 'analysis', to_jsonb(inserted), 'source', source);
END;
$$;

CREATE FUNCTION public.list_consultation_analyses(_consultation_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE source jsonb; fingerprint text; records jsonb;
BEGIN
  source := public.clinical_analysis_source(_consultation_id);
  fingerprint := encode(sha256(convert_to(source::text, 'UTF8')), 'hex');
  SELECT coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('is_current', coalesce(a.source_hash = fingerprint, false)) ORDER BY a.created_at DESC), '[]'::jsonb)
    INTO records FROM (SELECT * FROM public.consultation_analyses WHERE consultation_id = _consultation_id ORDER BY created_at DESC LIMIT 10) a;
  RETURN records;
END;
$$;
REVOKE ALL ON FUNCTION public.clinical_analysis_source(uuid), public.guard_consultation_analysis(), public.begin_consultation_analysis(uuid,uuid,integer,text,text,text,text), public.list_consultation_analyses(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinical_analysis_source(uuid), public.begin_consultation_analysis(uuid,uuid,integer,text,text,text,text), public.list_consultation_analyses(uuid) TO authenticated;
COMMIT;
