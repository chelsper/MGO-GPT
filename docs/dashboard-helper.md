# Dashboard helper: Steps 2 and 3

Implemented September 27, 2026. Step 2 is deployed to JU; see `ju-dashboard-helper-release-2026-09-27.md`. Step 3 is implemented and verified locally, not yet deployed. These are separate from the deployed Step 1 donor briefings.

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

Step 2 pre-release verification: 4,614 tests passed; 41 opt-in tests skipped in the default suite. The five new disposable PostgreSQL tests were run separately and passed. Typecheck, production build, release guard, desktop preview, 390px mobile overflow check, and synthetic dismiss/restore/configuration interactions passed. The subsequent JU deployment and read-only signed-in checks are recorded in the release note.

Unit/API/component coverage includes no initial request, scope isolation, disabled configuration, saved-data boundaries, shared opportunity deduplication, closed states, changed facts, snooze expiry, restore, stale submissions, request bounds, and organization-profile preservation.

Opt-in PostgreSQL coverage runs only against a disposable local Unix socket matching `/tmp/dashboard-priorities-pg.*`, supplied through `PRIORITIES_TEST_PG_SOCKET`. It never reads a production connection string. Run from `apps/web`:

```sh
PRIORITIES_TEST_PG_SOCKET=/tmp/dashboard-priorities-pg.EXAMPLE npm test -- src/app/api/utils/dashboardPriorities.integration.test.js
```

The fixture expects PostgreSQL 18 at the local Homebrew path and socket port 55447. It tests the actual additive DDL and production query functions with synthetic records, including idempotent initialization, viewer/workspace isolation, upsert, restore, snooze expiry, and a newer funded duplicate.

Before deploying, run the full tests, typecheck, build, and release guard. Deploy only to the explicit JU project from a clean tested archive; do not push to a branch that could redeploy other projects. After deployment, verify the live SHA and smoke-test the collapsed helper and saved records in a signed-in personal workspace. Do not change real reminder preferences during a read-only smoke test.

## Step 3: Gift-based stewardship suggestions

Nellie now includes direct monetary gifts **over $1,000**, dated within the past **30 Eastern calendar days**, including today. The new **Show** filter switches between all reminders, follow-ups, opportunities, and recent gifts without another request. Existing due-date reminders come first; gifts are ordered newest first within their group.

Each suggestion names the constituent and shows the gift amount and date. **Log stewardship action** opens the existing action form with the donor selected and interaction type set to Stewardship. **Review donor in NXT** opens their record in a new tab. Merely following either link does not submit an action or send anything. The existing form remains responsible for user review, authorization, fundraiser attribution, and explicit submission. It logs completed actions, not an automatically scheduled thank-you.

The wording intentionally does not claim a donor is unthanked, a solicitation is missing, or a gift has been acknowledged. Dismissal is private and says that nothing was sent or marked thanked. Logging an action does not automatically dismiss the reminder. Gift-linked action completion and stronger cross-user stewardship coordination are future increments; the current deduplication guarantee covers reminders, not manually entered actions.

### Saved source and scope

- Reuses the **published** organization-wide society gift source already maintained by the existing background job. No new refresh schedule, AI request, NXT read, email, appeal write, or database table is added.
- Resolves the same authorized organization refresh account and connection/configuration scope as that job. Reconnection or changed configuration cannot silently reuse an old source.
- A single PostgreSQL statement reads the active generation and its pages together. Pending refresh pages are never mixed into suggestions.
- Joins direct donor IDs against the selected active workspace's saved Lead/Supporting portfolio assignments. Soft credits do not create additional spouse/household reminders. No fundraiser-name matching is used.
- Requires gift-source verification within 36 hours and saved assignment verification within 72 hours. Invalid or future verification times, missing tables, unavailable sources, or read errors withhold gift hints only; ordinary follow-up and opportunity reminders remain usable.
- **About gift suggestions** describes the source window and limits. At a recognition-year boundary, it explicitly reports the available partial window rather than implying that older gifts did not occur. A missing source is not presented as zero gifts.
- Initial supported receipt types are Cash, Donation, PayCash, PledgePayment, PledgePayCash, RecurringGiftPayment, RecurringGiftPayCash, MatchingGiftPayment, and MatchingGiftPayCash. Commitments, non-cash/stock gifts, generic Other, and unknown types are deliberately withheld until their semantics are verified for stewardship.

### Identity and performance

Real numeric NXT gift IDs are required. One gift generates one reminder per workspace/viewer, even if the donor appears in both assignment groups. Different gifts on the same day remain separate. Conflicting copies are withheld, including a conflicting copy outside the selected portfolio.

Private snooze/dismiss preferences use gift ID plus a fingerprint of donor ID, date, amount, and gift type. A new sync timestamp or display-name change does not resurrect a dismissal; changed gift facts do. A preference update revalidates the saved source and current portfolio membership first. Source records are never changed by preference writes.

Only opening/reloading Nellie reads these saved sources. No initial dashboard request or polling was added. SQL selects at most 201 qualifying gift identities to detect truncation, retains at most 200 reminders, and does not let smaller gifts consume that limit. Large workspaces receive an explicit limited-selection note.

### Step 3 verification

4,658 tests passed; 46 opt-in tests skipped in the default suite. All 10 disposable PostgreSQL tests passed separately, including published-generation isolation, portfolio boundaries, soft-credit exclusion, conflicting identities, private dismissal persistence, and a synthetic 90,001-gift source. That synthetic saved-source read took about 218ms locally; it is not a production latency guarantee.

Typecheck, production build, release guard, desktop preview, 390px mobile overflow check, local filtering, and synthetic dismiss/restore interactions passed. No Step 3 production refresh, gift write, message, or deployment was performed.

## Next increments

The next roadmap step is documentation-gap checks, but these must establish complete opportunity/action coverage before claiming a major gift lacks a solicitation. Then add contextual drafting and meeting preparation, followed by a small pilot and refinement. Organization-configurable thresholds, additional verified gift types, gift-linked stewardship tasks, and custom mascot artwork can follow. None should automatically send donor communications or change NXT without explicit review.
