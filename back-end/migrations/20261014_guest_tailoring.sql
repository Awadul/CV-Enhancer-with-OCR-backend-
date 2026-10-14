BEGIN;
CREATE TABLE IF NOT EXISTS public.tailoring_usage (
  subject text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY(subject, period_start)
);
ALTER TABLE public.tailoring_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tailoring_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tailoring_usage TO service_role;

CREATE OR REPLACE FUNCTION public.check_tailoring_allowance(p_user_id uuid, p_guest_key text, p_reserve boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_subject text;
  v_plan text := 'starter';
  v_period date := (now() AT TIME ZONE 'UTC')::date;
  v_reset timestamptz := ((now() AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC';
  v_limit int := 4;
  v_used int := 0;
  v_global int := 0;
BEGIN
  IF p_user_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'Invalid user'; END IF;
    v_subject := 'user:' || p_user_id::text;
    SELECT plan_id INTO v_plan FROM public.user_subscriptions WHERE user_id=p_user_id
      AND status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end > now());
    IF v_plan IN ('premium','enterprise') THEN
      v_limit := 999;
      v_period := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
      v_reset := (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC';
    END IF;
  ELSE
    IF p_guest_key IS NULL OR p_guest_key !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid guest'; END IF;
    v_subject := 'guest:' || p_guest_key;
    -- Fleet-wide ceiling bounds the cost of distributed anonymous traffic.
    PERFORM pg_advisory_xact_lock(hashtextextended('guest-tailoring-global',0));
    SELECT used INTO v_global FROM public.tailoring_usage WHERE subject='guest-budget' AND period_start=v_period;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_subject,0));
  SELECT used INTO v_used FROM public.tailoring_usage WHERE subject=v_subject AND period_start=v_period;
  v_used := coalesce(v_used,0);
  IF p_user_id IS NULL AND coalesce(v_global,0) >= 200 THEN
    RETURN jsonb_build_object('allowed',false,'reason','budget','remaining',greatest(0,v_limit-v_used),'limit',v_limit,'reset_at',v_reset,'guest',true);
  END IF;
  IF v_used >= v_limit THEN
    RETURN jsonb_build_object('allowed',false,'reason','quota','remaining',0,'limit',v_limit,'reset_at',v_reset,'guest',p_user_id IS NULL);
  END IF;
  IF p_reserve THEN
    INSERT INTO public.tailoring_usage(subject,user_id,period_start,used) VALUES(v_subject,p_user_id,v_period,1)
      ON CONFLICT(subject,period_start) DO UPDATE SET used=tailoring_usage.used+1;
    v_used := v_used+1;
    IF p_user_id IS NULL THEN
      INSERT INTO public.tailoring_usage(subject,period_start,used) VALUES('guest-budget',v_period,1)
        ON CONFLICT(subject,period_start) DO UPDATE SET used=tailoring_usage.used+1;
    END IF;
    -- Bounded retention for pseudonymous network counters.
    DELETE FROM public.tailoring_usage WHERE period_start < (now() AT TIME ZONE 'UTC')::date - 62;
  END IF;
  RETURN jsonb_build_object('allowed',true,'remaining',v_limit-v_used,'limit',v_limit,'reset_at',v_reset,'guest',p_user_id IS NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.check_tailoring_allowance(uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_tailoring_allowance(uuid,text,boolean) TO service_role;
COMMIT;
