# Project Outreach Pilot

Project Outreach extends explicitly shared Project Prospecting constituent lists. It does not assign an NXT solicitor, change a portfolio, add a membership custom field, make calls, or send email.

## Staff workflow

1. Admin or Advancement Services creates a project using the intended saved constituent query and explicitly grants access to managers and callers. Check the query ID before refreshing; no new query is selected or run by Outreach itself.
2. Refresh the list through the existing query workflow. Map Constituent System Record ID, not the lookup ID or query row ID. Include constituent name, phone and contact restrictions in query outputs where available.
3. Open Outreach assignments. Save the name/contact columns, project deadline, caller instructions and NXT action type. Changing the project deadline does not silently change existing assignments.
4. Select people individually or in batches of up to 100, choose an active project member and due date, review, then confirm. Reassignments preserve history. One caller per constituent per project; different projects may have separate assignments.
5. MGOs open Tasks and choose Start / continue my calls or View my assignments. The dedicated caller workspace shows only their own assignments and their unfinished NXT updates, even if the caller is also a manager. Review current NXT contact preferences before calling; saved query contact data may be stale. Blank restriction fields never imply permission.
6. Record an outcome, actual date and notes. Choose completion or a follow-up date. Save outcome only keeps the result locally; Save & submit NXT action saves first and then attempts the NXT action using the recording user's own NXT connection and verified fundraiser ID.
7. NXT confirmation is separate from outreach completion. An unsubmitted/unconfirmed action stays visible in Open outreach even if outreach is complete. Reopen recorded outcomes to submit a saved draft or verify an existing action. Verification never creates, resends or edits an action.

## Security and durability

### Personal priorities overview

Tasks is a primary Home and navigation shortcut. `/tasks` opens the current
assigned call list directly, without a management step or report tabs. Multiple
active projects use a picker; changing projects requires confirmation to avoid
silently losing an open outcome. Project Prospecting remains separate in Reports.
The existing signed-in-only priorities endpoint is unchanged for other callers.

The new saved workspace overview honors the validated selected MGO workspace.
An Admin/Executive viewing an MGO sees a clearly labeled read-only preview, not
their own empty queue. Both accounts must have explicit project access. Persisted
roles, active status, origin and sharing are checked in the aggregate SELECT.
Invalid workspace selections fail closed, rather than falling back to another
person or showing a false zero. The dedicated preview route rechecks access after
reading, returns only that caller's assignments/authored history, strips all write
capabilities and rejects POST. Recording, NXT submission and verification still
require the actual caller's login. No impersonation, grants or reassignment.

Personal Tasks and the caller view contain no team-management links, even for an
Admin viewing the MGO layout. The existing explicit manager routes retain their
permissions and tools. Portfolio follow-ups remain in Follow-ups & Discussion.
No new tasks, provider requests, schedule changes or schema changes are introduced.

Opening outreach from Tasks uses `?from=tasks`. `/project-outreach/:listKey`
defaults to a dedicated assigned-outreach workspace with a fixed return to My
Tasks. It has no Reports navigation, prospecting tabs, query refresh controls,
bulk assignment controls or team statistics. Direct links use this same caller
view. Only the explicit `?view=manage` route opens the existing manager workspace;
existing server permissions still control every read and write. Project
management remains on the separate outreach landing page, not My Tasks.
Project Prospecting stays in Reports; it is not shown as personal work
without actual assignments or unfinished actions.

The Start shortcut consumes `start=calls` once, preserves other safe URL context,
and opens only the signed-in caller's next eligible assignment. View my
assignments opens the personal list without opening an outcome. The separate
Finish NXT updates shortcut uses `focus=nxt` to show the caller's own unfinished
events, including after reassignment, without placing the person back in the
calling queue. Status filters, saved activity, instructions and personal NXT
help remain available. Opening an individual call shows contact context before
the outcome form; cancellation returns to the originating assignment when it
is still visible, otherwise to the call launcher. The existing unsaved-edit
confirmation, serial saves, verification and no-replay protections are unchanged.

Project Outreach's landing page shows the signed-in caller's saved workload
across explicitly shared projects: overdue, due today and upcoming assignments,
plus their own NXT drafts and actions awaiting verification. Projects with due
work appear first. Local filters narrow the project list; Open outreach uses the
existing workflow and does not start a call or submit an action automatically.

One aggregate database SELECT checks the persisted active account, caller role,
project sharing and app origin in the same statement. Managers do not bypass
project sharing or receive other callers' personal counts. Assignment and event
aggregates stay separate so multiple outcomes cannot multiply assignment totals.
Authored NXT work follows the original recorder after reassignment. No names,
contact details, outcome notes, credentials or provider responses enter this API.

These are scheduled-work counts, not live contact eligibility or a guarantee of
the guided-call queue size. Missing query members remain counted until staff
resolves the saved assignment; the individual project still applies its existing
membership, uncertainty and contact-review safeguards. Completed outreach is not
made due again because it has NXT paperwork outstanding. Assignments can count
in multiple projects; action counts are not unique people.

The overview uses the server's Eastern date and displays when saved counts were
read. Reload reads saved aggregates only. Errors, malformed payloads and missing
project counts never become false zero totals; project navigation remains usable.
No new schema, NXT requests, refreshes, notifications, grants or mutations.

### Manager progress

The collapsible Team progress panel uses the existing saved project payload for
Admin/Advancement Services managers only. It does not fetch NXT, change access,
assign callers or submit outcomes. Counts always cover the accessible project,
not the current table search or pagination. Unassigned counts use unique system
record IDs in the current saved query. Former/inactive callers remain visible
when they own assignments or outstanding action history; they are not added to
the eligible caller picker.

Assigned/not-started/overdue/due-today/complete and assignment-review counts use
current assignment ownership. NXT draft/verification counts use each event's
recording user, even after reassignment, and count actions rather than people.
Complete is not a claim of NXT confirmation. Overdue excludes completed work and
uses the server-supplied date, not the browser's local date. Counts overlap.

Selecting a count opens the matching people, clears hidden search/status/scope
filters and existing selections, and focuses an explanatory heading. Back to
previous view restores prior filters/page. Manual filter edits exit the progress
focus. Open outcome drafts disable count navigation; the guided caller workflow
remains caller-specific and retains the prior focused view on cancellation.
Existing per-user submit/verify controls remain unchanged; no manager can submit
someone else's action from this panel.

### Guided calling queue

Start my next call opens the signed-in caller's own available assignments across
the current project, independent of the overview's filters or page. Overdue
follow-ups come first, then overdue/today assignments, then not-started work.
Future follow-ups, completed outreach (even with unsubmitted NXT paperwork),
inactive/unshared callers, missing query members and uncertain NXT actions are
not suggested. This is a saved-data work queue, not permission to contact someone.

The guided view shows one person's combined saved phone values, restrictions,
project overlap warning, caller instructions and latest outcome. Focus moves to
the person's name, so contact checks appear before outcome entry. No call, query
refresh, portfolio change or NXT request occurs when starting the queue.

Save & next (local only) records the outcome without NXT. Save, submit & next also
explicitly submits its NXT action using the existing receipt safeguards. Both
reload saved status and compare the exact immutable outcome before advancing;
the latter also requires persisted NXT confirmation. An uncertain response stops
the flow. Reload can recover a saved outcome, after which the caller explicitly
continues or verifies/submits that same saved event. No automatic resend occurs.

The next person is selected from the refreshed assignments. People already
handled during this page session are not automatically offered again, including
same-day follow-ups. Nothing is silently marked complete. Cancel asks before
discarding edits and returns to the prior list filters; existing list/history
controls remain available. No database/schema or provider-write contract changes.
Explicitly rejected saves can be retried or cancelled without hiding the person.
Unconfirmed attempts left for the list are paused separately, not counted as
handled. Reloading an exhausted queue offers newly available assignments without
automatically opening a call or losing the previous result.

### Setup and readiness checklist

Outreach now includes a collapsible checklist of saved query results, system-ID
and contact mappings, deadline, instructions and eligible caller access. Links
open the current project's configuration/access tab or focus the relevant setup
field. Go to list refresh only focuses the existing control; it does not run a
query. Empty complete query results are not displayed as a refresh failure.

Caller NXT setup is advisory and reads database flags only. It does not retrieve
tokens, renew credentials, call NXT, or promise successful submission. Managers
see only active, explicitly shared eligible callers; MGOs see only themselves;
executive-only viewers get no connection metadata. Saved mappings are not proof
of an active fundraiser: the existing live identity/permission checks still run
on submission. An expired access token with a saved refresh token is described
as renewal due, not a failed connection. Connection status unavailable, missing
phone/restriction outputs, or missing instructions do not add write gates.
Save outcome only remains independent of NXT connectivity. No schema migration,
automatic access grants, source refresh, or action submission is introduced.

### Existing safeguards

- Existing active-account and explicit project-viewer authorization applies to every endpoint; Admin does not bypass project access. Executive-only viewers cannot assign, record or submit.
- Managers assign only active, explicitly shared callers with MGO or management roles. MGOs record only their own assignments and submit/verify only their own immutable outcomes.
- Same-origin JSON writes, bounded inputs, optimistic report/settings/task revisions, current snapshot checks and transaction row locks protect mutations. Audit insertion is part of each assignment/outcome/settings transaction.
- Assignments and outcomes are application-only durable tables. A refreshed query does not delete assignments, outcomes or NXT receipts. Missing query members pause new outcomes but retain history and existing-action verification.
- Overlap warnings reveal only other accessible projects. Identity deduplication uses the explicitly mapped NXT system record ID; never names.
- Each outcome has a stable UUID. A durable local claim plus the existing global NXT create receipt prevents replay. Unknown POST/PATCH results remain held; there is no timer-based unlock or automatic resend. Exact existing-record verification includes constituent, date, notes/reference, completion, category/type and fundraiser.
- A create guard that explicitly refuses before any provider call because of an unrelated pending receipt can return that outcome to draft only if no matching durable receipt exists. All uncertain creates remain protected.
- NXT verification and its local event confirmation commit atomically. Receipt fallback can recover a lost local receipt checkpoint using owner and exact saved payload.
- Calls are serial per UI submission, with 12-second provider timeouts and zero POST/PATCH retries. The UI times out after 60 seconds and asks for saved-status reload rather than resubmitting.

## Pilot limits and recovery

Existing query result limits still apply (see Project Prospecting documentation). The view supports 10,000 saved assignments/outcomes per project and 25 visible people per page; use a new project for a new cycle. No automatic notifications, outbound calls or second planned NXT follow-up actions are created. The follow-up date is tracked in this project and the completed action notes.

If an action exists but differs from the immutable saved outcome, staff must inspect/correct that existing record in NXT, then verify its system ID. Do not create a replacement. If no receipt or record can be confirmed, escalate for administrator review; this pilot deliberately has no unsafe release button. Staff losing project access cannot submit or verify until authorized access is restored. No background or shared-account impersonation is used.

The first real query ID, deadline and authorized callers must be supplied before the live pilot. End-to-end NXT writes require a staff-controlled test constituent or an explicitly supervised real action. Local tests never use production donor records or NXT.

## Verification

Required workflow tests cover mapping, deduplication, form flow, role/API boundaries, timeout handling and action receipts. `projectOutreach.integration.test.js` additionally runs real prepared SQL against a disposable PostgreSQL fixture, enabled only by `PROJECT_OUTREACH_TEST_PG_SOCKET=/private/tmp/project-outreach-pg.<suffix>` on port 55451. It never reads `DATABASE_URL`. Test roles, snapshots and constituents are fictional.
# Conditional Pledge Context

Project managers can optionally enable saved pledge reminders when a single-row
query includes matching `Gifts N N Installments N N Installment Balance` and
`Installment Date Due` fields. Call cards show positive unpaid balances that are
past due or due by the project deadline; paid, empty and later installments stay
hidden. This is saved context, not a live balance, complete pledge history, or a
financial rollup. Missing/conflicting pairs require checking NXT. Fields are
paired within the same query row and exact gift/installment slot, never across
aggregated values. Default list-display columns can hide the underlying repeated
fields without deleting them or changing NXT. Existing projects are unchanged
unless a manager enables this option.
