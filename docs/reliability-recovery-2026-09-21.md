# Reliability Release And Follow-Up

## Deployed: Duplicate-Create Protection

- Release SHA: `4ced281b6bf1084f63b42274c36571aa533c6308`.
- Production: `https://www.jumgogpt.app`.
- Vercel deployment: `dpl_BAvuniZCySHZ81pbcgCfLRJpU3Nd`.
- Previous release: `4a260a8499caf2da31caebcc1df9668b3122f630`.
- Published by normal fast-forward push to `main`; production SHA and assets checked.
- Signed-in Saved NXT submissions page loaded the selected workspace and its empty
  receipt history. No verification buttons, NXT writes, or refresh jobs were run.
- Candidate evidence: 3,567 tests, typecheck, build, and release guard passed.

## Prepared Locally: Findings 2 And 3

These follow-up changes have not been deployed.

### Empty Portfolio Handling

A saved snapshot is verified-empty only when both assignment arrays are present,
both are empty, and `assignmentDataStatus` is `live`. Missing, malformed, partial,
unavailable, or unverified historical zero snapshots remain blocked. No old saved
data is deleted or silently reclassified as empty.

Starting a verified-empty manifest creates a completed zero-item job with a
completion timestamp. The overnight worker skips the unnecessary processing call.
When membership later includes constituents, normal enrichment resumes. Assignment
refresh responses that are stale-cache fallbacks or unavailable now remain explicit
recoverable failures instead of being mistaken for successful membership refresh.
Cron cadence, enrollment, batch sizes, rate limits, and capacity are unchanged.

### Interrupted Reminder-Action Finalization

`pending_action_nxt_receipts.local_finalized_at` is a nullable additive column,
not an automatic historical backfill. A shared SQL finalizer atomically commits
the marker, missing completed activity, and summary-cache invalidation. A failure
rolls back all three. Competing finalizers use the marker as a row-lock-protected
claim, so only one can add the activity.

The create route does not mark a failed local finalization as saved. Explicit
verification can repair `review` receipts and older `saved` receipts with no marker.
It reads the existing NXT action and validates it against the original payload;
it never creates an action, patches NXT metadata, sends email, completes a reminder,
or changes discussion items. Planned actions never become completed local activity.

An interrupted `processing` receipt can be verified only after five minutes and
only with its durable NXT action ID. Its precise saved timestamp must still match
at the final SQL update. A fresh, changed, undated, or ID-less processing receipt
cannot be unlocked through recovery. The original create claim never expires.

Activity is attached only to the original owner-scoped prospect when its NXT links
still agree. Deleted or relinked targets are not retargeted; an administrator must
review those local references separately. Existing activity with the same prospect
and NXT action ID is not duplicated. Recovery never reapplies an old completion
request to a reminder that may have been edited or reopened.

Older saved receipts lack the new local marker and can therefore show a one-time
verification requirement, including in Integration Health. Do not blindly mark
them finalized. If NXT has since materially changed the action, strict verification
can remain blocked; investigate the existing action rather than sending another.

## Validation

- Full suite: 309 test files, 3,596 tests passed.
- Typecheck, production build, release guard, and `git diff --check` passed.
- The existing mixed static/dynamic import warning for `constituentListRefresh.js`
  remains non-blocking and unrelated to these changes.
- Real disposable PostgreSQL test passed: additive migration, injected activity
  failure rollback, eight competing finalizers producing one activity, legacy
  saved recovery, existing-activity deduplication, planned-action exclusion,
  owner/payload restrictions, changed-link exclusion, stale-processing timestamp
  guards, and unchanged reminders. Its local server was stopped afterward.
- Reproducible script: `apps/web/scripts/check-action-finalization-postgres.mjs`.
- No production database failure injection or live NXT acceptance writes were run.

The remaining audit readiness item is background refresh capacity/freshness.
Sandbox isolation and approved sandbox write acceptance are still required before
calling the conference copy ready. Family import remains out of scope.
