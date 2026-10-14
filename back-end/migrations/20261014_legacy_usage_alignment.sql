-- Preserve existing production counters; repair camel-case RPC inputs and owner checks.
BEGIN;
ALTER TABLE public.user_usage ADD COLUMN IF NOT EXISTS bios_per_month integer NOT NULL DEFAULT 0;
ALTER TABLE public.user_usage ADD COLUMN IF NOT EXISTS monthly_period_start date NOT NULL
  DEFAULT date_trunc('month', now() AT TIME ZONE 'UTC')::date;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.user_usage FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Legacy usage owner guard" ON public.user_usage;
CREATE POLICY "Legacy usage owner guard" ON public.user_usage AS RESTRICTIVE FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.increment_usage(p_user_id uuid, p_feature text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_column text;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_user_id IS NULL OR (auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Cannot change another user''s usage' USING ERRCODE = '42501';
  END IF;
  v_column := CASE p_feature
    WHEN 'jobSearchesPerDay' THEN 'jobsearchesperday' WHEN 'atsScansPerMonth' THEN 'atsscanspermonth'
    WHEN 'interviewsPerMonth' THEN 'interviewspermonth' WHEN 'resumeProjects' THEN 'resumeprojects'
    WHEN 'coverLettersPerMonth' THEN 'coverletterspermonth' WHEN 'networkContacts' THEN 'networkcontacts'
    WHEN 'biosPerMonth' THEN 'bios_per_month' END;
  IF v_column IS NULL THEN RAISE EXCEPTION 'Unsupported usage feature'; END IF;
  INSERT INTO public.user_usage(user_id, last_reset, monthly_period_start)
    VALUES (p_user_id, v_today, v_month) ON CONFLICT (user_id) DO NOTHING;
  -- The row update locks and evaluates current values before incrementing.
  UPDATE public.user_usage SET
    jobsearchesperday = CASE WHEN last_reset < v_today THEN 0 ELSE jobsearchesperday END,
    atsscanspermonth = CASE WHEN monthly_period_start < v_month THEN 0 ELSE atsscanspermonth END,
    interviewspermonth = CASE WHEN monthly_period_start < v_month THEN 0 ELSE interviewspermonth END,
    coverletterspermonth = CASE WHEN monthly_period_start < v_month THEN 0 ELSE coverletterspermonth END,
    bios_per_month = CASE WHEN monthly_period_start < v_month THEN 0 ELSE bios_per_month END,
    last_reset = v_today, monthly_period_start = v_month
    WHERE user_id = p_user_id;
  EXECUTE format('UPDATE public.user_usage SET %I = coalesce(%I, 0) + 1, updated_at = now() WHERE user_id = $1', v_column, v_column)
    USING p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.increment_usage(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, text) TO authenticated, service_role;
-- Existing global reset is a trusted maintenance operation, never a browser RPC.
REVOKE ALL ON FUNCTION public.reset_daily_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_daily_usage() TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_ats_usage(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_plan text;
  v_limit integer;
  v_used integer := 0;
  v_period date;
  v_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'User is required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  SELECT plan_id INTO v_plan FROM public.user_subscriptions
    WHERE user_id = p_user_id AND status IN ('active','trialing')
      AND (current_period_end IS NULL OR current_period_end > now());
  v_limit := CASE WHEN v_plan IN ('pro','premium','enterprise') THEN 999 ELSE 3 END;
  SELECT coalesce(atsscanspermonth,0), monthly_period_start INTO v_used, v_period
    FROM public.user_usage WHERE user_id = p_user_id;
  IF v_period < v_month THEN v_used := 0; END IF;
  IF coalesce(v_used,0) >= v_limit THEN RETURN jsonb_build_object('allowed',false,'limit',v_limit); END IF;
  PERFORM public.increment_usage(p_user_id, 'atsScansPerMonth');
  RETURN jsonb_build_object('allowed',true,'limit',v_limit,'used',coalesce(v_used,0)+1);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ats_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ats_usage(uuid) TO service_role;
COMMIT;
