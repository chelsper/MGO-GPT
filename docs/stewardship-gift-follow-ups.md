# Stewardship Gift Follow-ups

## Purpose and navigation

`Stewardship -> Gift Follow-ups` gives active Admin and Advancement Services
users a shared, read-only view of existing gift-linked tasks. The Back link and
breadcrumbs return to Stewardship, not directly to the home dashboard.

Each row shows the saved donor identity, gift amount/date, task title,
responsible workspace owner, due date and current task status. The fundraiser
label follows the organization's display terminology. Inactive owners remain
visible and labeled so their outstanding work is not silently lost.

Search donor, constituent ID, task title or owner; filter by owner, Open /
Completed / All tasks, or open-task due date. Next 7 days means tomorrow through
seven days after the organization's reporting date. Undated tasks are included
in the default view and have their own filter. Results are ordered by due date
(undated last), then task ID, with 25 rows per page.

## Data and permissions

- The sole task source is `pending_actions` with `source_gift_id IS NOT NULL`.
  There is no new task table, copied queue, migration, background job or provider
  refresh. Existing task edits, completion and reopening appear on the next read.
- `GET /api/stewardship/gift-follow-ups` authorizes the real signed-in application
  user with `isReviewerRole`, not the selected workspace, browser role or a query
  parameter. MGO-only and Executive-only users cannot read this endpoint.
  Existing per-workspace mutation permissions are unchanged.
- One parameterized SQL statement projects the page, matching count and owner
  choices from the same database snapshot. Page bounds are validated and an
  obsolete page is clamped to the last available page. Search is literal, not a
  SQL wildcard expression. Owner choices do not disappear with task filters.
- Only the necessary saved task/gift projection is returned. No task notes,
  discussion text, user emails, portfolio caches or society-letter review state
  are included. Responses are private/no-store and contain the authenticated
  session identity for client-side response checks.
- The browser fetches on opening, applying/resetting filters, changing pages or
  explicitly reloading. It does not poll, refresh on window focus/reconnect, or
  fetch while typing. In-flight requests abort on unmount; errors and identity
  changes do not display earlier task rows as current results.

## Meaning of progress

Gift details are the immutable snapshot captured when the task was created, not
a live NXT gift check. Completing a task does **not** establish that an email or
letter was sent, delivered, mailed, or that the donor was thanked.

The existing uniqueness rule is per workspace owner and gift, not organization
wide. Where the same gift ID and saved constituent ID occur in multiple workspace
tasks, the view notes the total number of linked tasks across statuses. These are
not inferred duplicate communications; gifts are never summed across these rows.

Society letters remain separate. This increment neither requests nor generates
letters, applies appeals, modifies recipients, marks delivery, nor calls NXT.
An explicit letter-request workflow and verified delivery linkage are later
phases, not implied by task completion.

## Validation

Route tests cover real-user authorization, inactive/unauthenticated accounts,
delegated-workspace isolation, bounded inputs, safe errors and read-only exports.
Component tests cover data rendering, explicit filters, pagination, completed and
undated tasks, inactive owners, empty/error states, session mismatch, cancellation
and navigation. A disposable PostgreSQL fixture exercises the actual query,
including stable ordering, literal searches, due-date boundaries, original-task
updates and unchanged records after reads. No production data is needed.

Run normal tests from `apps/web` with `npm test`. PostgreSQL integration checks
are opt-in with `GIFT_FOLLOWUP_TEST_PG_SOCKET=/tmp/gift-followup-pg.<id>` and a
disposable local PostgreSQL 18 server on Unix socket port 55448. They never read
`DATABASE_URL`; the shared-view fixture creates/drops only its named
`stewardship_gift_fixture` schema. The existing gift-task persistence fixture can
be run alongside it.

September 28, 2026 validation: 4,927 tests passed with both gift-follow-up
PostgreSQL fixtures enabled; 52 other opt-in tests were skipped. Typecheck,
production build, release-worktree guard and `git diff --check` passed. The build
reported no warnings. Desktop and 390px mobile QA used synthetic donors only;
filters, pagination, completed-state wording, parent navigation and no horizontal
overflow were verified. Temporary browser/server/database fixtures were stopped.
This work has not yet been deployed; JU and sandbox remain unchanged.
