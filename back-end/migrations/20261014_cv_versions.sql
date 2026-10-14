-- Apply after public.saved_cvs exists. Versions must belong to the same owner as their CV.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS saved_cvs_id_user_id_unique ON public.saved_cvs(id, user_id);
CREATE TABLE IF NOT EXISTS public.cv_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  cv_data jsonb NOT NULL CHECK (jsonb_typeof(cv_data) = 'object'),
  options jsonb,
  theme_id text,
  snapshot_data text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cv_versions_owned_project_fk FOREIGN KEY (project_id, user_id)
    REFERENCES public.saved_cvs(id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS cv_versions_project_created_idx ON public.cv_versions(project_id, created_at DESC, id DESC);
ALTER TABLE public.cv_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cv_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.cv_versions TO authenticated;
GRANT ALL ON public.cv_versions TO service_role;
DROP POLICY IF EXISTS "Read own CV versions" ON public.cv_versions;
CREATE POLICY "Read own CV versions" ON public.cv_versions FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.saved_cvs c WHERE c.id = project_id AND c.user_id = auth.uid()));
DROP POLICY IF EXISTS "Create own CV versions" ON public.cv_versions;
CREATE POLICY "Create own CV versions" ON public.cv_versions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.saved_cvs c WHERE c.id = project_id AND c.user_id = auth.uid()));
DROP POLICY IF EXISTS "Delete own CV versions" ON public.cv_versions;
CREATE POLICY "Delete own CV versions" ON public.cv_versions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
-- A restrictive guard also constrains any permissive policies left by a manual setup.
DROP POLICY IF EXISTS "CV version owner guard" ON public.cv_versions;
CREATE POLICY "CV version owner guard" ON public.cv_versions AS RESTRICTIVE FOR ALL TO authenticated
  USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.saved_cvs c WHERE c.id = project_id AND c.user_id = auth.uid()))
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.saved_cvs c WHERE c.id = project_id AND c.user_id = auth.uid()));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.cv_versions'::regclass AND conname = 'cv_versions_owned_project_fk') THEN
    ALTER TABLE public.cv_versions ADD CONSTRAINT cv_versions_owned_project_fk
      FOREIGN KEY (project_id, user_id) REFERENCES public.saved_cvs(id, user_id) ON DELETE CASCADE;
  END IF;
END $$;
COMMIT;
