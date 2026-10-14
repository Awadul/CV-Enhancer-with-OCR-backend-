-- Apply before deploying trustRoutes and its frontend callers.
-- Existing review tokens are revoked, not re-published without owner review.
BEGIN;
ALTER TABLE public.cv_shares ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.cv_shares ADD COLUMN IF NOT EXISTS review_snapshot jsonb;
UPDATE public.cv_shares SET is_active = false WHERE review_snapshot IS NULL OR expires_at IS NULL;
ALTER TABLE public.cv_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cv_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cv_shares, public.cv_comments FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.cv_shares TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.cv_comments TO authenticated;
GRANT ALL ON public.cv_shares, public.cv_comments TO service_role;
DROP POLICY IF EXISTS "Private share owner guard" ON public.cv_shares;
CREATE POLICY "Private share owner guard" ON public.cv_shares AS RESTRICTIVE FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Private comment owner guard" ON public.cv_comments;
CREATE POLICY "Private comment owner guard" ON public.cv_comments AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cv_shares s WHERE s.id = share_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cv_shares s WHERE s.id = share_id AND s.user_id = auth.uid()));
-- Browsers may revoke or disable comments, but cannot extend expiry, replace snapshots or tokens.
REVOKE UPDATE ON public.cv_shares, public.cv_comments FROM authenticated;
GRANT UPDATE (is_active, allow_comments) ON public.cv_shares TO authenticated;
GRANT UPDATE (resolved) ON public.cv_comments TO authenticated;

CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (length(email) <= 254),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 120),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.support_requests TO service_role;

CREATE OR REPLACE FUNCTION public.add_review_comment(p_token text, p_name text, p_section text, p_content text, p_parent uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.cv_shares; result public.cv_comments;
BEGIN
  SELECT * INTO s FROM public.cv_shares WHERE share_token = p_token AND is_active AND expires_at > now()
    AND review_snapshot IS NOT NULL FOR UPDATE;
  IF s.id IS NULL OR NOT s.allow_comments OR p_token !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Link unavailable'; END IF;
  IF length(trim(p_name)) NOT BETWEEN 1 AND 80 OR length(trim(p_content)) NOT BETWEEN 1 AND 2000 OR
    p_section NOT IN ('personalInfo','summary','experience','education','skills','projects','certifications','languages_spoken','')
    OR p_name IS NULL OR p_content IS NULL OR p_section IS NULL THEN RAISE EXCEPTION 'Invalid comment'; END IF;
  IF p_parent IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cv_comments WHERE id = p_parent AND share_id = s.id) THEN
    RAISE EXCEPTION 'Invalid parent'; END IF;
  IF (SELECT count(*) FROM public.cv_comments WHERE share_id = s.id) >= 500 THEN RAISE EXCEPTION 'Comment limit reached'; END IF;
  INSERT INTO public.cv_comments(share_id, reviewer_name, section, content, parent_id)
    VALUES(s.id, trim(p_name), p_section, trim(p_content), p_parent) RETURNING * INTO result;
  RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.add_review_comment(text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_review_comment(text,text,text,text,uuid) TO service_role;

-- Fail closed if a future user-owned table is added without identity-delete cascading.
CREATE OR REPLACE FUNCTION public.account_deletion_ready()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class t ON t.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relkind = 'r' AND NOT a.attisdropped
      AND (a.attname = 'user_id' OR (t.relname = 'user_profiles' AND a.attname = 'id'))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid = t.oid
        AND c.contype = 'f' AND c.confrelid = 'auth.users'::regclass AND c.confdeltype = 'c' AND a.attnum = ANY(c.conkey))
  );
$$;
REVOKE ALL ON FUNCTION public.account_deletion_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_ready() TO service_role;
COMMIT;
