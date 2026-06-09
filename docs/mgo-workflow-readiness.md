# MGO Workflow Readiness

This is the end-of-month release target for MGO usability.

The goal is not full feature completeness. The goal is a stable daily workflow that MGOs can trust.

## Priority 2 scope

Freeze and protect these workflows:

1. `My Prospects` loads and ranks correctly.
2. An MGO can open a prospect detail view reliably.
3. An MGO can set or update the primary next step.
4. An MGO can log an action/update.
5. An MGO can add and edit an opportunity.
6. An MGO can create a discussion item / handoff.
7. An MGO can close, archive, and reactivate a prospect.
8. `Prospect Pool` works for assignment, solicitor sync, and MGO disposition follow-up.

## Frozen acceptance criteria

### 1. Top Prospects list

User-facing behavior:

- `My Prospects` opens without crashing.
- Active prospects sort by `priority_order`.
- Rank up/down updates the order immediately.
- Executive view remains read-only.

Primary routes:

- `GET /api/prospects`
- `POST /api/prospects/reorder`

Primary files:

- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/my-top-prospects/page.jsx`
- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/api/prospects/route.js`
- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/api/prospects/reorder/route.js`

### 2. Prospect detail

User-facing behavior:

- `View Prospect` always opens the correct record.
- Detail panels load without timing out or crashing.
- Opening a record does not create false activity signals.

Primary route:

- `GET /api/prospects/:id`

Primary file:

- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/api/prospects/[id]/route.js`

### 3. Next step / pending action

User-facing behavior:

- MGO can create a primary next step.
- MGO can complete or update it.
- Next-step state is reflected back in the card and detail view.

Primary dependency:

- pending action sync logic called from the prospect detail flow

Primary files:

- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/my-top-prospects/page.jsx`
- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/api/utils/pendingActions.js`

### 4. Action logging

User-facing behavior:

- MGO can log an action with summary/notes/date.
- If Blackbaud linkage exists, NXT action creation either succeeds or returns actionable error text.
- Logged action appears in the prospect timeline.

Primary route:

- `POST /api/prospects/:id/actions`

Primary file:

- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/api/prospects/[id]/actions/route.js`

### 5. Opportunity create/edit

User-facing behavior:

- MGO can add an opportunity.
- MGO can edit stage, amount, dates, notes, and close state.
- If Blackbaud linkage exists, NXT sync either succeeds or returns actionable error text.

Primary routes:

- `POST /api/prospects/:id/opportunities`
- `PUT /api/prospects/opportunities/:id`

Primary files:

- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/api/prospects/[id]/opportunities/route.js`
- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/api/prospects/opportunities/[id]/route.js`

### 6. Discussion / handoff

User-facing behavior:

- MGO can create a discussion item.
- Assignee and due date save correctly.
- Open discussion state is visible on Top Prospects cards.

Primary dependency:

- discussion item routes and summary joins used by `GET /api/prospects`

### 7. Close / archive / reactivate

User-facing behavior:

- MGO can close a prospect as secured or declined.
- MGO can archive and later reactivate a prospect.
- Closed/archived state does not corrupt ranking behavior for active prospects.

Primary files:

- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/my-top-prospects/page.jsx`
- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/api/prospects/[id]/route.js`

### 8. Prospect Pool

User-facing behavior:

- Advancement Services can assign to an MGO.
- Assignment writes the app record and MGOGPT custom field.
- Assigned MGO can request Lead Solicitor assignment.
- Assigned MGO can send the second MGOGPT disposition/comment entry.

Primary routes:

- `GET /api/prospect-pool`
- `POST /api/prospect-pool`
- `PATCH /api/prospect-pool/:id`
- `POST /api/prospect-pool/:id/nxt-status-sync`

Primary files:

- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/prospect-pool/page.jsx`
- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/api/prospect-pool/route.js`
- `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/api/prospect-pool/[id]/route.js`

## Current coverage picture

### Stronger coverage

- `prospect-pool` route coverage is comparatively strong:
  - `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/api/prospect-pool/routes.test.js`
  - `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/api/prospect-pool/workflow.test.js`

### Clear gaps

- `prospects` route coverage is still thin:
  - `/Users/chelseasantoro/.codex/worktrees/1b6f/anything 2/apps/web/src/app/api/prospects/route.test.js`
- No obvious route-level tests yet for:
  - reorder
  - prospect detail GET behaviors
  - action logging
  - opportunity create
  - opportunity update

## Recommended hardening order

1. Add route tests for `POST /api/prospects/reorder`.
2. Add route tests for `POST /api/prospects/:id/actions`.
3. Add route tests for opportunity create/update.
4. Add one route test for `GET /api/prospects/:id` covering imported-opportunity refresh without false activity bump.
5. Run one manual UAT pass for the frozen workflow using:
   - one normal MGO
   - one executive admin acting as an MGO

## Release rule

Do not keep expanding the workflow surface this month.

If a feature is outside the frozen list above, it is secondary unless it blocks one of those workflows.
