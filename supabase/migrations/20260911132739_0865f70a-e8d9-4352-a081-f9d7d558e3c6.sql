DROP POLICY IF EXISTS "Owner can update own journeys" ON public.jornadas_clinicas;
DROP POLICY IF EXISTS "Admin owner can update own journeys" ON public.jornadas_clinicas;
DROP POLICY IF EXISTS "Owner can insert own journeys" ON public.jornadas_clinicas;
DROP POLICY IF EXISTS "Admin owner can insert own journeys" ON public.jornadas_clinicas;
DROP POLICY IF EXISTS "Owner can delete own journeys" ON public.jornadas_clinicas;
DROP POLICY IF EXISTS "Admin owner can delete own journeys" ON public.jornadas_clinicas;
DROP POLICY IF EXISTS "Owner can insert own approvals" ON public.jornada_aprovacoes;
DROP POLICY IF EXISTS "Admin owner can insert own approvals" ON public.jornada_aprovacoes;

DROP POLICY IF EXISTS "Admin owner can view own journeys" ON public.jornadas_clinicas;
CREATE POLICY "Admin owner can view own journeys"
  ON public.jornadas_clinicas FOR SELECT TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin owner can view own approvals" ON public.jornada_aprovacoes;
CREATE POLICY "Admin owner can view own approvals"
  ON public.jornada_aprovacoes FOR SELECT TO authenticated
  USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.jornadas_clinicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_aprovacoes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.jornadas_clinicas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.jornada_aprovacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.jornadas_clinicas TO authenticated;
GRANT SELECT ON public.jornada_aprovacoes TO authenticated;
GRANT ALL ON public.jornadas_clinicas TO service_role;
GRANT ALL ON public.jornada_aprovacoes TO service_role;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.reports FROM authenticated;
REVOKE ALL ON public.reports FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

REVOKE ALL ON FUNCTION public.aprovar_jornada(uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprovar_jornada(uuid, uuid, integer, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid, integer) TO service_role;