# Stewardship assistance requests

Implemented and validated September 28, 2026. See the dated JU release note for
deployment status and live verification. Development testing used only synthetic
local data; production records, NXT connections, and email systems were not used.

## User workflow

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

Add assignment and explicit fulfillment records before treating request completion
as any delivery outcome. A later verified NXT action/custom-field integration should
link durable receipts and reconcile partial or uncertain results without replaying
external creation. Catalog, inventory, shipment/hand-off tracking and non-gift
requests should reuse this request identity, not create a competing request inbox.
