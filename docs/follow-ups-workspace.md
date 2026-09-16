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

No combined All feed, action logging controls, reassignment, NXT action
creation, or expansion of the portfolio activity pilot is included. Editing a
reminder or marking it complete is not evidence an NXT action occurred. A later
release can add an explicit Log Action workflow with those distinctions intact.

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
