# Pricing and trust release — 14 October 2026

## Delivered source changes

- Starter advertises 3 signed-in ATS scans/month. Paid allowances are explicit numbers instead of “unlimited”. Annual prices disclose the $96/$288 totals and actual 20% saving.
- Enterprise is explicitly unavailable; no SSO, custom branding, team administration, bulk processing or API delivery is promised.
- Unverified testimonials, ratings, usage/outcome counts and first-party “10,000 resume” research were withdrawn. Other general educational/competitor content is not certified by this change.
- Added public `/privacy`, `/terms`, `/support` and authenticated account-management controls at `/account-data`, with links from footers, authentication and upload/profile surfaces.
- Support requests are stored privately and return a reference only after a successful save. No SMTP delivery, auto-reply or response-time promise is invented.
- Added authenticated account-data export. Account deletion requires a verified bearer session, a recent server-confirmed sign-in, exact `DELETE` confirmation, verified billing cancellation and a database cascade-safety preflight. No real account was deleted during verification.
- Review links now use 256-bit tokens checked by the backend, seven-day expiry and saved snapshots. The public response excludes owner ID and does not allow direct saved-CV retrieval.
- Structured contact fields, reference contacts, photos, unknown fields and custom sections are omitted from snapshots. Free text can still contain sensitive information; users are warned to review it before sharing.
- Comment writes recheck token, expiry, revocation, permission, same-share parent and a 500-comment cap under a database lock. IP limits provide an additional process-local deterrent.
- Automatic third-party marketing analytics loading was disabled pending a consent-aware implementation safe across SPA navigation. Local review-path analytics recording is also suppressed. Review pages use noindex/nofollow and no-referrer metadata.

## Live database action

Applied `migrations/20261014_trust_and_sharing.sql` as one transaction in the production Supabase SQL Editor on 14 October 2026. The UI returned “Success. No rows returned”. The original three-migration release bundle was not rewritten: this is a separate follow-up migration.

Verified afterward:

| Check | Before | After |
|---|---|---|
| Saved CVs | 8 | 8 |
| Share records | 1 | 1 |
| Active old links | 1 | 0 |
| Comments | 1 | 1 |
| Anonymous share-table SELECT | allowed | denied |
| Anonymous comment-table SELECT | allowed | denied |
| Anonymous support-ticket SELECT | table absent | denied |
| Authenticated raw share INSERT | previously granted | denied |
| Authenticated snapshot replacement | column absent | denied |
| Owner revocation | supported | allowed |
| Identity cascade readiness | not checked | true |

Old links were intentionally revoked because their tokens could previously be enumerated and they lacked a reviewed snapshot/expiry. Do not reactivate them manually. Generate a replacement through the new authenticated flow after deploying the application release. The old CV and comment records remain intact.

Evidence is saved in `C:/Users/awais/Documents/Codex/2026-10-06/hi/trust-db-verification-2026-10-14.json` and its PNG companion. Verification SQL was saved in the existing Supabase SQL Editor tab; this is not registration in Supabase CLI migration history.

## Validation

Both TypeScript checks pass. Baseline 42 tests plus 2 pricing contracts and 14 trust tests pass: **58 tests**. Tests cover snapshot redaction, owner lookup, weak tokens, failed support saves, recent-sign-in/deletion guards, legacy-policy isolation, owner-only modifications, cross-share replies, expired/disabled links, service-only RPCs and deletion cascade preflight. PostgreSQL fixtures are disposable; no customer data was used in destructive tests.

Production frontend build passed using the existing verification-only Windows mapped-drive-probe preload. Desktop/mobile browser checks verified public support and account gating, privacy readability, explicit annual totals and absence of horizontal overflow at 390px. No live Stripe cancellation, account deletion or real customer support submission was performed. Build chunk-size warnings remain.

## Deployment and operation

1. Database migration is already applied. Deploy the updated backend, then frontend. The previously deployed commits do not contain these new routes/pages.
2. Confirm `/api/reviews/read` rejects the revoked legacy token and anonymous PostgREST table reads remain denied.
3. With a controlled test account, create a saved CV and a new link. Open it signed out; verify no structured contact information, snapshot isolation, comments, expiry and revocation.
4. Submit a clearly labelled test support request and verify its receipt appears in `public.support_requests`. Do not claim this sends email.
5. The operator must review open support requests in Supabase at least daily and use an approved, monitored mailbox for replies. No background notification service is configured by this patch. Keep any reply channel outside public source until it is verified.
6. For account deletion, use an explicitly disposable test account, export first, re-sign in, verify active Stripe subscriptions block deletion, then test the canceled/no-billing case. Never use the owner's real account for a smoke test.
7. Existing purchase guarantees/mandatory rights remain applicable; the new pricing FAQ does not retrospectively remove them. Have the operator and qualified legal reviewer review the policy wording and decide concrete log/backup/support retention rules before broad paid launch. These pages are not a compliance certification.

## Known limits

- Rate-limit stores are process-local and require correct proxy configuration; shared production abuse controls remain a follow-up.
- Provider/backup/legal-payment retention is not controlled by deleting Supabase Auth. Temporary unassociated upload files follow existing startup/daily cleanup, not immediate account-specific deletion.
- Support requests use self-reported contact email; verify identity independently before acting on privacy/account requests. Automatic support-ticket deletion by email only occurs for a server-confirmed email identity.
- The account export contains saved records, not unsaved drafts or original upload binaries. Account deletion clears this product's cached browser drafts on the device performing it.
- Existing expensive feature routes outside this task still need the launch-plan authorization/quota audit. Publishing limits does not certify every older route's server-side enforcement.
- npm reported 21 dependency audit findings during installation (including one critical); this patch did not apply an unrelated force-upgrade. Triage the affected runtime/development packages before broad launch.
- This patch has not been pushed or deployed by the agent. Generated backend dist outputs are verification artifacts, not source changes to publish independently.
