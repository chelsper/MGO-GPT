# Final Postal Letters and Household Appeals

For the locally implemented small-batch approval and optional private PDF
extension, see [Saved Postal Batch Approval](society-letter-postal-batches.md).
The deployment notes below describe the earlier single-letter release.

## Scope and Release

Deployed to JU on September 27, 2026 as commit
`35346dcb7fe0beef0f304ba455228da639aca483`, deployment
`dpl_8tSWew7K48hr6GUXDZYnmYMkdKiV`. This first rollout finalizes one
postal letter at a time from the combined society-query source. It does not
enable bulk creation, query-source email delivery, automatic sending, or
background NXT writes. Existing legacy batch/email and exclusion workflows
retain their separate gates.

Step 6's saved-data batch summary is implemented separately and is not included
in that deployment. See [the summary contract](society-letter-batch-summary.md).

## Staff Workflow

1. Refresh all annual society queries for the recognition period, configure
   the full hierarchy and period-specific appeals, and save recipient choices.
2. Complete postal readiness checks. Review and preview never assign appeals.
3. Choose **Create final letter** on a reviewed recipient whose checks passed.
   The confirmation lists the highest society, exact appeal, letter date,
   address, and every household member's system ID. Load the personalized Word
   preview and explicitly approve creation and the NXT updates.
4. The server repeats current NXT checks, reserves one immutable letter recipe,
   and applies the highest-tier letter appeal to every verified member. The
   chosen addressee/address owner never reduces that list. Singles use one ID.
   Lower-tier letters are covered locally; no extra lower-tier appeal or letter
   is created. The appeal date is the letter creation date. Comments include
   the recognition period and unique letter ID and distinguish creation from
   postal dispatch.
5. Letter history shows separate member receipts. Once every appeal is
   confirmed, download the Word letter and mark it mailed only after dispatch.

The UI requires successful draft rendering and a separate unchecked approval.
The server independently checks the preview token, workspace revision, current
saved recipient review, template, hierarchy, membership snapshot under 24 hours,
and postal readiness. Client-supplied member IDs, addresses, or appeals cannot
override the saved finalization inputs.

## Write Safety and Recovery

The current complete appeal catalog must contain the configured active system
ID and exact, unique description. NXT Data Integration creates by description,
so ambiguous descriptions fail closed. Every household member is re-read with
their profile, appeal history, solicit codes, and consent instructions before
either member is written. Current reciprocal spouse links, names, status,
preferred postal address, restrictions, and prior same/higher letters must pass
the existing readiness evaluator.

`stewardship_letter_deliveries.payload.letterAppeals` stores the frozen policy,
appeal, date, comments, member IDs, and per-member receipt state. The existing
120-second workspace lease and unique reservation protect duplicate creation.
A new lease-guarded store method changes only this receipt field, never the
reserved template version or recipient wording. No new schema or cron is added.

Each member is durably marked uncertain before POST. The request uses the
existing fixed `/nxt-data-integration/v1/re/constitappeals` transport, a five
second timeout, and no transport retries. The result must be read back with the
exact appeal, assignment ID, date, and unique comments before confirmation.
Timeouts, 5xx, missing IDs, and failed read-back never become retryable merely
because no assignment is visible yet. Only definitive rejected POST responses
can return to pending. Confirmed members are skipped on continuation.

**Verify NXT status (read only)** checks complete member appeal histories without
POSTs. It may reconcile an accepted-but-lost response only when the assignment
matches that reserved letter's unique comments/date and known ID if present.
**Continue remaining appeal updates** requires a new explicit confirmation,
unchanged period/hierarchy/appeal policy, and fresh checks for all members.
It never generates another letter. An unrelated existing appeal, duplicate,
changed assignment, removed confirmed assignment, changed spouse, or uncertain
submission blocks further writes instead of overwriting or recreating history.

Downloads and marking mailed are blocked until every receipt is confirmed.
NXT-linked reservations cannot be cancelled through the legacy release button,
even if interrupted; this prevents a second letter while an appeal could be
in flight. Unresolvable changes require staff reconciliation, not automatic
deletion of NXT history. These checks cannot make multiple external NXT writes
atomic or prevent unrelated staff changes in NXT between checks and writes.

## Validation

September 27: full suite passed with 4,404 tests and 30 opt-in tests skipped.
The local-only PostgreSQL suite separately passed all 11 tests, including
receipt persistence across leases, immutable letter values, expired-lease
rejection, blocking partial mailing/cancellation, and duplicate reservations.
Build, typecheck, release-worktree guard, and diff checks passed.

The first full run had an apparent 15-minute execution interruption causing
worker/test timeouts. A bounded-worker rerun with temporary sleep prevention
passed without increasing test timeouts. An earlier dialog test mock was fixed
to model the native dialog's open state. Neither issue was an NXT rejection.

Browser QA uses a fully local, fictional workspace that rejects external
requests: preview/confirmation, both member IDs, partial-update recovery,
read-only verification, explicit continuation, and enabling download only
after both member receipts are confirmed. No live letters, emails, appeals,
or constituent records were created as tests.

Desktop and 390-pixel mobile checks confirmed that the approval is disabled
until the personalized preview loads, both member IDs remain visible, and
final creation cannot be submitted twice from the same confirmation. Browser
viewport overrides were reset and the local preview and temporary database
were stopped after validation. Re-verifying an otherwise identical appeal
policy does not strand an existing reservation; changed policy values still
block continuation.
