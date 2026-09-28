# Stewardship Overview

The home page offers four one-click shortcuts: letters in the holding list,
unfinished batches, prepared letters not yet mailed, and open assistance
requests. Existing Society Letters, Letter setup, and Gift Follow-ups remain
available. This is navigation, not another approval or task queue.

One authenticated `GET /api/stewardship/overview` returns saved counts only.
The query projects IDs and statuses without loading Word/PDF bytes, mailing
addresses, review wording, staff notes, or full request records. It makes no
NXT calls and starts no jobs. There is no polling or automatic retry; staff can
reload counts explicitly. Links remain usable during loading and failures.

Holding counts use the existing household exclusion, reservation, and society
hierarchy rules for the current recognition period. They count households
still in the holding list, not a promise that every letter needs an edit or
is ready to send. Missing/prior-period membership is unavailable, not zero.
An in-progress batch is counted once; a saved approval draft is also counted.
Prepared postal letters with appeal receipts require every member verified
before appearing as ready to mail. Legacy postal letters without appeal
receipts retain their existing prepared status. Mailing remains a separate
staff-confirmed action. Pending batches from earlier periods remain visible.

Requests are counted from the same linked `data_change_requests` records used
by Stewardship, fundraiser queues, and dashboard follow-ups. Completed and
declined requests are excluded; overdue dates use organization time zone.
No new task, record, notification, schema, cron, or workflow is introduced.

The endpoint checks the real signed-in reviewer, not the delegated workspace.
Responses are private/no-store; the UI isolates counts by signed-in identity,
clears old counts on failed reload, and never displays a failure as zero work.
The overview does not change letter eligibility, appeal writes, PDF settings,
or the existing send/approval protections.

## Validation

- Full local suite: 5,049 passed, 99 skipped; typecheck and production build passed.
- Temporary PostgreSQL suite: 14 passed, including the projected overview query
  and a check that reading counts leaves saved letter state unchanged.
- Fictional-data browser check at desktop and 390px mobile widths passed with no
  horizontal overflow. No production requests or NXT writes were made.
- This overview has not yet been deployed.
