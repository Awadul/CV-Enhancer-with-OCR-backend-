# Local check limit override

Set NODE_ENV=development and LOCAL_DISABLE_CHECK_LIMITS=true in local .env, then restart the backend. The example configuration defaults to false.

Only direct loopback requests bypass check-route IP limits, ATS reservations, AI feature quotas and tailoring allowances. Both Express client IP and socket address must be loopback. Production, staging, unset environments and remote callers retain enforcement even if the flag is true. Headers cannot enable the override.

Authentication remains required on protected routes; provided tailoring tokens are still verified. Input validation, upload limits and concurrency safeguards remain active. AI calls still use provider credits. No database migration is required. Do not set this flag in hosted configuration.

Run npm run test:local-check-limits to verify isolation from production, remote callers and unrelated routes. Included in check:release.
