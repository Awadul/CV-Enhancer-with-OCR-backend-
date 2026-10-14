-- Apply after user_subscriptions exists. Billing-grade counters for the three new AI routes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ai_feature_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature IN ('bios', 'ats_fix', 'resume_trim')),
  period_start date NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature, period_start)
);
ALTER TABLE public.ai_feature_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_feature_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_feature_usage TO authenticated;
GRANT ALL ON public.ai_feature_usage TO service_role;
DROP POLICY IF EXISTS "Read own AI usage" ON public.ai_feature_usage;
CREATE POLICY "Read own AI usage" ON public.ai_feature_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "AI usage owner guard" ON public.ai_feature_usage;
CREATE POLICY "AI usage owner guard" ON public.ai_feature_usage AS RESTRICTIVE
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.reserve_ai_feature_usage(p_user_id uuid, p_feature text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_plan text := 'starter';
  v_limit integer;
  v_used integer;
  v_period date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_user_id IS NULL OR p_feature IS NULL OR p_feature NOT IN ('bios', 'ats_fix', 'resume_trim') THEN
    RAISE EXCEPTION 'Invalid AI usage request';
  END IF;
  -- Serialize attempts for this user across instances, including first-row creation.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  SELECT s.plan_id INTO v_plan FROM public.user_subscriptions s
    WHERE s.user_id = p_user_id AND s.status IN ('active', 'trialing')
      AND (s.current_period_end IS NULL OR s.current_period_end > now());
  v_plan := coalesce(v_plan, 'starter');
  v_limit := CASE
    WHEN p_feature = 'ats_fix' AND v_plan IN ('premium', 'enterprise') THEN 999
    WHEN p_feature = 'bios' AND v_plan IN ('pro', 'premium', 'enterprise') THEN 999
    WHEN p_feature = 'resume_trim' AND v_plan IN ('pro', 'premium', 'enterprise') THEN 999
    WHEN p_feature = 'resume_trim' THEN 3
    ELSE 0 END;
  IF v_limit = 0 THEN RETURN jsonb_build_object('allowed', false, 'reason', 'plan'); END IF;
  INSERT INTO public.ai_feature_usage(user_id, feature, period_start)
    VALUES (p_user_id, p_feature, v_period) ON CONFLICT DO NOTHING;
  UPDATE public.ai_feature_usage SET used = used + 1, updated_at = now()
    WHERE user_id = p_user_id AND feature = p_feature AND period_start = v_period AND used < v_limit
    RETURNING used INTO v_used;
  IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false, 'reason', 'quota'); END IF;
  RETURN jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit, 'period_start', v_period);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_feature_usage(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_feature_usage(uuid, text) TO service_role;
COMMIT;
