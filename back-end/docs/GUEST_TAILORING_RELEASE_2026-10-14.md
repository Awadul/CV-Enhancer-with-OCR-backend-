# Guest resume tailoring release

## Behavior

- Landing Tailor my CV actions and the resume-builder start action open `/tailor`, a public editor dashboard, rather than requiring registration first.
- Guests can edit CV sections and preview actual templates. AI changes are suggestions requiring explicit acceptance. One-step undo is available.
- Drafts remain in sessionStorage in the current browser tab, including during the account handoff; this is disclosed and can be cleared. They are not automatically saved to an account.
- Four AI tailoring **attempts per UTC day per anonymous network**. A request consumes allowance before the provider call, including failed provider attempts. Invalid input does not consume AI allowance.
- After the fourth reservation, the editor presents Sign in / Create account while preserving the fourth result and allowing manual editing and review.
- Verified Starter and Pro accounts have four attempts per UTC day, separately from the anonymous network allowance. Active Premium/Enterprise accounts have a finite 999/month limit. These amounts are reflected in pricing copy.

## Enforcement

`GET /api/cv/tailor/allowance` reads the current allowance without consuming it. `POST /api/cv/tailor` validates input, verifies any supplied token, reserves quota atomically and only then generates suggestions. The non-/api route aliases use the same middleware.

The service-role-only `check_tailoring_allowance` RPC uses advisory transaction locks and persistent counters. Browser user IDs, plans, counters and forwarding headers are never accepted as identity. Invalid bearer tokens fail rather than falling back to anonymous access. Missing migrations or database errors fail closed with 503.

Network keys use HMAC-SHA256 with `GUEST_QUOTA_SECRET`, falling back to the existing server-only Supabase service-role secret. Raw addresses are not stored in the quota table. Counters older than 62 days are cleaned during reservations; signed-in counters cascade on account deletion.

Additional controls: 200 anonymous reservations fleet-wide per UTC day, request burst limits, bounded in-memory burst bookkeeping, bounded CV/job inputs, a 60-second provider timeout, zero automatic provider retries, bounded suggestion output, and generic provider failures without raw exception disclosure.

Limitations: an IP/network is an abuse-control signal, not an individual identity. Shared networks share the guest allowance; proxy switching can change identity, while the global guest budget bounds anonymous AI consumption. Other pre-existing AI endpoints require their own release audit; this feature does not secure unrelated routes.

## Deployment order

1. Apply `migrations/20261014_guest_tailoring.sql` to the intended Supabase environment after `user_subscriptions` exists. This creates a new RLS-protected counter table and service-only RPC; it does not modify CV records.
2. Keep Supabase service credentials only on the backend. Optionally set a stable, random `GUEST_QUOTA_SECRET`; rotating it resets network identity while the global counter remains.
3. Verify proxy topology. `TRUST_PROXY_HOPS` must match the actual trusted reverse proxies, and direct untrusted access to the backend must be blocked before trusting forwarded addresses. Do not blindly set this value: with no trusted proxy configured, traffic may share the proxy’s allowance; trusting arbitrary proxy headers permits spoofing.
4. Deploy backend, verify allowance and enforcement, then deploy frontend. Without the migration/backend, editing remains available but tailoring is intentionally unavailable.
5. Confirm four requests, fifth denial, UTC reset, invalid-session rejection and account handoff in staging. Monitor quota denials and provider failures without logging CV content or raw IPs.

## Validation

Seven middleware tests cover forged identities, exhaustion, invalid sessions, verified identity, database failure, free allowance reads and bad input. Five isolated PostgreSQL tests cover idempotent migration, concurrent four-use limits, day reset, account/paid periods, public-role permission denial, global guest budget and account-deletion cleanup.

Browser tests use a local API fixture: CTA opens the editor, four requests produce the account prompt, draft survives reload and signup cancellation, and mobile layout stays within its viewport. No production CV or paid AI call was used in these UI checks. A real signup/login submission was not performed.

The migration was applied to the hosted Supabase project on 14 October 2026; see the execution record below. Application deployment remains separate.


## Curated templates and CV import — 14 October 2026
- Public editor offers Simple ATS, Precision ATS and Professional Slate only.
- Drag/drop or choose a PDF, DOCX or UTF-8 TXT file (4 MB maximum). Legacy DOC and scanned PDFs require conversion.
- `/cv/tailor/upload` extracts an editable CV and generates reviewable job-specific suggestions in one AI call, using one shared tailoring allowance. Successful import replaces the draft; undo restores it. Import does not create an account or permanently save the upload.
- Server preflight blocks exhausted users before multipart processing. Atomic database reservation remains authoritative. Two active imports per process, 8 requests/minute, bounded worker memory, 10-second parsing timeout, 20 PDF pages and 60,000 extracted characters. DOCX expansion is inspected and bounded before Mammoth extraction.
- Public PDF import uses pdfjs-dist 5.6.205 with evaluation disabled. Deploy with a supported Node runtime (22.13+ or 24+). Existing legacy PDF controllers still use their existing parser and need a separate modernization review.
- Legacy AI upload/text import now requires verified authentication and the same finite allowance. Client calls send the session token. Generic upload middleware now caps files at 4 MB.
- Failed processing attempts consume an allowance after reservation. Rate limits reduce abuse; shared-network limits can affect multiple visitors, and multi-instance deployments need a shared gateway limit for burst/concurrency protection.
- Apply `20261014_guest_tailoring.sql`, then deploy backend before frontend. The migration is now applied; neither application was deployed by this change.


## Hosted migration execution record
- Date: 14 October 2026, verified at 15:59:18 UTC (20:59:18 Pakistan time).
- Project: `mdvjsktnxvwkqiiutskv` (Awadul’s Project / CV Project).
- Migration: `20261014_guest_tailoring.sql`, executed through the Supabase browser SQL Editor. Result: Success, no rows returned.
- SQL editor query ID: `c53a2ac1-3af0-443a-a0d1-87981b24270a` (verification replaces its editor text; checked-in migration is the authoritative SQL).
- Preflight confirmed quota table and function absent and subscription plan field present.
- Verification: table exists; RLS enabled; anon/authenticated cannot SELECT counters or EXECUTE quota function; service_role can EXECUTE; non-reserving guest check returned allowed=true, limit=4, remaining=4, reset 15 October 00:00 UTC.
- No production quota was consumed by verification. No user records were modified. Retention cleanup is defined in the function and runs when future attempts are reserved.
