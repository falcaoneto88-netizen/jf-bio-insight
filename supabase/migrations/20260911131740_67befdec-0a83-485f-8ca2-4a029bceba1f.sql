-- Ajuste APENAS de permissões. Nenhum dado é alterado ou removido.
-- Idempotente: pode ser reaplicada sem efeitos colaterais.

-- 1) Remover políticas públicas antigas de reports, se ainda existirem.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reports'
      AND ('public' = ANY (roles) OR 'anon' = ANY (roles))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.reports', p.policyname);
  END LOOP;
END $$;

-- 2) Garantir RLS e as políticas de administrador autenticado.
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Administrators can view reports" ON public.reports;
CREATE POLICY "Administrators can view reports"
  ON public.reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Administrators can insert reports" ON public.reports;
CREATE POLICY "Administrators can insert reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Administrators can update reports" ON public.reports;
CREATE POLICY "Administrators can update reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Administrators can delete reports" ON public.reports;
CREATE POLICY "Administrators can delete reports"
  ON public.reports FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Revogar acesso anónimo/público e privilégios excessivos.
REVOKE ALL ON public.reports FROM PUBLIC;
REVOKE ALL ON public.reports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

-- 4) Papéis: sem acesso anónimo e sem escrita pelo cliente.
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_roles FROM PUBLIC;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.user_roles FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- 5) Tabelas da jornada: reforço idempotente do modelo já aplicado.
REVOKE ALL ON public.jornadas_clinicas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.jornada_aprovacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.jornadas_clinicas TO authenticated;
GRANT SELECT ON public.jornada_aprovacoes TO authenticated;
GRANT ALL ON public.jornadas_clinicas TO service_role;
GRANT ALL ON public.jornada_aprovacoes TO service_role;
REVOKE ALL ON public.journey_ai_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.journey_ai_usage TO service_role;