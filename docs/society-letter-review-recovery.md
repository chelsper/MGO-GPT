# Society Letter Review Recovery (Step 5)

## Workflow

The holding list offers **Resume review** after an individual or bulk review
begins. It resumes the current recipient from saved rows, even outside the
current filters, and ignores rows that are no longer editable. On finishing a
queue with skipped/unreviewed recipients, the checkpoint returns to the first
unfinished recipient. Completed queues clear their checkpoint.

Leaving a dialog with edits offers **Keep editing**, **Discard edits and
continue**, or **Keep draft and continue**. Kept drafts survive closing or
moving within this page visit, and are restored without the review checkbox.
They are not saved recipient choices or delivery approvals.

Only queue IDs, current ID, delivery channel and timestamp are remembered in
tab-scoped session storage, separately for the authenticated reviewer and
recognition period, with a 24-hour expiry and 50-row limit. Names, addresses,
wording, tokens and approvals never enter browser storage. Unsaved draft values
remain only in page memory. Leaving or reloading loses those values and raises
the browser's unsaved-edit warning when supported. This is not cross-device or
durable draft recovery. Blocked/corrupt browser storage does not block review.

## Conflicts

A save conflict or changed saved-recipient version disables saving and
previewing but retains edits. **Load saved choices to compare** performs only
the existing private/no-store workspace GET, not an NXT refresh or mutation.
Changed fields appear first; unchanged fields are collapsed. Comparison moves
keyboard focus to its heading.

**Keep my draft for review** is available only if the source/household review
token is unchanged. Otherwise staff must use the latest choices and review
the recipient again. A second change while comparing requires another read;
unavailable/excluded recipients cannot be saved. Reload failures keep drafts.
Both choices clear confirmation and require a separate explicit Save against
the latest workspace revision. Paused conflicted drafts still require comparison
when reopened. Existing server revision, lease, source token, membership,
hierarchy, readiness, send and appeal-assignment protections are unchanged.

The API adds only the authenticated reviewer ID to the existing workspace
response. No new tables, background jobs, NXT calls, delivery triggers or
dependencies are introduced.

## Validation / Release

Coverage includes storage privacy/expiry/invalid values, reviewer and period
isolation, interrupted and filtered queues, remount without draft persistence,
changed sources, unavailable rows, read failures, repeated conflicts, explicit
comparison and reconfirmation, and use of the latest revision. Browser QA uses
fictional local recipients; no real letters or constituent changes are made.

September 25 validation: 4,365 tests passed, 28 opt-in tests skipped. Production
build, typecheck, release guard and diff check passed. Desktop and 390-pixel
mobile QA confirmed comparison, preserved wording, close/resume without
approval, and explicit save advancing to the next recipient. The temporary
preview server was stopped and viewport overrides reset afterward.

Step 5 remains local and is not included in the step 4/invitation deployments.
