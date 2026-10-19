# FY Revenue Goals

Route: `/reports/dashboards/fy-revenue-goals`. Built-in dashboard, initially restricted to Admins until viewers are selected in Report configurations. Admins and Advancement Services manage sources; authorized viewers receive saved totals and the saved installment detail described below.

## First Source

Gift query **31074**, **Gifts Eligible for Gift Tax - JUMGOGPT**. The query defines eligibility and the fiscal period. This first release does not impose an additional fiscal-year filter or infer campaign goals.

1. Open Manage source and Load query fields (metadata only).
2. Verify Gift Information > System Record ID and the whole-gift received amount. Unambiguous names are suggested. Do not use constituent IDs, import IDs, fund split amounts, or pledge balances.
3. Choose the projected re-investment calculation and confirm the query contains received gifts, not unpaid commitments.
4. Save source and refresh totals. Subsequent refreshes use one button and the saved settings.

The requested columns are Total Gifts Received Eligible for Re-Investment and Projected Gift Re-Investment To Date. The user confirmed that projected re-investment means **10% set aside**, which is the default: $1,000,000 received yields $100,000 projected re-investment. The formula is always visible. Ten percent is rounded once on the aggregate in cents. Managers can explicitly switch the display to the 90% remainder in source settings if needed later; this is not the default.

## Safety And Operation

- Opening the dashboard reads the last saved snapshot, never NXT. Only an explicit manager refresh runs the saved query through the shared reporting account. No gifts or other NXT records are updated.
- For query 31074, duplicate gift system IDs with identical amounts count once. Conflicting values fail without replacing totals. This source does not persist or return donor rows or gift-ID collections.
- All rows must validate and match the completed query's row count. Limits: 100,000 raw rows, 25 columns, 25 MiB CSV. No truncation or treating invalid amounts as zero.
- Source settings and totals publish atomically in `report_snapshots_cache` under `report:fy-revenue-goals:v1`; no new database schema. Compare-and-swap prevents an older refresh overwriting a newer one. Failed refreshes retain the previous successful data.
- Query metadata is checked before and after execution. The existing query executor bounds polling; a timeout does not publish partial results. Neither cash source automatically retries or refreshes on a schedule. The installment source's explicit refresh continues in small batches as described below.
- Future additions can include other revenue sources, explicit fiscal-year comparisons, and targets. Keep them separate from this query's received total unless their overlap is defined.

Tests cover arithmetic/rounding, duplicate and malformed rows, 1,473-row results, roles, metadata-only reads, stale revisions, SQL publication races, and the setup/refresh UI. Live query outputs and totals must still be verified after deployment; local tests use fictional data.

## Budget-Relieving Cash

Deployed to JU on October 19, 2026 in `dpl_4yNAW8TKakARvMDr8FgNLFFFTmvT`, source `a97e7a75a604a36f5f980eca553a97a6180cb0f2`. See `ju-fy-budget-cash-release-2026-10-19.md` for release verification. Live source confirmation and the first cash refresh are still required.

Gift query **31075**, **Budget Relieving Cash - JUMGOGPT**, supplies a separate total and six rows beneath it:

- JU's Greatest Needs
- JU Parents Fund
- JU Scholarship Fund
- Future. Rising. Scholarship Fund
- Future. Made. Impact Fund
- Other Scholarships (every other fund returned by this query, as requested)

These rows reconcile to the cash total. The cash and full eligible re-investment totals can overlap, so the full totals are not added together. The unrestricted goal below uses only the 10% re-investment amount alongside budget-relieving cash, as requested. Query 31075 defines the fiscal period and which gifts are received cash; the app does not infer those facts from amounts.

### Setup

1. Choose Connect cash query, then Load cash query fields. This only reads metadata.
2. Verify the gift system record ID, fund system record ID (not its lookup code), fund description/name, and amount. Unambiguous mappings are suggested.
3. Use whole-gift amounts only when each gift belongs to one fund. Otherwise choose fund allocations and supply the gift split system record ID and split amount.
4. The five named funds are prefilled. Match the five named funds offers names from the saved query results and shows which saved fund IDs match. Matching ignores case, spacing, periods and curly apostrophes, but does not guess similar names. Included fund details show each returned name and system ID for checking. Already-configured sources do not need to reload fields just to edit names.
5. Confirm eligibility and amount basis once, then Save cash source and refresh. Later use Refresh cash totals; only this panel refreshes.

### Implementation And Checks

- `src/utils/fyBudgetCash.js`: fixed source, mapping validation and fund grouping.
- `src/app/api/utils/fyBudgetCash.js`: aggregation and atomic publication under independent cache key `report:fy-revenue-goals:budget-cash:v1`.
- `GET/POST /api/reports/fy-revenue-goals/budget-cash`: same dashboard permissions, manager-only metadata/refresh, fixed shared-account query. GET has no NXT calls.
- `BudgetCashPanel.jsx`: independent loading, errors, setup and saved totals. No NXT writes or donor identities returned. Existing re-investment behavior stays intact.
- Whole gifts deduplicate by gift system ID; conflicting funds/amounts stop the refresh. Split mode deduplicates by gift and split IDs and rejects a split associated with different gifts. Identical repeated rows count once. Overall gift count remains distinct across funds.
- All six groups appear even when empty. Before the first successful refresh, amounts are unknown, not zero. In a completed result, an absent named fund displays zero with a no-match note; verify its NXT name if unexpected.
- Uses the existing 100,000-row, 25-column and 25 MiB bounds; at most 2,000 funds. Integer-cent calculations and complete result-count verification prevent partial or inaccurate publication. Invalid amounts are never silently zeroed.
- Database compare-and-swap tests confirm that cash refreshes cannot replace re-investment snapshots and stale refreshes cannot overwrite newer cash results. No migration is required.

Validation on October 19: 100 focused tests passed (including isolated PostgreSQL), full suite 7,069 passed / 192 existing environment-dependent skips; typecheck and production build passed. Desktop and 390px mobile fictional previews checked, including setup and confirmation. Live query 31075 metadata, mappings, received-only scope and reconciliation to NXT remain to be verified after deployment.

## FY27 Unrestricted Goal

Deployed to JU on October 19, 2026 in `dpl_B7KZzcpv9tSc2FrxePFirUPaEosh`, source `2bcf21b5567f9c7a56df80ee2563dea081ab50a4`. See `ju-fy-unrestricted-goal-release-2026-10-19.md` for verification and recovery details.

The top summary tracks a **$6,500,000** unrestricted cash goal for **July 1, 2026 through June 30, 2027**. It displays cash received to date, the annual goal, remaining amount, percentage progress, and each component:

- Saved budget-relieving cash from query **31075**.
- **10%** of saved eligible gifts received from query **31074**, rounded once in cents. The goal always uses the 10% set-aside even if a manager switches the detail panel to its optional 90% remainder display.
- **Parmelee Estate: $2,300,000** fixed cash received.
- **Lovett Trust: $230,000** fixed cash received.
- **LINE Funding: $500,000** fixed cash received.

The user confirmed all three fixed contributions are separate from query 31075. Their subtotal is **$3,030,000**. Combined received cash equals budget-relieving cash + 10% re-investment + $3,030,000. Remaining equals the greater of zero or $6,500,000 minus combined received cash. Above-goal amounts appear separately; the progress bar caps at 100% while the displayed percentage remains actual.

### Implementation And Safeguards

- Fixed configuration is in server-only `src/app/api/utils/fyUnrestrictedGoal.js`. It is returned only by the existing authorized, no-store revenue endpoint, not embedded in public client JavaScript. Clients cannot override the hard-coded configuration through API requests.
- `src/utils/unrestrictedRevenueGoal.js` performs pure integer-cent arithmetic with overflow checks. `UnrestrictedGoalSummary.jsx` displays the authenticated configuration and existing snapshots. `BudgetCashPanel.jsx` reports saved data to the parent; no additional requests or NXT calls are introduced.
- If either source has no valid saved total, the combined total and remaining amount show **Awaiting source totals**, not zero or a partial total. A completed empty source is valid zero. Failed refreshes retain the last successful data; source timestamps remain visible. Loss of dashboard access clears the totals.
- The fixed entries and goal are bound to FY27. Outside that fiscal year, the roll-up requests a configuration update rather than combining FY27 fixed values with another year's sources. Managers must still ensure both saved queries cover the intended fiscal year; query scope remains defined in NXT.
- This is reporting only. No NXT writes, new database schema, source-cache changes, or scheduled jobs are introduced.

Validation: 117 focused tests passed, including actual page/panel refresh integration and isolated PostgreSQL source checks. Full suite: **7,093 passed / 192 existing environment-dependent skips**. Typecheck and production build passed. Fictional browser previews checked at desktop, 390px, and 320px widths; live cash totals were not fetched or changed.

## Fund-Name Editing Correction

Deployed with the FY27 goal summary on October 19, 2026. Correct standard names are **JU Parents Fund** and **Future. Rising. Scholarship Fund**. Saved source names now control the main breakdown and included-fund group labels instead of hard-coded labels. Existing custom mappings are preserved. An explicit Use corrected standard names button offers replacement of the original defaults only; changes still require confirmation and Save cash source and refresh.

The form now permits name-only edits using existing saved field mappings without reloading metadata. Unsaved changes disable the saved-settings refresh button and explain how to apply edits; hiding the editor does not discard them. Inputs suggest returned fund names and describe exact matches by system ID. Failed refreshes keep previous source/totals together and preserve the draft for retry. Missing-fund messages explain that changing a group name cannot add gifts absent from query results. No new backend operation or NXT write is introduced.

Read-only live inspection on October 19 found both corrected names already saved in source settings, but the deployed table still showed its original labels. The saved 11:01:37 AM cash refresh contained 206 gifts across 14 funds; neither corrected fund appeared in the included-funds table. Therefore the label fix does not by itself produce nonzero amounts: review query 31075's criteria and qualifying gifts, then refresh. No live source settings, query criteria, or totals were changed during inspection.

Validation: 81 focused tests passed, including saved-name persistence/regrouping in isolated PostgreSQL, stale-update protection, no-metadata name edits, failed-refresh draft retention, and absent-fund diagnostics. Final full suite: **7,100 passed / 192 existing environment-dependent skips**. Typecheck, production build, release-worktree check, and diff whitespace check passed. Browser verification used fictional data for the correction/save flow and a 390px layout; production inspection was read-only. Fixed FY27 contribution details remain absent from public client assets.

## Budget-Relieving Pledge Installments

Deployed to JU on October 19, 2026: `dpl_3Aqs7kqYdN6S29J1G7HJsHUGvRxJ`, source `5ae5ab99256d03840ffe4ca6aa53befc5739f205`. Query **31076**, **FY27 Budget Relieving Payments Due - JUMGOGPT**. Its available outputs are **System Record ID**, **Installment Amount Due**, **Installment Date Due**, **Fund Description**, and **Name**. The first live refresh finished at 12:38:28 PM Eastern: 14 unpaid installments across 14 pledges, totaling **$2,092,000**. No NXT records were changed.

The user confirmed that installments belong in a separate **Received + expected this FY** projection. Cash received and its progress bar stay unchanged. Projected total = cash received roll-up + verified unpaid installment balances due within the goal's fiscal year. Projected remaining is clamped at zero; projected surplus is shown separately. Unknown, invalid, or wrong-year installment totals never become zero or enter the projection.

### Use

1. Choose **Connect pledge query**. This loads the output labels and suggests the five mappings without running the query.
2. Confirm the source is budget-relieving installments, with the pledge gift system ID, primary donor name, and one fund per pledge; save and refresh.
3. The query identifies candidate installments. The app checks each pledge and installment schedule in NXT, at most three pledges per continuation request. Progress continues automatically while the page is open after an explicit refresh. Pause or leave and resume later; simply opening the dashboard does not run NXT checks.
4. The panel total appears in the projection once all checks finish. Expand **View names, amounts, funds, and due dates** for the list. Search and pagination read only saved results and do not change totals.

### Financial And Data Safeguards

- The query's scheduled installment amount is **not** assumed to be unpaid. The existing gift and installment readers verify gift type, installment IDs, due dates, scheduled amounts, and remaining balances. Balances must reconcile to the pledge; scheduled amounts must reconcile to its full amount.
- Only matching returned installments due within the organization fiscal year are included. Date filtering is performed again server-side, even if the query returns other dates. Already-settled installments are excluded; partial payments reduce the amount shown. The UI distinguishes scheduled amount from amount still due.
- Duplicate query rows are collapsed for discovery only. Actual schedule IDs identify final installments, so equal-date/equal-amount installments remain distinct. Missing IDs, malformed dates, conflicting donors/funds, or changed schedules prevent publication rather than guessing.
- Multi-fund pledges require a verified installment allocation source and are not divided automatically. Matching-gift pledges are also held for a supported balance source. An unsupported pledge does not publish a partial total as if complete.
- Query results are bounded by 100,000 raw rows, 25 columns, 25 MiB CSV; this source additionally supports up to 2,000 pledges and 10,000 verified installments per refresh. Results are not truncated.
- The private cache key is `report:fy-revenue-goals:budget-pledges:v1`. It stores the previous complete source, snapshot and donor rows plus an optional in-progress job. Compare-and-swap protects every checkpoint and final publication. No migration is needed. Old cash, re-investment, and campaign data are never overwritten.
- `GET/POST /api/reports/fy-revenue-goals/budget-pledges` uses existing report access, manager checks, same-origin commands and `private, no-store`. GET returns only 50 saved rows at a time, with bounded search; provisional donor data and audit IDs are not returned. Managers alone can load fields, refresh, or continue.
- NXT requests are read-only, using the connected shared reporting account and no inline retries. Throttling preserves a checkpoint and observes the provider wait before continuing. Connection failures require explicit resume; financial conflicts require correction and a new query refresh. Checks expire after one hour or fiscal-year rollover to avoid resuming very old balances.
- Cash and pledge snapshots are separate point-in-time sources. Refresh both after payments to align received and expected totals; this is a projection, not a guarantee of collection or real-time accounting reconciliation. No donor messages, appeal updates, or gifts are created.

Implementation: `fyBudgetPledges.js` in shared and API utilities, `BudgetPledgePanel.jsx`, the new API route, and the expected-receipts section in `UnrestrictedGoalSummary.jsx`. The first live refresh verified the five mappings and reconciled the returned installment schedules and balances. Cash received stayed **$3,452,296.51**; received plus expected became **$5,544,296.51**, with **$955,703.49** remaining against the goal after expected receipts. These are point-in-time amounts, not permanent configuration.

Validation before deployment: **7,147 tests passed / 192 existing environment-dependent skips**. This includes isolated PostgreSQL checkpoint/publication tests and page integration confirming that refreshing installments changes only the projection, not received cash. Typecheck, production build, release-worktree check and diff whitespace check passed. Candidate and live release/asset/auth checks passed. JU settings and all five schedules were preserved; sandbox and all other deployments were unchanged. See `ju-fy-budget-pledges-release-2026-10-19.md`.

## Local Goal Adjustments And Manual Cash

Implemented and tested after the installment deployment; **not deployed yet**.

- The installment table adds **Count toward goal** directly after **Amount still due**. Admins and Advancement Services can enter a lower amount (including zero), provide a reason, or reset to the full unpaid balance. Viewers can see the amounts and latest adjustment but cannot edit.
- Adjustments never change the saved NXT balance, cash total, gift, or installment. They are keyed by fiscal-year start plus verified gift/installment IDs in the existing pledge cache, with an append-only before/after/actor/time/reason history. Source refreshes retain them and use the same revision CAS, preventing refreshes or edits from overwriting each other. Finish an in-progress balance job before editing.
- The saved excluded-dollar amount remains excluded after payments. Effective counted amount is `min(approved counted amount, max(0, current unpaid balance - saved exclusion))`. It never grows above the approved cap. Changes to fund description, due date, or scheduled amount set that adjusted row to zero with an explicit review notice. Managers can reapprove or reset it. FY changes do not carry old adjustments into another year.
- All rows, not just searched/paginated rows, contribute to the adjusted projection. The original unpaid total remains visible. An adjustment affects **Received + expected** only; cash received is unchanged. Refresh cash and pledge sources after payments because snapshots are still independent.
- **Manual cash contributions** displays the three original entries without adding them twice. Managers can add, edit, archive, and restore cash receipts. Each change requires a reason; saving/restoring also requires confirmation that the receipt is not counted in budget cash, the re-investment set-aside, or another entry. Duplicate active descriptions are rejected, but financial overlap cannot be automatically inferred from a label: staff must reconcile the source receipt.
- New entries require an actual receipt date in the configured/current FY, not later than today. The original entries retain their previously confirmed FY-only date until an actual date is supplied. Amounts are positive exact cents. The annual goal itself remains server-managed, not editable through this endpoint.
- Manual cash is stored under `report:fy-revenue-goals:manual-cash:v1`, independently of query snapshots. The server-only original configuration seeds the ledger on the first explicit edit, never on GET. Active entries replace the original contribution list in the authorized goal response. Archive keeps the entry and history; it does not delete anything. Recent 25 changes are shown, full history retained. Limits: 1,000 manual entries and 10,000 audit events per ledger; reaching the history limit refuses writes rather than discarding history.
- `GET/POST /api/reports/fy-revenue-goals/manual-cash` and pledge `adjust`/`reset-adjustment` operations use the existing dashboard authorization, manager roles, private no-store responses, origin checking, bounded commands, and revision checks. Neither constructs an NXT transport. No migrations, new dependencies, query criteria changes, schedules or donor messages are needed.

Validation: **7,190 tests passed / 192 pre-existing environment-dependent skips**; build, typecheck, release-worktree and whitespace checks passed. Tests include original-entry seeding, new receipts, edits/archive/restore, concurrent revisions in isolated PostgreSQL, invalid/future/wrong-year amounts and dates, exact cents, audit retention, source-refresh survival, payment reductions, cash/projection separation, search-invariant totals, and role checks. Local fictional-data browser checks covered adjustment/save, manual addition, immediate roll-ups and 390px mobile layout. No live adjustment or manual receipt was entered.
