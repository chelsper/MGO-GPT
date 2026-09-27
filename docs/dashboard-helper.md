# Dashboard helper: Step 2

Implemented September 27, 2026. This is separate from the deployed Step 1 donor briefings.

## User experience

- The personal/MGO dashboard offers a collapsed **Check in with Nellie** control. It does not appear on the Advancement Services dashboard or other pages.
- Opening it reads saved app records. It never calls NXT, runs an AI model, sends a message, or changes an opportunity or follow-up.
- Open follow-ups due today, overdue, or due within seven days appear alongside open opportunities with an expected date within 30 days, including past expected dates.
- Prompts ask the user to review the timing or follow-up. They do not recommend a stage change as a fact or infer intent from missing records.
- Review links open existing follow-up or prospect workflows. Their existing authorization and save/NXT confirmation rules remain in charge.
- Snooze until tomorrow or for one week, dismiss, and restore affect only the signed-in viewer's reminders for the selected workspace. They do not complete follow-ups or hide reminders from other viewers.
- Changes to the relevant saved facts bring a hidden reminder back. Completed/closed records disappear. Incidental sync timestamps do not revive a dismissal.
- Five reminders display at a time, with more available on request. No automatic opening, polling, or reminder counts are fetched on dashboard load.

## Organization settings

Organization Configurations > Institution Profile > Dashboard helper supports:

- Enable/disable for the organization.
- A name of 1-40 single-line characters.
- Dolphin or compass avatar, both local SVG assets without remote image requests.

These choices use the existing revision-checked profile save and audit. Older clients that omit the field preserve it. The shell's existing organization settings read supplies the UI; no second client settings request is added. Custom mascot uploads and generated artwork are not part of this increment.

## Data and safety

`GET /api/dashboard-priorities?workspaceId=...` requires an authenticated, active account with MGO, Executive, or Admin access, plus a resolved authorized workspace. The requested scope must match the workspace cookie; invalid delegation fails closed. Responses explicitly carry viewer/workspace identity and use `private, no-store`.

The endpoint reads at most 1,001 rows per source to detect truncation and processes at most 1,000 each. The UI explains when this is a limited selection. Opportunity copies collapse using the existing pipeline identity logic before open-status/date filtering, avoiding stale open copies of closed records. Conflicting identities and pending pipeline writes are withheld.

`PUT` accepts only a current candidate key/revision and a supported preference action. It rejects cross-site requests, stale workspace scope, stale facts, oversized bodies, and arbitrary user IDs. An Executive inspecting another workspace may manage their own private reminders, not the inspected person's settings or donor records.

Dates use the app's Eastern reporting calendar, including snooze expiry across DST. SHA-256 revisions cover actionable facts rather than refresh timestamps. A concurrent source change cannot be hidden by an older preference revision.

Additive schema changes:

- Nullable `organization_settings.dashboard_assistant` JSONB with normalized JU defaults.
- `dashboard_priority_preferences`, keyed by viewer, workspace, and item identity, with a source revision, state, optional snooze date, and update timestamp.

The existing advisory-locked organization schema block initializes both safely. No existing donor data is rewritten. Reverting the application leaves these additive structures harmlessly in place.

## Verification and rollout

September 27 verification: 4,614 tests passed; 41 opt-in tests skipped in the default suite. The five new disposable PostgreSQL tests were run separately and passed. Typecheck, production build, release guard, desktop preview, 390px mobile overflow check, and synthetic dismiss/restore/configuration interactions passed. Test databases, servers, and preview tabs were shut down afterward. No Step 2 production writes or deployment were performed.

Unit/API/component coverage includes no initial request, scope isolation, disabled configuration, saved-data boundaries, shared opportunity deduplication, closed states, changed facts, snooze expiry, restore, stale submissions, request bounds, and organization-profile preservation.

Opt-in PostgreSQL coverage runs only against a disposable local Unix socket matching `/tmp/dashboard-priorities-pg.*`, supplied through `PRIORITIES_TEST_PG_SOCKET`. It never reads a production connection string. Run from `apps/web`:

```sh
PRIORITIES_TEST_PG_SOCKET=/tmp/dashboard-priorities-pg.EXAMPLE npm test -- src/app/api/utils/dashboardPriorities.integration.test.js
```

The fixture expects PostgreSQL 18 at the local Homebrew path and socket port 55447. It tests the actual additive DDL and production query functions with synthetic records, including idempotent initialization, viewer/workspace isolation, upsert, restore, snooze expiry, and a newer funded duplicate.

Before deploying, run the full tests, typecheck, build, and release guard. Deploy only to the explicit JU project from a clean tested archive; do not push to a branch that could redeploy other projects. After deployment, verify the live SHA and smoke-test the collapsed helper and saved records in a signed-in personal workspace. Do not change real reminder preferences during a read-only smoke test.

## Next increments

Gift-driven stewardship suggestions need their own verified gift source and stable gift-level deduplication. Missing-solicitation suggestions require completeness checks before claiming documentation is absent. Drafting and custom mascot artwork should follow those safeguards. None of those behaviors is enabled by Step 2.
