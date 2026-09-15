INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role FROM auth.users u
WHERE lower(u.email) = 'ffmconsultoria@gmail.com' AND u.email_confirmed_at IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;