# Stewardship fulfillment

Implemented locally November 3, 2026. Not deployed by this task. This is the
app-side portion of stewardship integration step 3, not a new request queue.

## Staff and MGO workflow

1. In Stewardship > Assistance Requests, open the request. Save a selected
   inventory item first if this is a personal gift; an unsaved shared note can
   carry into the completion form without a separate save.
2. Choose **Complete request** and record what happened, its actual date, and a
   short shared note. **Prepared** keeps work in progress. **Sent** records
   dispatch and moves the request to History, without claiming receipt. Staff can
   later confirm receipt of a dispatched personal gift from that saved request.
3. **Received by the donor** records or reuses the existing item receipt. Stock
   deduction is explicit and defaults off for historical/already-deducted items.
   A known sufficient count is required. For non-gift requests, staff can record
   a visit or other completed assistance without inventing an inventory receipt.
4. Optionally add a separate, non-primary next step to the assigned MGO's queue.
   It keeps its donor identity even without a local prospect record. It never
   replaces the MGO's current plan or completes the original reminder.
5. Confirm once and save. The MGO sees the same outcome, date, shared note, and
   follow-up through their existing Stewardship request. A bell notice opens
   Work Queue > Stewardship with completed requests included. Marking an update
   seen applies only to that user's exact version; a later update appears again.

Reopened work remains completable. Earlier fulfillment events, receipts, and NXT
links are retained. Changed completion details flag an existing NXT link for
staff review rather than silently changing that action.

Cancel stays in the originating queue and returns focus to the completion button.
The form keeps its draft while that request stays mounted. Leaving or refreshing
can discard an unsaved draft; the open form warns on browser navigation. A failed
or ambiguous save disables another submit until a read-only **Check saved status**
has completed. This is not background autosave or a cross-browser draft store.

## NXT boundary

Saving local fulfillment does not create or update any NXT record, send a message,
generate a letter, assign an appeal, or change society eligibility. Staff may
optionally enter an existing NXT action's **system record ID**. The route reads
that action through the actual signed-in staff connection and verifies the exact
donor, completed state, and actual completion date (action date fallback). It
does not retry an external write because it performs none. A verified link can
also be added later without re-recording receipt or deducting stock again.

Automatic NXT action and item-custom-field creation is **not implemented** here.
Existing query-import mappings are not treated as verified write mappings. The
remaining step requires confirmed action type, category/value contracts for each
item, fundraiser attribution, durable remote-write receipts, duplicate/uncertain
result reconciliation, and an explicitly authorized pilot. The MGO's existing
Add NXT action flow remains available for separately logging their follow-up.

## Data and authorization

- `/api/stewardship/fulfillment` GET recovers authorized saved status. POST records
  fulfillment or acknowledges an update. No-cache responses, actor-bound viewer
  IDs, strict fields, body-size limits, and same-origin JSON guards apply.
- Only actual active Admin/Advancement Services actors can fulfill requests;
  delegated MGO views do not grant that role. MGO reads and acknowledgments remain
  limited to their existing owner/requester scope.
- Additive schema: `data_change_requests.stewardship_fulfillment`, immutable
  `stewardship_fulfillment_events`, per-user `stewardship_fulfillment_notices`, and
  `pending_actions.source_stewardship_request_id`. One optional next step per
  request is enforced by a partial unique index. There is no backfill.
- The existing advisory request lock, active-actor checks, request version,
  canonical command and unique UUID token serialize saves against receipt and
  stock writers. Receipt, stock movement, request audit, completion event, MGO
  notices and optional next step commit or roll back together. A changed replay
  is rejected; a matching retry returns the saved result.
- The donor, item snapshot, request owner and staff identity come from locked
  database records, not client-provided names or actor fields. Existing receipts
  must match the selected item and date and cannot deduct stock again.
- Correct receipt errors in Received Items first. A voided receipt is retained;
  a replacement uses a new token and request version. Stock returns are always
  separate physical-stock operations. A previously linked NXT action remains
  unchanged and is visibly flagged for review after a receipt correction.
- Browsing updates uses saved app data, not per-card NXT polling. Notification
  counts update with the existing worklist refresh; this is not email or push.

## Verification scope

Final local verification: 2,006 mandatory workflow tests across 103 files passed
with none skipped; route generation, TypeScript checking and the production build
passed. All 96 disposable PostgreSQL tests passed, including deliberate reopen
and item-choice correction. `git diff --check` passed. The final build receipt
reports source fingerprint
`1fcaf9c7b85e5d79d28aa809cb38590fbad454c0a624cfad6cdba42d6ca3428c`.

Tests use fictional data only. The disposable PostgreSQL suite exercises atomic
completion, concurrent and conflicting retries, permission/version changes,
receipt reuse/correction, inventory audit rollback, MGO acknowledgments, prepared
SQL parameter types, and owner-scoped follow-up identity. Required workflow tests
cover API and component behavior, alongside existing app workflows, type checking
and production compilation. Browser checks use a local in-memory fixture, not a
production server or NXT, including desktop, 390px mobile, cancel/focus, completion
to History, and the MGO update/acknowledgment. Production migration, deployment,
real-account notification, and live NXT-link checks remain release-time checks.
