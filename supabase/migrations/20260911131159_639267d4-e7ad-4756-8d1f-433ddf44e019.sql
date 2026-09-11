-- Idempotente: pode ser aplicada várias vezes sem efeitos secundários.

-- 1) Permissões: cliente só lê; escrita apenas pelo backend autorizado (service_role).
REVOKE ALL ON public.jornadas_clinicas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.jornada_aprovacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.jornadas_clinicas TO authenticated;
GRANT SELECT ON public.jornada_aprovacoes TO authenticated;
GRANT ALL ON public.jornadas_clinicas TO service_role;
GRANT ALL ON public.jornada_aprovacoes TO service_role;

ALTER TABLE public.jornadas_clinicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_aprovacoes ENABLE ROW LEVEL SECURITY;

-- 2) Políticas de leitura (recriadas de forma idempotente).
DROP POLICY IF EXISTS "Admin owner can view own journeys" ON public.jornadas_clinicas;
CREATE POLICY "Admin owner can view own journeys"
ON public.jornadas_clinicas FOR SELECT TO authenticated
USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin owner can create journeys" ON public.jornadas_clinicas;
DROP POLICY IF EXISTS "Admin owner can update own journeys" ON public.jornadas_clinicas;
DROP POLICY IF EXISTS "Admin owner can delete own journeys" ON public.jornadas_clinicas;

DROP POLICY IF EXISTS "Admin owner can view own approvals" ON public.jornada_aprovacoes;
CREATE POLICY "Admin owner can view own approvals"
ON public.jornada_aprovacoes FOR SELECT TO authenticated
USING (owner_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Limite de uso de IA por utilizador e por hora.
CREATE TABLE IF NOT EXISTS public.journey_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  hour_bucket timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, hour_bucket)
);

REVOKE ALL ON public.journey_ai_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.journey_ai_usage TO service_role;
ALTER TABLE public.journey_ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No client access to ai usage" ON public.journey_ai_usage;
CREATE POLICY "No client access to ai usage"
ON public.journey_ai_usage FOR SELECT TO authenticated
USING (false);

DROP TRIGGER IF EXISTS journey_ai_usage_touch_trigger ON public.journey_ai_usage;
CREATE TRIGGER journey_ai_usage_touch_trigger
BEFORE UPDATE ON public.journey_ai_usage
FOR EACH ROW EXECUTE FUNCTION public.jornadas_clinicas_touch();

-- 4) Consumo atómico do limite, apenas para o backend.
CREATE OR REPLACE FUNCTION public.consume_ai_quota(_user_id uuid, _limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bucket timestamptz := date_trunc('hour', now());
  v_count integer;
BEGIN
  INSERT INTO public.journey_ai_usage (user_id, hour_bucket, count)
  VALUES (_user_id, v_bucket, 1)
  ON CONFLICT (user_id, hour_bucket)
  DO UPDATE SET count = public.journey_ai_usage.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid, integer) TO service_role;