-- Relatórios clínicos: acesso apenas com sessão de administrador.
-- Não altera dados, atribuições de papéis ou permissões de service_role.
BEGIN;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reports TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;

DROP POLICY IF EXISTS "Public can view reports" ON public.reports;
DROP POLICY IF EXISTS "Public can insert reports" ON public.reports;
DROP POLICY IF EXISTS "Public can update reports" ON public.reports;
DROP POLICY IF EXISTS "Public can delete reports" ON public.reports;

CREATE POLICY "Admins can manage reports"
ON public.reports
FOR ALL
TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

COMMIT;
