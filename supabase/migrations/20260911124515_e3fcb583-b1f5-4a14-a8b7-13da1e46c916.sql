-- =========================================================
-- Nova jornada clínica (isolada dos relatórios existentes)
-- =========================================================

CREATE TABLE public.jornadas_clinicas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  patient_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'anamnese',
  version integer NOT NULL DEFAULT 1,
  anamnese jsonb NOT NULL DEFAULT '{}'::jsonb,
  bio jsonb NOT NULL DEFAULT '{}'::jsonb,
  protocolo jsonb,
  internal_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmations jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL DEFAULT '',
  approved_version integer,
  approved_at timestamp with time zone,
  approved_by uuid,
  approved_hash text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jornadas_clinicas TO authenticated;
GRANT ALL ON public.jornadas_clinicas TO service_role;

ALTER TABLE public.jornadas_clinicas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin owner can view own journeys"
  ON public.jornadas_clinicas FOR SELECT TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin owner can create journeys"
  ON public.jornadas_clinicas FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin owner can update own journeys"
  ON public.jornadas_clinicas FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin owner can delete own journeys"
  ON public.jornadas_clinicas FOR DELETE TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE INDEX jornadas_clinicas_owner_updated_idx
  ON public.jornadas_clinicas (owner_id, updated_at DESC);

-- Histórico de aprovações: leitura pelo dono; escrita apenas pelo servidor.
CREATE TABLE public.jornada_aprovacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jornada_id uuid NOT NULL REFERENCES public.jornadas_clinicas(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  version integer NOT NULL,
  content_hash text NOT NULL,
  approved_by uuid NOT NULL,
  approved_at timestamp with time zone NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.jornada_aprovacoes TO authenticated;
GRANT ALL ON public.jornada_aprovacoes TO service_role;

ALTER TABLE public.jornada_aprovacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin owner can view own approvals"
  ON public.jornada_aprovacoes FOR SELECT TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE INDEX jornada_aprovacoes_jornada_idx
  ON public.jornada_aprovacoes (jornada_id, version DESC);

-- Trigger de updated_at + incremento de versão a cada alteração de conteúdo.
CREATE OR REPLACE FUNCTION public.jornadas_clinicas_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER jornadas_clinicas_touch_trigger
  BEFORE UPDATE ON public.jornadas_clinicas
  FOR EACH ROW EXECUTE FUNCTION public.jornadas_clinicas_touch();

-- Aprovação atómica: só o servidor (service_role) pode chamar.
CREATE OR REPLACE FUNCTION public.aprovar_jornada(
  _jornada_id uuid,
  _user_id uuid,
  _expected_version integer,
  _content_hash text,
  _snapshot jsonb
)
RETURNS TABLE (approved_version integer, approved_at timestamp with time zone, content_hash text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.jornadas_clinicas%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.jornadas_clinicas
  WHERE id = _jornada_id AND owner_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JORNADA_NAO_ENCONTRADA';
  END IF;

  IF v_row.version <> _expected_version THEN
    RAISE EXCEPTION 'VERSAO_DESATUALIZADA';
  END IF;

  IF v_row.content_hash <> _content_hash THEN
    RAISE EXCEPTION 'CONTEUDO_ALTERADO';
  END IF;

  UPDATE public.jornadas_clinicas
     SET approved_version = v_row.version,
         approved_hash = v_row.content_hash,
         approved_by = _user_id,
         approved_at = now(),
         status = 'aprovado'
   WHERE id = _jornada_id;

  INSERT INTO public.jornada_aprovacoes
    (jornada_id, owner_id, version, content_hash, approved_by, snapshot)
  VALUES
    (_jornada_id, v_row.owner_id, v_row.version, v_row.content_hash, _user_id, _snapshot);

  RETURN QUERY
    SELECT j.approved_version, j.approved_at, j.content_hash
    FROM public.jornadas_clinicas j WHERE j.id = _jornada_id;
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_jornada(uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprovar_jornada(uuid, uuid, integer, text, jsonb) TO service_role;