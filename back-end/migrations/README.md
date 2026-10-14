# Release migrations

Run against an explicitly identified staging database before production. All files are transactional and rerunnable:

1. `20261014_cv_versions.sql` — requires `auth.users` and `public.saved_cvs`.
2. `20261014_ai_feature_usage.sql` — requires `auth.users` and `public.user_subscriptions`.
3. `20261014_legacy_usage_alignment.sql` — requires existing `user_usage`, `user_subscriptions`, `increment_usage` and `reset_daily_usage`. Preserves counts, maps UI feature names to actual lowercase columns, restricts writes/resets and adds atomic ATS reservations.

The backend directory is the canonical migration location. The CV version file is also mirrored under the frontend `supabase/` directory for existing deployment workflows; keep both copies identical.

Run `npm run test:migrations` to apply the real migrations to disposable PostgreSQL through PGlite and exercise roles, row-level security, foreign keys, reruns, legacy permissive policies, monthly quotas and subscription restrictions. The fixture SQL is a checked-in snapshot of the existing core/subscription schemas, with no production data.

The production project was identified by comparing the live frontend's public Supabase origin with local configuration. Service-role REST access provides schema metadata but does not provide SQL migration execution. The generated deployment patch in the project's docs directory must be run through authorized SQL/admin access before deploying code that calls the new RPCs.

PGlite uses one serialized PostgreSQL connection. Passing these tests does not establish compatibility with a hosted project's manually modified schema, PostgREST schema-cache refresh, or independent concurrent PostgreSQL sessions. Validate those in the named hosted staging project before production rollout. Never infer staging from a production URL.

The local suite requires no Supabase secret, connection string or running Docker daemon. Do not point its fixtures at a hosted database: they create test roles and prerequisite tables.
