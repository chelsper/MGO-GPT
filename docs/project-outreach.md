# Project Outreach Pilot

Project Outreach extends explicitly shared Project Prospecting constituent lists. It does not assign an NXT solicitor, change a portfolio, add a membership custom field, make calls, or send email.

## Staff workflow

1. Admin or Advancement Services creates a project using the intended saved constituent query and explicitly grants access to managers and callers. Check the query ID before refreshing; no new query is selected or run by Outreach itself.
2. Refresh the list through the existing query workflow. Map Constituent System Record ID, not the lookup ID or query row ID. Include constituent name, phone and contact restrictions in query outputs where available.
3. Open Outreach assignments. Save the name/contact columns, project deadline, caller instructions and NXT action type. Changing the project deadline does not silently change existing assignments.
4. Select people individually or in batches of up to 100, choose an active project member and due date, review, then confirm. Reassignments preserve history. One caller per constituent per project; different projects may have separate assignments.
5. MGOs open Project Outreach and choose a project. My outreach defaults to their queue. Review current NXT contact preferences before calling; saved query contact data may be stale. Blank restriction fields never imply permission.
6. Record an outcome, actual date and notes. Choose completion or a follow-up date. Save outcome only keeps the result locally; Save & submit NXT action saves first and then attempts the NXT action using the recording user's own NXT connection and verified fundraiser ID.
7. NXT confirmation is separate from outreach completion. An unsubmitted/unconfirmed action stays visible in Open outreach even if outreach is complete. Reopen recorded outcomes to submit a saved draft or verify an existing action. Verification never creates, resends or edits an action.

## Security and durability

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
