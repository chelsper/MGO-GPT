# Dashboard helper: Steps 2 through 4

Implemented September 27, 2026. Steps 2 and 3 are deployed to JU; see `ju-dashboard-helper-release-2026-09-27.md` and `ju-gift-reminders-release-2026-09-27.md`. Step 4 is implemented and verified locally, not yet deployed. These are separate from the deployed Step 1 donor briefings.

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

Typecheck, production build, release guard, desktop preview, 390px mobile overflow check, local filtering, and synthetic dismiss/restore interactions passed. The subsequent JU deployment is recorded in the release note; no production refresh, gift write, or message was performed.

## Step 4: Major-gift documentation review

Gift reminders of **$10,000 or more** offer **Check documentation**. It is deliberately on demand: opening the dashboard, opening Nellie, changing a filter, and reloading reminders do not start NXT scans. Smaller gifts and snoozed/dismissed reminders do not show the check. No model call is used for this factual rule.

The check uses the signed-in viewer's NXT connection, including when an administrator is viewing another workspace. It never borrows the organization background account's permissions. Gifts are revalidated against the current saved source and portfolio before checking; callers cannot supply an arbitrary constituent ID or amount.

The UI only asks whether documentation might be useful after both returned collections pass strict coverage checks. It explicitly allows unsolicited gifts and payments on existing commitments. It does not claim that an opportunity must be created, that a past record relates to this gift, or that a donor was not solicited. It offers the existing opportunity form and completed-solicitation action form, with the donor selected. Existing permissions and explicit submission remain required. Nothing is submitted, drafted by a model, sent, or marked complete automatically.

### Coverage and resource limits

- First checks existing app opportunities, solicitation activity, and unresolved NXT create receipts. Existing context suppresses a gap prompt, even if an NXT list is still catching up. Local checks run again immediately before returning a new or briefly cached review prompt.
- At most three sequential provider GET requests: first verify the gift ID, direct donor ID, amount, type, and date still match the saved revision; then the opportunity list filtered by exact constituent ID with `include_inactive=true`, then that constituent's action list. There are no date, fundraiser, action-completion, or opportunity-status filters. A changed or unavailable gift withholds the gap prompt.
- Each GET has an eight-second transport timeout and zero transport retries. The existing subscription-wide quota gate applies. Token/connection setup has its own existing behavior.
- Each request asks for up to 500 records. Results at that limit are conservatively considered incomplete, even if the total appears to match. No continuation links are followed and no background work is scheduled.
- Requires an explicit nonnegative integer total equal to the returned row count, no next link, unique numeric record IDs, and exact donor identity on every row. Missing, malformed, capped, or conflicting responses are unknown, never evidence of absence.
- Any returned opportunity, including inactive or closed history, suppresses a gap prompt. An action type containing `solicit` does too. A negative result requires every other action type to match one of the app's known interaction types; blank/custom/unrecognized types withhold the prompt.
- The check covers only records visible to the connection for this donor. Spouse/organization relationships and gift-to-opportunity attribution are not inferred. NXT list indexing can lag; the UI shows the check time and asks the user to review recent changes before creating records.

The existing caches cannot establish absence: the opportunity mirror only refreshes known linked IDs, and recent-activity caches retain only the last action. This new check does not mistake either for complete history.

### Persistence and authorization

`POST /api/dashboard-priorities?workspaceId=...` accepts only a current gift key and revision. It shares the route's active-account, authorized-workspace, helper-enabled, no-store, cross-origin, and bounded-body protections. Responses carry viewer/workspace/gift identity, which the UI checks before displaying them. Changing workspace or gift revision unmounts old check results; a failed recheck hides any prior positive review prompt.

Additive `dashboard_documentation_checks` stores at most one compact check per viewer: workspace, connection/configuration scope, gift identity/revision, claim token, retry time, and outcome/time/counts. It stores no action notes or full provider payloads. An atomic UPSERT permits at most one new check per viewer per minute across workspaces; failures honor longer provider cooldowns (up to a day). Token-guarded completion prevents an expired worker from overwriting a newer result. A retry within the cooldown may reuse an outcome only for the exact viewer/workspace/connection/gift revision. Other requests receive a wait message. Reconnection during a check withholds the result.

The table is created inside the existing advisory-locked schema block. No existing donor records or background schedules are migrated. Rollback can leave the additive table in place.

### Step 4 verification

4,725 tests passed with 49 opt-in tests skipped in the default suite. All 13 disposable PostgreSQL tests passed separately. Typecheck, production build, and release guard passed. Synthetic desktop and 390px mobile checks showed no horizontal overflow, no initial requests, no request from filtering, and only one explicit check request. Provider response shapes and failures were simulated; no live donor history check or NXT write was performed for this increment. A small authorized read-only production pilot remains necessary after deployment.

Primary API references: [Blackbaud API list behavior and indexing](https://developer.blackbaud.com/skyapi/docs/in-depth-topics/api-lists), [Blackbaud constituent filtering and linked gifts](https://developer.blackbaud.com/skyapi/support/changelog/renxt/2017), and [Blackbaud action status fields](https://developer.blackbaud.com/skyapi/support/changelog/renxt/2018). Returned coverage is not a guarantee of unrestricted account visibility or instantaneous indexing.

## Next increments

After deploying and piloting Step 4, the next roadmap step is contextual drafting and meeting preparation, followed by a small pilot and refinement. Organization-configurable thresholds, verified custom action-type mappings, additional verified gift types, gift-linked stewardship tasks, and custom mascot artwork can follow. Automated documentation checks should wait for complete saved history sources and measured API capacity. None should automatically send donor communications or change NXT without explicit review.
