# Stewardship assistance requests

Implemented and validated September 28, 2026. See the dated JU release note for
deployment status and live verification. Development testing used only synthetic
local data; production records, NXT connections, and email systems were not used.

## User workflow

### Guided Fulfillment (November 3, 2026)

Step 3 now has a local guided completion flow, described in
[Stewardship fulfillment](stewardship-fulfillment.md). It replaces the separate
completion and receipt controls in Assistance Requests. Prepared, sent, and
received remain distinct; actual receipt can be recorded with an explicit stock
deduction, an in-app MGO update, and one optional follow-up in a single transaction.
An existing completed NXT action can be verified and linked read-only. Automatic
NXT action and item-custom-field creation is not implemented in this increment;
those writes still need a verified mapping and controlled pilot. Deployment is
separate. The older workflow descriptions below document the earlier increments.

### Proactive Requests (November 2, 2026)

Implemented locally; deployment is separate from the November 2 menu/label release.

- From My Portfolio > More actions > Stewardship, choose **Request assistance**.
  From a linked opportunity in Top Prospects, choose **Request stewardship assistance**.
  No donation or gift follow-up is required. Donor and optional opportunity context
  are filled from saved, authorized records rather than user-entered names.
- Choose the assistance type, describe what is needed, and optionally set a date.
  Campus visit, Leadership thank-you, and Impact report join the existing choices.
  Personal gifts retain the optional inventory preference; submitting does not
  reserve or deduct stock.
- The same request appears in Stewardship > Assistance Requests and the MGO's
  Work Queue > Stewardship tab. Staff status and shared notes stay on that record.
  Existing gift-origin requests still use their original task and donation context.
- Reopening the form recovers its saved request. **Start a separate request** is
  explicit. An interrupted submission requires a read-only saved-status check,
  not an automatic repeat POST. Cancel returns to the originating panel/card.

`/api/stewardship/direct-request` binds viewer and workspace IDs, checks actual
edit permissions and active roles, verifies the saved portfolio assignment or
owned opportunity, and rejects conflicting constituent links. Writes recheck
source context under locks. The nullable `stewardship_request_key` and
`stewardship_context` columns extend the existing queue; a requester/workspace/key
unique index and atomic audit event make retries idempotent. The session recovery
key is scoped to actor, workspace, donor, and opportunity. It is not an access
credential. This is retry protection, not cross-browser duplicate-intent detection.
Direct requests use the same versioned staff writer, receipts, queue filters, and
generic-editor exclusions as gift-triggered requests. Schema additions are
idempotent and preserve existing requests; there is no data backfill or NXT write.

Local verification for this increment: 1,899 mandatory workflow tests passed
with none skipped, followed by route generation/type checking and a production
build. All 77 disposable-PostgreSQL stewardship tests passed, including prepared
direct-request SQL, concurrent retries, stale identities/roles, audit history,
and the shared receipt writer. Fictional browser testing covered submission,
staff progress, portfolio status recovery, cancellation/focus, and 390px layouts.
No production records were created or changed for these tests.

### Gift-Triggered Requests

1. In Next Steps, open a gift-origin follow-up and choose **Request stewardship
   assistance**. Choose Letter or note, Personal gift, Recognition or experience,
   or Help me choose / other. Add instructions and an optional needed-by date.
2. The saved donation context and workspace owner come from the original task.
   Submitting leaves that reminder open and creates no external activity.
3. Admin/Advancement Services staff handles the request in **Stewardship >
   Assistance Requests** (`/stewardship/requests`). Progress notes are explicitly
   shared with the fundraiser. Staff can start work, complete, decline, or reopen.
4. The solicitor sees the same record under **My Submission Tracker > Stewardship**
   (the existing work queue) and can **View stewardship request** on the original
   follow-up. Existing request history surfaces link to that same record or task.
   A general staff Work Queue row links to Stewardship; it has no parallel editor.
5. Request completion does not complete the reminder, confirm delivery, or change
   society eligibility. Society Letter Creation remains its own reviewed workflow.

Progress is read from saved app data on opening/reloading a view, not pushed in
real time. The follow-up list includes request ID/status in its existing database
query; it does not make per-card NXT calls. The request dialog loads only on demand.

## Data and safety contract

- Reuse `data_change_requests`, not a second queue table. Add source task ID,
  immutable donation snapshot, needed-by date, and optimistic request version.
- One request per source task enforced by a partial unique index and transaction
  locks. Retried submissions return the existing request, including after task
  completion, without replacing instructions. Different fundraisers' tasks may
  still create distinct requests; organization-wide fulfillment deduplication is
  not claimed by this increment.
- Create validates the actual viewer, selected workspace, edit permission, active
  actor/owner, task status/version, and server-owned gift identity. Staff writes
  recheck the real actor's reviewer role/active status inside the transaction and
  require the expected request version. Cross-site JSON writes are rejected.
- `stewardship_request_events` is an audit ledger only, with actor, note, status,
  and version. Request plus audit updates are atomic. Task deletion cannot cascade
  away the request or its audit history. Failed or ambiguous create responses ask
  the user to reload saved status before attempting another submission.
- The legacy generic request creator cannot create linked stewardship requests;
  its dedup/update path excludes them. The generic reviewer PATCH cannot bypass
  the versioned Stewardship writer. Existing contact/research requests keep their
  original workflows.
- Staff management requires actual Admin or Advancement Services access. An MGO
  sees only requests authorized by the existing requester/owner scope, not other
  fundraisers' records. Read-only delegated viewers cannot request assistance.
- Staff notes in this workflow are shared, not confidential internal notes.
  Existing data-request list endpoints remain the authorized read path.

No email, NXT action, appeal, letter generation, inventory reservation/deduction,
or household-recipient inference is triggered. The existing Add NXT action remains
a separate explicitly approved workflow. General thank-you letters must not reuse
society qualification or sent-appeal codes merely because a request says "letter."

## Verification

- Full regression suite: 5,006 passed; 52 unrelated opt-in tests skipped.
- Included 17 new PostgreSQL tests using a disposable local socket database:
  replay/concurrent submissions, stale task versions, owner/role changes,
  concurrent staff updates, audit atomicity, and request survival after task removal.
- API and UI tests cover scope, inactive/read-only actors, JSON/cross-site guards,
  malformed fields, double clicks, ambiguous-save recovery, staff vs solicitor
  routes, completed-task links, no duplicate editor, and no added NXT reads.
- Typecheck and production build passed; `git diff --check` passed.
- Browser QA used synthetic local records only. Verified submitting once, staff
  progress updates, the same status/note in the solicitor work queue and task,
  plus 390px mobile layouts without horizontal overflow.

## Future increments

A later verified NXT action/custom-field integration should link the existing
durable receipts and reconcile partial or uncertain results without replaying
external creation. Assignment and shipment/hand-off tracking should reuse this
request identity, not create a competing request inbox. Request completion alone
must never be treated as proof of delivery.
