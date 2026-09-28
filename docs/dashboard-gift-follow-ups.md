# Gift-linked stewardship follow-ups

Implemented September 28, 2026. Not yet deployed.

## User workflow

1. On My Dashboard, open Nellie and choose **Create a stewardship follow-up** on a recent gift.
2. Review the saved donor, gift amount, and gift date. Enter the task, an optional due date, and optional notes.
3. The selected workspace owner owns this task. Admins can use a selected MGO workspace; other users can create their own. Read-only workspaces do not offer creation. To change owners, close the dialog and select the appropriate workspace first.
4. Choose **Create follow-up**, then **View follow-up** to open Follow-ups & Discussion > Next steps. Edit, reschedule, complete, or reopen it there.

This creates an additional app task, never replacing the primary next step. Nothing is sent, marked thanked, or written to NXT. The gift reminder is not automatically dismissed. The saved gift context remains separate from editable notes and is available in the task's Details and completed history.

One gift can create only one follow-up **per workspace**, even after completion, edits, a gift revision, or a retry. Different workspaces may each have a follow-up for a shared portfolio gift; this is not an organization-wide stewardship ledger. Staff should review donor history before contacting someone. Existing manually created tasks or NXT actions are not automatically matched by wording.

## Saved-data and permission boundaries

- The dialog and its API read run only when requested. Opening the dashboard/helper does not trigger this workflow, NXT enrichment, AI generation, a background refresh, or a message.
- `GET /api/dashboard-gift-follow-up` returns current saved gift context or this owner's existing task. `POST` explicitly creates a task. Both require matching workspace scope, an active permitted user, and the enabled organization helper.
- The client submits a gift key/revision and editable task text/date only. Donor identity, amount, gift date, source revision, and owner are derived on the server. Current saved gift/portfolio eligibility is checked again on creation using the existing gift-reminder policy.
- The write transaction locks actor/owner rows in ID order and rechecks active flags, roles, saved portfolio freshness, and constituent assignment. The saved source is a snapshot, not a live NXT verification. Its facts can subsequently change in NXT.
- An uncertain submission disables another write until the user explicitly checks saved status. Existing-task recovery works even after the source ages out or becomes unavailable, and it never replaces the task's original gift snapshot.
- Responses are private/no-store and checked against viewer, workspace, gift key, and revision. No donor data is stored in browser local storage. Closing with edits offers an explicit discard confirmation; workspace switches unmount the scoped dialog.

## Persistence and integration

`ensureAppSchema` adds nullable `pending_actions.source_gift_id` and `source_gift_snapshot` columns, plus the partial unique index `idx_pending_actions_gift_origin` on `(owner_user_id, source_gift_id)`. Existing tasks are unchanged; there is no data backfill.

Creation inserts category `Stewardship`, status `Open`, `is_primary = false`, `needs_discussion = false`, and `entered_by_user_id`. The task links to an owned local constituent, reusing an existing row or creating one from the verified saved NXT ID/name. No name-based identity inference is used. It intentionally does not link to a prospect row, avoiding cascade deletion of duplicate protection when a Top Prospect is removed. Existing constituent-based follow-up reads support this linkage.

The standard pending-action editor cannot make gift-origin tasks primary, link them to an opportunity, or synchronize them into a discussion. It does not accept changes to the saved gift origin. Completion/rescheduling remains in the existing workflow. The Follow-ups API returns the gift snapshot in the same saved-data query, without extra NXT reads.

Server dashboard cache invalidation happens after commit and cannot turn a successful creation into an ambiguous failure. Client queries are invalidated without automatic refetches, avoiding unrelated provider-backed requests.

## Validation

- Final regression run: 4,861 tests passed, including the 13 local PostgreSQL tests; 52 other opt-in tests skipped. Typecheck, production build, release-worktree check, and diff whitespace check passed.
- API tests cover authorization, Admin delegation, read-only workspaces, source/revision changes, request bounds, date validation, forged identity/owner fields, origin checks, existing completed tasks, and cache-failure recovery.
- Component tests cover explicit submission, owner/date/notes, discard protection, double clicks, uncertain-result read-only recovery, scope mismatch, workspace unmount, and provenance in completed history.
- Thirteen real PostgreSQL tests use synthetic records and production schema statements. They exercise concurrent submissions, owner isolation, existing constituent reuse, immutable snapshots, completed tasks, Top Prospect removal, and role/assignment changes at commit.
- Synthetic browser checks verified desktop and 390px phone layout, editable notes, save confirmation, existing-task reuse, and no horizontal overflow. No production follow-up, email, or NXT write was created.

To rerun database tests, initialize an isolated local PostgreSQL cluster under `/tmp/gift-followup-pg.XXXXXX`, listen only on its Unix socket at port 55448, then run from `apps/web`:

```sh
GIFT_FOLLOWUP_TEST_PG_SOCKET=/tmp/gift-followup-pg.XXXXXX npm test -- src/app/api/utils/giftFollowUp.integration.test.js
```

The test rejects other socket path patterns, never uses `DATABASE_URL`, and creates only the disposable `gift_followup_fixture` schema. Stop the test cluster afterward.

## Release check

Deploy only when requested. On JU after deployment, open Nellie in an editable workspace and inspect the form without saving a real task unless authorized. Confirm an Executive's delegated read-only workspace does not offer creation. Any real end-to-end task creation should use an explicitly approved donor/gift and owner.
