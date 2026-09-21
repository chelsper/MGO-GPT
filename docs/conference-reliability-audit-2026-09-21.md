# Pre-Conference Reliability Audit

Reviewed September 21, 2026 against release
`4a260a8499caf2da31caebcc1df9668b3122f630`.

## Decision

Fix the three failure-path defects below before treating this release as the
conference baseline. Passing ordinary tests is not sufficient evidence that
uncertain writes and recovery are safe across every workflow. Complete a bounded
saved-data rehearsal after those fixes, then duplicate code into a separate,
initially read-only environment. Do not duplicate JU's database or credentials.

This was a read-only production review. No NXT writes, import retries, report
refreshes, configuration changes, or deployment were performed. Temporary local
mocked reproductions were removed after testing. This document is the only
retained repository change.

## Findings

### 1. P1: Older Creates Retry Ambiguous NXT Writes

The shared transport defaults to two retries regardless of HTTP method. Both
server errors and timeouts can therefore repeat a non-idempotent POST. Older
action and opportunity routes do not override this. If NXT commits a create but
the response is lost or returns an upstream error, the retry can create another
record. This is a confirmed code risk, not evidence that duplicates occurred in
production during this review.

Sources: `apps/web/src/app/api/utils/blackbaud.js:527`, `:609`, `:645`, `:2163`,
`:2489`; `apps/web/src/app/api/prospects/[id]/actions/route.js:452`;
`apps/web/src/app/api/prospects/[id]/opportunities/route.js:90`;
`apps/web/src/app/api/submissions/donor-update/route.js:105`;
`apps/web/src/app/api/submissions/opportunity-update/route.js:148`.

Reproduction: mocked the first create response as HTTP 503 and the second as a
successful ID. Both `createBlackbaudAction` and `createBlackbaudOpportunity`
issued two identical POST bodies. No requests left the test process.

Recommended correction: default ambiguous create writes to no transport retry;
inventory all callers and fallback create variants. Extend durable request
claims and read-only reconciliation to older entry points so a user retry after
an uncertain response cannot bypass the transport fix. Preserve bounded retries
for safe reads. The import apply wrapper and reminder-action create already
explicitly use `maxRetries: 0`; retain those protections.

### 2. P2: Empty Portfolios Become Scheduler Failures

The scheduler successfully refreshes assignments and then unconditionally starts
enrichment. The start route rejects both missing snapshots and valid snapshots
containing zero assignments with the same HTTP 409. The scheduler converts that
to HTTP 502 rather than completing an empty workspace as a successful no-op.

Sources: `apps/web/src/app/api/internal/portfolio-refresh/route.js:213`;
`apps/web/src/app/api/blackbaud/portfolio-refresh/route.js:584`.

Reproduction: a successful empty assignment response followed by the start
route's missing-snapshot rejection produced a scheduler 502 in the mocked test.
Production error logs contain this exact rejection at 05:20 and 05:30 UTC on
September 21. Those events predate the reviewed morning deployment; they do not
identify whether the affected snapshots were empty or unavailable. Current
source still contains the failure path.

Recommended correction: explicitly distinguish verified-empty, unavailable,
and populated membership. Verified-empty workspaces should complete without
enrichment; unavailable membership must retain existing data and remain a
recoverable error. Test later enrollment when an empty portfolio gains members.

### 3. P2: Verified Actions Can Lose Local Activity With No Recovery Path

The reminder-action route verifies NXT before atomically finalizing its receipt
and local activity. If that local statement fails, the catch block can set the
receipt to `saved` anyway. Subsequent verification returns immediately for saved
receipts, so it never repairs the missing local activity entry or associated
cache invalidation. The NXT action exists and duplicate creation remains blocked,
but the local workflow can remain inconsistent.

Sources: `apps/web/src/app/api/pending-actions/[id]/log-action/route.js:140`,
`:145`, `:200`, `:226`.

Reproduction: allowed the durable NXT action-ID save, failed the local finalization
statement, then allowed the catch-block update. The response and receipt became
`saved`; an explicit recovery PATCH performed no local repair. This was reproduced
with mocks only; no current production occurrence was established.

Recommended correction: distinguish remote verification from local finalization.
Make local activity finalization idempotently recoverable using the existing
durable action ID. Never resend the action or automatically complete a changed
reminder during recovery.

### 4. P2 Readiness Limit: Overnight Capacity Cannot Clear Daily Demand

The configured portfolio worker runs every ten minutes, only during Eastern hours
1 through 6, and processes one batch of ten per invocation. That permits at most
360 item attempts per night through this worker before failures, pauses, or
overlap. Giving becomes due again after twenty hours. The saved health view covers
908 workspace assignment slots across five portfolios, with 489 giving checks due.
Browser-assisted processing can add work, but is not unattended nightly coverage.

Sources: `apps/web/vercel.json:17`;
`apps/web/src/app/api/internal/portfolio-refresh/route.js:7`, `:239`;
`apps/web/src/app/api/blackbaud/portfolio-refresh/route.js:15`, `:713`;
`apps/web/src/app/api/utils/portfolioGivingSnapshots.js:4`.

Separately, saved latest-activity health showed 1,026 never-verified gift/action
checks and 288 of 360 reserved API calls consumed that day. These are worker
budget counts, not Blackbaud's total subscription usage. No saved activity errors
or active shared cooldown were shown at inspection time.

Recommended correction: choose and measure an achievable freshness target, then
size bounded background work accordingly. Keep shared cooldowns, checkpoints and
fair scheduling; do not simply remove limits or force all portfolios to refresh
during the presentation. Prewarm only the approved demo dataset in the sandbox.

## Verification Results

- Existing suite: 305 files, 3,517 tests passed.
- Additional temporary reproductions: two transport cases passed; the scheduler
  and action-recovery test files passed 92 cases including two added reproductions.
  These cases confirm the defects above, not that the defects were fixed.
- Type checking, production build, and clean-release worktree check passed.
- One non-blocking build warning remains: `constituentListRefresh.js` is both
  statically and dynamically imported by the list route, preventing code splitting
  for that module. This is not an observed runtime failure.
- Production Integration Health showed no pending reminder-action verification
  or processing receipts, no saved summary errors, and no active shared cooldown.
  This is saved operational evidence, not live certification of every connection.
- Saved pledge report: 64 of 64 pledges verified, zero needing review; last completed
  September 17. No schedules were refreshed or compared against live NXT today.
- Import History loaded 835 successful and 33 failed/partial historical outcomes.
  These are saved outcomes, not 33 newly reproduced failures. They were not retried
  or individually reconciled against NXT.
- Reports opens as My FY27 Portfolio Giving. The currently selected Gretchen
  workspace has no saved FY27 report yet. This is a demo-preparation gap, not an
  observed crash; no refresh was started.
- Future. Made. Phase II displayed 34 saved rows, current lead fundraiser values,
  and a September 19 saved timestamp without the earlier query-mapping warning.
  No query was executed and fundraiser accuracy was not independently rechecked.
- The 24-hour production error sample also included one constituent-summary 429
  and two rejected `/xmlrpc.php` probes. The probes are not application workflow
  failures. Logs are a bounded sample, not proof that no other failures exist.

## Fix And Rehearsal Order

1. Close the older create/retry gap, with durable submission recovery and permanent
   regression tests for timeout, 5xx, concurrent submission, and user resubmission.
2. Repair local action finalization and empty-portfolio handling with explicit
   recovery tests. Keep all uncertain remote writes protected against replay.
3. Validate the bounded refresh schedule against real workload and record a
   freshness target. Reconcile selected historical import outcomes without writes.
4. Implement the environment/write/email/cron safeguards in
   `docs/conference-sandbox-readiness.md`, then provision an isolated sandbox copy.
5. Rehearse the agreed demo paths with synthetic data and role-specific accounts;
   verify approved sandbox writes and saved report availability, then freeze the
   tested release. Family import remains outside the conference acceptance scope.

This audit does not certify every role, browser, database failure mode, dependency,
or external service. Live write acceptance and sandbox isolation testing remain
required before calling the duplicate conference-ready.

## Follow-Up: Finding 1

The subsequent worktree implementation addresses the older create/retry gap with
single-attempt POST transport, durable claims in four legacy create routes, removal
of alternate create retries, and read-only saved-submission verification. See
`docs/nxt-create-write-safety.md` for scope and recovery limits. It is not yet
deployed and does not close findings 2-4. The audit evidence above describes the
original reviewed release, not this later implementation.

## Follow-Up Release Status

Finding 1 was subsequently deployed as `4ced281b6bf1084f63b42274c36571aa533c6308`.
Findings 2 and 3 now have tested local fixes awaiting a separate release. See
`docs/reliability-recovery-2026-09-21.md` for deployment verification, recovery
boundaries, historical-receipt behavior, and regression evidence. The original
audit findings and line references above remain historical baseline evidence.
