# JU Application Review - October 20, 2026

## Summary

The initial review was read-only. No application code, deployed settings, financial values, NXT records,
mailing statuses, or user permissions were changed. No production refresh,
submission, email, upload, or donor export download was performed. One explicit
query-field lookup tested the shared NXT reporting connection without running the
query or saving source settings.

At the time of the initial review, production matched application commit `76072ec8ce5c8863794884e90b30ebfc37d669df`,
deployment `dpl_HQB8RYYStXn7xNvURobS8z8kkE3Q`. Existing unrelated local changes
were preserved. This is a bounded application review, not a comprehensive
penetration test or certification that every integration works.
The legacy access fixes were subsequently deployed; see the follow-up below.

## Prioritized Findings

### 1. Urgent: Legacy submission exports bypass authentication

`apps/web/src/app/api/submissions/export-csv/route.js:3` directly selects all
submissions without checking a session, active account, role, or workspace.
Fields include donor names, emails, phones, transcripts, and notes.
`apps/web/src/app/api/submissions/export-my-csv/route.js:7` also lacks authorization
and hard-codes `userId = 1` instead of resolving the authenticated owner.

Unauthenticated production requests returned HTTP 200 and `text/csv` for both.
Bodies were canceled, not saved or printed. Responses also lacked private
no-store caching headers. The route registry does not add authorization.

Fix first: require an active authorized account before querying; restrict the
organization-wide export to permitted staff and scope the personal export to the
resolved workspace. Add private/no-store headers and denial/ownership tests.
Afterward, check historic access evidence to assess possible exposure. This
review establishes the access gap, not whether anyone exploited it.

### 2. High: Older processing routes lack access and fetch safeguards

`apps/web/src/app/api/transcribe/route.js:119`,
`apps/web/src/app/api/transcribe-constituent/route.js`, and
`apps/web/src/app/api/transcribe-opportunity/route.js` have no session checks.
The first accepts a caller-controlled audio URL and fetches it server-side
without a destination allowlist or a bounded download.
`apps/web/src/app/api/upload/route.js:10` likewise accepts requests without
account authorization before forwarding uploads to its provider.

Empty JSON probes returned input-validation HTTP 400, not authentication denial;
no audio, URL, or upload was supplied. Code inspection confirms that meaningful
payloads proceed to processing without an app-level auth check. Actual provider
billing, storage, or internal network access was not exercised.

Fix: active-account authorization, same-origin commands where appropriate,
file/type/size limits, timeouts, and per-user usage limits. Remove unnecessary
remote-URL input or strictly constrain allowed destinations and redirects.
Review the generic `/integrations/*` proxy as part of this boundary.

The adjacent admin diagnostic at
`apps/web/src/app/api/admin/runtime-diagnostics/route.js:70` returned HTTP 200
without authentication. Its code exposes runtime/database host hints and
configuration presence/length, not raw secrets. Restrict it to actual Admins or
remove it from production.

### 3. High: Concurrent startup schema work causes real HTTP 500 failures

The last-24-hour production log sample contains `NeonDbError: tuple concurrently
updated` for `/api/users/mgos` and `/api/reports/configurations`.
Both stacks identify the same built `ensureAppSchema` statement. It maps to
`apps/web/src/app/api/utils/ensureAppSchema.js:1409`, the unconditional
`CREATE OR REPLACE FUNCTION protect_pending_pipeline_change()`.

The initialization promise at lines 12-17 coordinates only one running process,
not independent serverless instances. Concurrent initializations can replace
the same PostgreSQL function while ordinary read requests wait for setup.

Fix: move schema changes into versioned, serialized migrations before serving
traffic. If an immediate compatibility repair is needed, serialize/version the
setup using a database-safe migration lock with transaction/connection semantics
appropriate to the database client. Do not remove the opportunity protection
trigger or indiscriminately retry all business writes.

### 4. Medium: Background freshness is constrained and failures need recovery

Saved Integration Health evidence around 10:01 AM Eastern:

- 907 known portfolio assignment slots; 249 checked for giving within 24 hours.
- 412 slots had giving checks at least 48 hours old.
- Activity worker: 1,353 checks eligible, all 360 daily reserved calls used,
  including all 72 morning catch-up reservations.
- All five enrolled MGO portfolios had completed their initial gift/action checks;
  this is a repeat-check backlog, not missing initial enrollment.
- Leslie's last completed maintenance pass had five failed items: four summary
  HTTP 500s and one optional-enrichment failure. Scott's running pass had one
  summary HTTP 500.

The production 24-hour error sample contained 36 requests: six summary timeouts,
two schema errors, three auth-session HTTP 500s without diagnostic messages, and
25 summary HTTP 503s. Those 25 were classified safe background-budget pauses,
not evidence of a Blackbaud outage. Current health showed no saved
subscription-wide cooldown.

Fix: distinguish expected pauses from failures in logs and notices; recover
timed-out reads through the existing bounded checkpoint/backoff mechanism.
Measure duplicate fetches and actual call cost before increasing worker budgets,
retaining capacity for interactive users. The normal-night item ceiling displayed
in health does not include all server-managed continuation capacity; do not use
that one number alone to estimate whole-day throughput.

### 5. Dependency security updates need a controlled upgrade pass

`npm audit --omit=dev --json` reported 32 flagged dependency entries: 3 critical,
22 high, 6 moderate, and 1 low. These are scanner classifications, including
transitive packages, not 32 proven exploitable application bugs.
Direct dependencies flagged include Auth.js, Hono, React Router, and `ws`.
The three critical entries were `@auth/core`, `proxy-addr`, and `tar`.

Review advisories against enabled features, prioritize reachable runtime paths,
and update compatible dependency groups with login/Okta, routing, database,
PDF, and build regression tests. Do not run a blanket forced audit fix; some
suggestions involve breaking upgrades. The scanner result and its source advisory
URLs are retained locally for follow-up.

## Operational Follow-Ups

- Society Letters loaded successfully with 320 reviewed recipients and 45
  questionable recipients. Membership evidence was last checked October 14;
  the page correctly warns that it is older than 24 hours. Preparing further
  letters can still require an eligibility refresh. No refresh was triggered.
- One Leslie follow-up still has a saved NXT action awaiting verification, last
  updated September 16. Investigate using the existing read-only action check;
  do not create the action again.
- FY Revenue Goals still shows no returned matching funds for JU Parents Fund
  and Future. Rising. Scholarship Fund. The saved source names are correct;
  check query 31075's qualifying gifts/criteria before expecting nonzero totals.
- Future. Made. loaded its October 16 snapshot. $165,521,556.79 remained
  unassigned to pillars but was included in the overall total. Pillar assignment
  is incomplete setup, not lost campaign money.
- React hydration errors 418/423 appeared in the embedded browser while pages
  still rendered. Earlier diagnostics in `integration-health.md` reproduced an
  embedded-browser overlay mismatch. A normal-browser reproduction is still
  required before assigning this occurrence to the application or the overlay.
- Three auth-session HTTP 500s lacked diagnostic messages in the retrieved logs.
  A signed-in session worked during this review; the cause of those earlier
  requests remains unconfirmed.

## Checks Completed

- Verified the current production release identity.
- Loaded signed-in Integration Health, FY Revenue Goals, Future. Made.,
  Society Letters, and Opportunity Pipeline.
- Loaded query 31074's output fields through the shared reporting connection;
  NXT returned its five field names successfully. No query execution or NXT
  record change was requested.
- Database-backed pages loaded. FY cash received remained $3,452,296.51 and
  received plus expected remained $5,544,296.51. Manual cash was still the three
  original entries totaling $3,030,000, with zero installment adjustments.
- Pipeline displayed 68 active FY27 opportunities, 16 closed/archived, and two
  needing fiscal-year/review attention.
- Confirmed protected Integration Health and FY Revenue endpoints return HTTP
  401 to anonymous reads; identified the legacy exceptions above separately.
- General suite: 7,092 tests passed, 290 environment-gated tests skipped.
  Enabled the existing isolated PGlite suites separately: 130 additional tests
  passed, covering campaign data, revenue ledgers, and society-letter persistence.
  Combined: 7,222 distinct tests passed; 160 remained unrun.
- Typecheck and production build passed. No code or dependency upgrade was made.

Local evidence prefix: `/private/tmp/ju-general-review-2026-10-20-`.
Raw production logs are local and permission-restricted; they are not attached to
this document. No donor CSV response body was retained.

## Remaining Verification Limits

No fresh Okta sign-in exchange, individual MGO reconnection, outbound email,
live AI generation, hosted PDF conversion, production import, live NXT write,
financial edit, appeal assignment, or mailing operation was performed.
Passing mock/database tests does not certify those live paths. Database tests
used isolated synthetic data, not production migrations or writes.

Recommended order: close legacy access gaps; fix concurrent schema setup;
perform dependency upgrades in tested groups; improve timeout/backlog recovery;
then run controlled synthetic end-to-end checks for email, AI, PDF, and imports.

## Follow-Up: Legacy Access Fixes Deployed

Status: deployed and verified on JU on October 20, 2026. Application commit
`8419189a50604778497ca872114cd3fc3f2945b9`, deployment
`dpl_BSGvyt9SXfe5r2PC3cVFUwHrKWsu`, candidate
`mgo-4rgq3zgv4-chelspers-projects.vercel.app`.
This follow-up changes no NXT records, financial values, mailing statuses,
permissions, or connection credentials. Existing unrelated work is preserved.
Only the JU production deployment changed. Its project settings and five cron
schedules were preserved; no Git push or other-organization deployment occurred.

Implemented:

- Both submission CSV exports require a signed-in, active database account.
  The organization-wide export requires Admin or Advancement Services access,
  including existing reviewer aliases. Personal export uses the actual signed-in
  account, matching the personal submissions list; it ignores acting-workspace
  cookies and caller-supplied user IDs. CSV responses are private/no-store,
  spreadsheet formula prefixes stay literal, and notes/transcripts are escaped
  once rather than twice.
- Runtime diagnostics requires an active actual Admin account. Session-provided
  roles cannot grant this permission.
- Upload, all three transcription routes, and business card extraction require
  active-account authorization before reading input or calling a provider.
  Explicit cross-site browser commands are rejected; native requests without an
  Origin header remain supported.
- Media requests have bounded body reads, a 4 MB file cap within the existing
  4.5 MB request limit, accepted content types, and provider timeouts. Legacy
  remote media must use HTTPS on `ucarecdn.com` or the exact configured
  `NEXT_PUBLIC_BASE_CREATE_USER_CONTENT_URL` origin. Redirects are forbidden and
  downloads are bounded even without Content-Length.
- Processing uses one atomic database bucket per actual user: 60 requests per
  10-minute window across upload, transcription, and business card extraction.
  A transcription request may make two provider calls. The existing
  `report_snapshots_cache` table stores these namespaced counters; no schema
  migration is needed. If the budget cannot be checked, processing fails closed.
- The unused generic public `/integrations/*` proxy is retired with HTTP 410.
  Purpose-specific authenticated API routes still call the provider server-side.
  Business card extraction no longer makes an unauthenticated call back through
  that proxy. Browser donor-update audio posts directly to transcription instead
  of first creating a separately hosted upload.
- Provider response bodies and internal failure details are not returned to
  clients by these routes. Upload controls surface the safe actionable error.

Focused checks: 132 passed, including 127 boundary/behavior tests, three business
card regressions, and two isolated PostgreSQL tests for simultaneous budget
claims, per-user isolation, and window reset. Final full suite: 7,351 passed,
160 environment-gated tests skipped; typecheck and production build passed.
The campaign and stewardship isolated PostgreSQL suites were enabled in that
full run. Live provider tests remain unperformed. Local evidence is in
`/private/tmp/ju-security-step1-tests-final.log`,
`/private/tmp/ju-security-step1-typecheck.log`, and
`/private/tmp/ju-security-step1-build-final.log`.

Deployment verification completed:

- An isolated `git archive` matched the tested code. Dry-run upload verification
  checked all 1,470 file hashes and all 19 changed files before deployment.
- Candidate and live anonymous requests returned 401 for both CSV exports,
  runtime diagnostics, upload, all three transcription endpoints, and business
  card extraction. POST probes used empty JSON; no media was uploaded and no
  donor export bodies were retained. The retired generic proxy returned 410.
- Live version and asset checks matched the expected application SHA.
  A synthetic old-version cookie still resolved to the current release.
- An existing signed-in Admin session successfully loaded Integration Health.
  MGO/role/export ownership behavior was covered by automated tests, not by
  impersonating a live MGO or downloading donor exports.

Follow-up verification not performed:

1. Use a fictional audio recording and business card for a separately authorized
   provider smoke test. Mock success tests do not prove provider availability.
   Legacy native audio callers must use the allowed upload CDN; arbitrary
   external file URLs are intentionally no longer accepted.
2. Review historical access evidence for the formerly public endpoints. This
   patch does not establish whether anyone previously accessed them.
3. Review access protection for direct historical Vercel deployment URLs.
   The checks above cover the current JU domain and new candidate, not every
   older deployment hostname.

Release evidence is retained under `/private/tmp/ju-security-*`, including
`ju-security-live-smoke.log`, `ju-security-version-verify.log`, and
`ju-security-promote.log`.

Remaining: concurrent schema initialization (local fix described below), dependency advisories, background
freshness/timeouts, and the other operational findings are separate follow-ups.
File checks are not a malware scanner, and this is not a whole-app security
certification.

## Follow-Up: Concurrent Startup Fix

Status: implemented locally after the security deployment; not deployed.
The production release above still has the original schema initialization.

`pipelineChangeGuardSchema.js` now installs the existing opportunity protection
function and trigger inside one `DO` statement. That statement acquires a
transaction-scoped advisory lock, then checks the existing function body before
performing any catalog write. The already-deployed definition is a no-op.
Missing definitions are created, and old definitions are updated only once.
An unexpected or disabled protection trigger fails closed for administrator
review instead of silently allowing pending opportunity updates to be lost.

The database client uses Neon HTTP, so independent awaited queries cannot be
assumed to share a connection. Keeping the lock, checks, and DDL in one statement
makes the lock effective and releases it automatically on commit or rollback.
Contention is bounded by a five-second lock timeout, not an unbounded retry loop.
See PostgreSQL's [transaction advisory lock guidance](https://www.postgresql.org/docs/current/explicit-locking.html)
and [function catalog documentation](https://www.postgresql.org/docs/current/catalog-pg-proc.html).

Verification uses a disposable local PostgreSQL cluster with fictional records,
a private Unix socket, and no TCP listener. It never uses `DATABASE_URL` or NXT.
Tests cover 16 simultaneous independent sessions, unchanged function/trigger
catalog versions on repeated startups, upgrading an old function, preserving
pending-change protection, missing/disabled/mismatched triggers, rollback, lock
waiting, lock timeout, and recovery. Existing pipeline transaction tests exercise
claims, stale edits, ownership, completion, archiving, and rollback against the
same production helper.

Final verification: all 27 focused startup/pipeline tests passed within the full
suite of 7,368 passing tests and 154 environment-gated skips. Type checking,
production build, release-worktree guard, and `git diff --check` passed.
The new real-PostgreSQL concurrency tests were enabled, not skipped.
Logs: `/private/tmp/ju-startup-fix-tests.log`,
`/private/tmp/ju-startup-fix-typecheck.log`, and
`/private/tmp/ju-startup-fix-build.log`.

This targeted fix addresses the catalog race identified in the production logs.
It is not a full conversion of the legacy startup initializer into versioned
migrations. That larger change, and the independent timeout/auth/dependency
findings, remain separate work.
