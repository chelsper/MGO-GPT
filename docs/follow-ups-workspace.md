# Follow-ups & Discussion

## First release

`/follow-ups` combines navigation, not ownership or data models. It opens on Next
Steps. Team Discussion remains a separate tab with its existing visibility and
editing rules. Existing `/team-discussion` bookmarks, `discussionId`, `status`,
and `edit=1` links continue to work. The menu and dashboard point to the new page.
Notification badges still describe discussion items, not a combined task count.
Both route files import `FollowUpsWorkspace` from the components directory; do
not import one route page from another, as the build plugin wraps each page in
the app layout and that would duplicate the navigation shell.

Next Steps shows every saved `pending_actions` row owned by the selected workspace,
including portfolio-only constituents, stewardship, and closed prospect work.
Open items group by Overdue, Today, Upcoming, and No date, using an Eastern
calendar-date boundary. Completed history is a separate view with Reopen. Search
filters the full result before pagination (25 items per page); notes and links
are collapsed by default. The homepage remains a short preview, not the full list.

## Data and safety

- `/api/follow-ups` uses one saved-data SQL query per status selection or explicit
  reload. There are no NXT calls, per-row enrichment, polling, or cron changes.
  Searching and paging do not fetch again. Discussion code/data load only when
  its tab is first opened.
- The server resolves the workspace from the authenticated session and acting
  cookie. URL workspace IDs cannot widen access. Joins remain owner-scoped, and
  discussion links are returned only when that workspace can view the discussion.
- Client caches are scoped by viewer, workspace, and status. Mismatched response
  identities fail closed. Saved data is not persisted in browser storage.
- The existing workspace permissions allow an MGO to edit their own reminders
  and Admins to edit a selected MGO's reminders; executive acting views stay
  read-only. A next step does not become shared merely because it is on this page.
- Editing uses the existing shared next-step fields and pending-action endpoint.
  This page sends only title, notes, due date, expected workspace, and an exact
  `updated_at` token. PostgreSQL timestamp text preserves microseconds for the
  atomic stale-edit guard. A workspace/version conflict leaves the draft intact.
- Tab changes preserve drafts. Leaving with unsaved task edits warns the user;
  changing status, reloading, or cancelling asks before discarding changed fields.
  Failed saves do not erase the draft, and duplicate submissions are blocked.
- Task edits do not reopen an already-resolved linked discussion unless discussion
  is explicitly newly requested through the existing workflow. Task completion
  and discussion resolution remain distinct.

## Quick actions

- Open reminders offer Mark complete and Reschedule. The full title/notes editor
  is under Details so the default card stays compact.
- Reschedule offers Today, Tomorrow, In 1 week, No date, and a custom calendar
  date. Shortcuts use Eastern calendar days, including across DST boundaries.
  Only the reminder's due date changes; notes, title, and discussion date stay put.
- Mark complete moves an item to Completed history. Reopen restores it to Open
  as an additional follow-up, not as the primary next step. This deliberately
  preserves any newer primary plan. Neither action changes a linked discussion.
- POST `/api/pending-actions/:id/quick-action` accepts only the selected action,
  an optional date for rescheduling, the expected workspace, and the exact
  version token. Server ownership and write permissions still apply. State and
  version conflicts require reloading the saved list; there is no automatic retry.
- One SQL statement locks the task and its relevant primary prospect, updates
  the reminder, mirrors a matching primary summary, and invalidates only the
  local dashboard summary cache. A mismatched primary plan blocks the entire
  update rather than overwriting it. Provider/portfolio caches remain intact.
- New primary steps no longer reuse completed rows. Prior completed titles,
  dates, and completion timestamps remain in history, including after a new
  primary step is added. Demotion changes the row version for stale-edit checks.
- The UI waits for success before moving an item, prevents double submissions,
  preserves failed reschedule drafts, and confirms before discarding changed
  fields. Success messages explain the app-only result and receive focus.
- These controls do not create NXT actions, call Blackbaud, resolve discussions,
  add background polling, or trigger portfolio refreshes.

## Deferred

No combined All feed, reassignment, or expansion of the portfolio activity pilot
is included. Editing a reminder or using Mark complete is still not evidence an
NXT action occurred.

## Log NXT Action From a Next Step

- Open reminders now offer an explicit Log NXT action dialog. It is lazy-loaded
  on click, with a single saved-data context read. Opening, searching, paging,
  or expanding next steps still does not call NXT.
- The dialog prefills the task title/notes, Eastern today's date, and Stewardship
  type for stewardship reminders (otherwise Cultivation). Category is deliberately
  unselected: the user describes what actually happened, not merely the planned
  activity. Category/type options are shared with the existing action form.
- Credit goes to the selected MGO; the signed-in Admin remains the author.
  A linked NXT opportunity is retained only through the owned prospect relationship.
  Portfolio-only reminders are supported when their constituent link is unambiguous.
- Complete this next step after NXT confirms the action is optional. The action
  date must not be in the future. No new next step, discussion, or opportunity is
  created. Linked discussions remain unchanged.
- GET/POST `/api/pending-actions/:id/log-action` enforce session/workspace ownership
  and editing permissions. The context token includes the exact task version and
  constituent/opportunity links. Conflicting/missing links fail closed, with no
  guessed record search or automatic link repair.
- Before sending, NXT must confirm the constituent system ID and the primary MGO's
  fundraiser mapping. Then a durable `pending_action_nxt_receipts` row is claimed
  atomically before the create call. Only one action submission is allowed per
  reminder, even after reload or reopening. Duplicate clicks/concurrent requests
  return the existing receipt, never repeat the create call.
- This workflow disables Blackbaud POST retries and does not use fallback create
  payloads. After an ambiguous timeout/crash the receipt remains blocked for review.
  Reload submission status only reads local data. Check NXT before making further
  changes; there is deliberately no force-resend or delete-receipt button.
- The created action ID is saved before metadata work. The server checks the
  action's exact identity before patching, then re-reads and verifies constituent,
  date, summary, notes, category, type, completed flag, fundraiser credit, and linked
  opportunity. Only then is the existing guarded completion helper called.
- A changed reminder/primary plan is not overwritten. A saved NXT action with
  failed local completion is reported separately; reload the list and use the
  existing Mark complete control after review rather than logging again.
- Successful actions get a single local prospect activity entry when a prospect
  exists. No legacy action-save endpoint is used, because that older workflow can
  clear a primary next step independently of NXT success. Existing normal action
  entry behavior is unchanged. Portfolio caches and refresh schedules are unchanged;
  the existing successful-create activity refresh hint is retained.
- Native modal focus/keyboard handling, dirty-draft confirmation, in-flight close
  blocking, and before-unload protection keep review deliberate. An uncertain
  response disables resubmission and offers read-only status recovery.

## Create a Next Step From Team Discussion

- Each editable discussion offers Create next step. The dialog loads saved local
  context only when opened, prefills subject/notes/date, and requires a topic choice
  when more than one constituent is linked. General discussions can create a
  general follow-up without a constituent or NXT action button.
- Users can create their own follow-ups. Admins can choose another active MGO
  who already owns, is assigned, or is tagged in the discussion. This does not
  grant discussion access or widen workspace editing permissions. Executive acting
  views remain read-only. Local-only constituent links stay with their owner.
- POST `/api/discussion-items/:id/next-step` creates an additional reminder, never
  a primary replacement. NXT system IDs map only to the target owner's local
  constituent/prospect records. If needed, a lightweight local constituent link
  is saved using the discussion's existing NXT ID; nothing is created in NXT.
  Opportunity links are retained only through that owner's matching prospect.
- `source_discussion_id`, `source_topic_key`, and `entered_by_user_id` preserve
  origin and author. A unique source/owner/topic index and transaction-level source
  lock prevent repeat submissions, including after completion or a lost response.
  Reopen or edit the existing task instead of creating another for the same topic
  and owner. A different topic or responsible owner can have a separate follow-up.
- Exact discussion versions, current membership, user roles, and the selected
  constituent identity are checked again at the write boundary. Changed context
  fails closed. Cache invalidation cannot turn a committed success into failure.
- The discussion shows the linked owner, due date, and completion status. This
  limited shared metadata is disclosed before saving; private follow-up notes are
  not returned on discussion cards. Same-workspace links open the correct status
  and page in Next Steps and focus the linked item.
- Origin reminders bypass legacy discussion synchronization on edit. Completing,
  reopening, and rescheduling do not modify the original discussion, nor does
  resolving the discussion complete its reminders. Primary prospect plans remain
  untouched. There are no NXT calls, polling, or maintenance-schedule changes.

## Verification

Covered by API scope/permission tests, date/group/search/pagination tests, and
real-component tests for lazy tabs, local search/paging, exact edit payloads,
conflicts/draft retention, history, keyboard tabs, and legacy links. Desktop and
390px/320px phone previews use synthetic local data, never production test writes.
Quick-action coverage includes strict payload/date validation, exact-version
conflicts, acting permissions, date-only saves, completion/history/reopening,
duplicate-click protection, read-only views, and failed-save retention. Disposable
PostgreSQL verification exercises real SQL with synthetic primary and portfolio
tasks, including newer-plan protection and completed-history preservation.
Action logging tests cover attribution, permissions, stale context, idempotency,
preflight failures, uncertain writes, metadata verification, partial success,
saved-data-only dialog loading, draft retention, and duplicate-click protection.
Disposable PostgreSQL checks exercise the actual receipt schema, context/claim
queries, local activity insert, and completion helper with synthetic records.
