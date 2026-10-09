# Society Letter Workflow Follow-Up Review

## Implementation Update

The subsequent implementation addresses findings 1-3 and the one-click document
preparation simplification below. These are local changes, not yet deployed.

- Main batch, selected-letter recovery, individual continuation, and manual
  verification share a saved-pause guard. Early requests do not issue NXT calls,
  mutate receipts, or extend the pause. Explicit exclusion continuation and
  verification use the same guard; automatic checks retain their bounded,
  read-only behavior.
- Pause controls update when the deadline expires without polling NXT. For a
  known expired temporary failure, **Continue saved letters** reloads saved
  receipts before resuming. An uncertain receipt or failed reload prevents
  continuation. Reloading or waiting alone never starts a write.
- Structured recovery guidance distinguishes recipient corrections from appeal
  configuration and permission failures. Unknown legacy errors fall back to
  saved-status review rather than recommending replacement of an approved
  document. The existing explicit return-to-review option still requires proof
  that no member submission was attempted.
- **Prepare letters** creates the draft and starts sequential preparation from
  that user click. Loading an existing draft does not start preparation.
  Optional previews no longer imply separate required approvals; one final
  approval still authorizes the exact documents and their NXT appeal updates.
- Approved documents, dates, household membership, and member receipts are not
  rewritten by recovery guidance. No migration or live data repair is required.

Finding 4 remains a separate next step: explicit download/dispatch operations for
completed subsets of a partly blocked batch. No partial-mailing behavior or
document limits were changed in this implementation.

Implementation verification:

- Full default suite: **6,287 passed, 210 opt-in checks skipped** with two workers.
  An earlier normal-concurrency run timed out in an unrelated import-screen test;
  that test passed in the targeted rerun and in the full two-worker run. No timeout
  limit was increased and no test was disabled to obtain the passing result.
- Final focused letter suite: **1,140 passed, 19 skipped** (23 additional passing
  regression cases compared with the review baseline).
- The 17 skipped letter-store database cases were run separately with local
  PGlite: **17 passed**. The two remaining letter-specific opt-in checks are
  hosted PDF conversion and a supplied-template sample export, neither rerun here.
- Type checking and the production build passed. Build output retained existing
  bundler warnings; there were no build errors.
- No live NXT writes, production repair, hosted PDF request, deployment, or
  sandbox change was performed. Local/mock checks are not live-provider proof.
- Logs: `/tmp/ju-letter-recovery-full-tests-final.log`,
  `/tmp/ju-letter-recovery-focused-final.log`,
  `/tmp/ju-letter-recovery-database.log`,
  `/tmp/ju-letter-recovery-typecheck.log`, and
  `/tmp/ju-letter-recovery-build.log`.

The original review and reproductions follow for historical context.

Reviewed October 9, 2026 after the optional address-field fix. Source HEAD:
`034d3adbf1bb9608f5090c23a1a49547e10be66b` (documentation-only commit after
application SHA `765de1130e9de3ba41d2d6a0eb088f8fd3d2f84b`). This is a review,
not an implementation or deployment. No live letters, NXT records, production
settings, or sandbox settings were changed.

The earlier audit's return-to-review, resolved-receipt recovery, source guidance,
template-aware readiness, and setup checklist fixes are present. The remaining
issues below were reproduced against the current services and React components
using fictional records. Passing existing tests does not cover these gaps.

## Findings

### 1. P2: Alternate Recovery Paths Bypass the Saved NXT Pause

The approved-batch service checks the saved retry deadline before doing work.
Individual appeal continuation and bulk "Finish saved letters" call the shared
sync service without that check. The individual checkbox/button also remains
available during the pause. The automatic read-only verification path does have
a cooldown guard; explicit verification does not use it.

Reproduction: an approved fictional household receives an NXT read failure with
HTTP 429 and a five-minute retry delay. The main batch immediately refuses another
attempt. Both individual and bulk continuation nevertheless perform fresh reads
and submit the two members' appeals before that same deadline when the mocked
provider accepts the next call. Shared transport quota protection covers some
provider failures, but does not replace the saved deadline guard: ordinary
non-budgeted 429 responses are not persisted as a shared global quota pause.

Fix: enforce the persisted retry deadline in the common recovery service, before
NXT reads or writes. All controls should show the same pause and next retry time.
Reloading app-side saved status must remain available and read-only. Do not
shorten or reset the deadline when an early retry is requested.

Acceptance: main, bulk, individual, manual verification, and automatic
verification make zero NXT calls during a saved pause. Once it expires, an
explicit continuation reruns the fresh checks and writes only safe pending
members. Unknown submissions are still reconciled, not replayed.

Sources: `apps/web/src/app/api/utils/societyLetterFinalization.js:478`,
`apps/web/src/app/api/utils/societyLetterBulkAppeals.js:69`,
`apps/web/src/app/api/utils/societyLetterPostalBatches.js:413`,
`apps/web/src/app/stewardship/society-letters/FinalPostalLetterDialog.jsx:218`,
`apps/web/src/app/api/utils/blackbaud.js:625`.

### 2. P2: The Main Continue Button Can Stay Disabled After a Pause Expires

When the running batch hits a definite provider failure, it records a local
stopped flag. Reload only clears that flag when every loaded receipt is no
longer `needs_review`. An expired rate-limit failure still has that status until
a fresh attempt succeeds, leaving the very control needed to retry disabled.
This is narrower than the earlier fixed case where refreshed receipts show
that a failed letter has already been completed elsewhere.

Reproduction: run a fictional batch, return a pending-member receipt with a
five-minute 429 failure, advance beyond the deadline, and reload saved status.
The pause message disappears, but the main continuation button stays disabled.
No uncertain member exists. Reopening/remounting the screen or using another
recovery control can take a different path, which is confusing and inconsistent.

Fix: use explicit recovery categories rather than one generic `needs_review`
flag. After reloading current receipts, allow an explicit retry for a known,
expired temporary provider failure. Do not mark the letter complete, start
writes automatically, or clear real recipient/permission/uncertain blockers.

Acceptance: the expired-pause case enables the explicit continuation control
without reopening the page. Reload alone never writes. Future cooldowns and
uncertain submissions remain protected. Fresh checks can still block the retry.

Source: `apps/web/src/app/stewardship/society-letters/PostalBatchApproval.jsx:420`.

### 3. P2: Connection Problems Are Presented as Recipient Corrections

The attention card decides whether to show "Fix recipient details" from whether
an appeal was attempted, not from why the letter is blocked. A preflight
permission failure with untouched members therefore offers returning the letter
to review and approving a replacement. Editing the recipient cannot fix NXT
permissions and unnecessarily retires a valid approved document if followed.

Reproduction: render an approved, unsubmitted fictional letter with a saved
403 verification failure. Its primary action dispatches
`return_letter_to_review` with `editRecipientAfterReturn: true`.

Fix: retain structured failure categories and route to the matching action:
recipient details, appeal settings, connection/permissions, timed retry, or
read-only reconciliation. Keep approved documents for non-content problems.
Offer replacement only for a genuine recipient/document change and only when
the existing no-submission safety checks permit it.

Acceptance: permission, quota, and appeal-catalog errors do not recommend
recipient editing. An actual address issue still offers the safe editor path.
Attempted, uncertain, and confirmed members still cannot be released by it.

Source: `apps/web/src/app/stewardship/society-letters/LetterBatchCard.jsx:227`.

### 4. P2: Partial Batches Lack a Corresponding Mailing-Status Action

A confirmed individual letter remains downloadable when another letter in the
batch is blocked. However, the only mailing action is batch-wide, and both the
UI and server require all active letters' appeal receipts to be complete. Staff
can therefore print and dispatch a completed letter but cannot accurately record
that dispatch while another household is unresolved.

Reproduction: show one complete and one pending PDF letter in the same batch.
The first individual download is enabled; the second is disabled. The only
"Mark ... mailed" control is disabled. The server's mailed action selects by
batch ID and has no explicit completed-letter subset operation.

Fix: add "Download ready letters" and "Mark selected letters mailed" using an
explicit list of saved delivery IDs. Show the included and omitted counts and
names; never silently drop a blocked household from a purported full batch.
Validate every selected receipt and document under the existing concurrency
protection. Require physical-dispatch confirmation for the selected records.

Acceptance: only selected completed letters become mailed; blocked letters keep
their documents and reservations. Concurrent receipt changes reject the stale
selection. A repeated dispatch operation is safe, and the full-batch PDF still
means the full eligible batch, not an undisclosed subset.

Sources: `apps/web/src/app/stewardship/society-letters/LetterBatchCard.jsx:131`,
`apps/web/src/app/api/stewardship/society-letters/route.js:699`.

## Simplification and Implementation Order

1. Unify recovery rules and controls first. Implement findings 1-3 together with
   regression tests. Present one "Continue saved letters" path and specific
   exception actions, retaining approvals and per-member receipts.
2. Combine "Start document approval" and "Prepare documents" into one explicit
   "Prepare letters" action. Automatically prepare the draft just created by
   that click, not arbitrary saved drafts on page load. Keep pause/resume and
   optional previews. Retain one final approval for exact documents and NXT
   writes. Rename the optional per-document "approved" count to avoid suggesting
   that every preview needs approval before the final batch approval.
3. Implement explicit completed-letter subsets for download and dispatch status.
   This requires backend and database tests, not just enabling existing buttons.
4. Consider larger background batches only after these recovery paths are stable.
   Do not simply raise request-time or PDF-size limits.

The date-update path keys the approval component by the draft's `dateUpdatedAt`;
it resets the confirmation when date-dependent documents change. No stale-date
confirmation bug was found there.

## Verification and Limits

- Existing focused workflow suite: **1,117 passed, 19 skipped**.
- The 17 opt-in database tests were then run separately with local PGlite:
  **17 passed**. These cover local PostgreSQL-compatible safeguards, not a fresh
  production database or network test.
- Five temporary audit probes reproduced the four findings: two continuation
  paths bypassing the saved deadline, expired-pause UI recovery, incorrect
  recipient-repair guidance, and partial-batch mailing controls.
- The probes deliberately assert current problematic behavior. They were removed
  from the working tree after running; application source and existing tests are
  unchanged. Reproduction patch: `/tmp/ju-letter-workflow-followup-probes.patch`.
- Logs: `/tmp/ju-letter-workflow-followup-probes.log`,
  `/tmp/ju-letter-workflow-followup-tests.log`, and
  `/tmp/ju-letter-workflow-followup-database.log`.
- The two remaining opt-in checks are hosted PDF conversion and a supplied-template
  sample export. They were not run in this review. No live-browser walkthrough,
  hosted converter output, current production state, or NXT write was verified.
- This review does not guarantee the absence of future provider, document, or
  network failures. Its recommended changes improve consistent, safe recovery.

Run the focused suite from `apps/web`:

```sh
./node_modules/.bin/vitest run societyLetter society-letters societyQuery letterWorkspaceView letterReviewRecovery
```

Run the local database cases with the available test runtime:

```sh
STEWARDSHIP_PGLITE_MODULE=/tmp/ju-import-recovery-pg.emLubt/node_modules/@electric-sql/pglite/dist/index.js ./node_modules/.bin/vitest run src/app/api/utils/societyLetterStore.integration.test.js
```
