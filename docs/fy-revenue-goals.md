# FY Revenue Goals

Route: `/reports/dashboards/fy-revenue-goals`. Built-in dashboard, initially restricted to Admins until viewers are selected in Report configurations. Admins and Advancement Services manage the source; authorized viewers receive saved aggregates only.

## First Source

Gift query **31074**, **Gifts Eligible for Gift Tax - JUMGOGPT**. The query defines eligibility and the fiscal period. This first release does not impose an additional fiscal-year filter or infer campaign goals.

1. Open Manage source and Load query fields (metadata only).
2. Verify Gift Information > System Record ID and the whole-gift received amount. Unambiguous names are suggested. Do not use constituent IDs, import IDs, fund split amounts, or pledge balances.
3. Choose the projected re-investment calculation and confirm the query contains received gifts, not unpaid commitments.
4. Save source and refresh totals. Subsequent refreshes use one button and the saved settings.

The requested columns are Total Gifts Received Eligible for Re-Investment and Projected Gift Re-Investment To Date. The user confirmed that projected re-investment means **10% set aside**, which is the default: $1,000,000 received yields $100,000 projected re-investment. The formula is always visible. Ten percent is rounded once on the aggregate in cents. Managers can explicitly switch the display to the 90% remainder in source settings if needed later; this is not the default.

## Safety And Operation

- Opening the dashboard reads the last saved snapshot, never NXT. Only an explicit manager refresh runs the saved query through the shared reporting account. No gifts or other NXT records are updated.
- Duplicate gift system IDs with identical amounts count once. Conflicting values fail without replacing totals. No raw donor rows or gift-ID collection is persisted or returned.
- All rows must validate and match the completed query's row count. Limits: 100,000 raw rows, 25 columns, 25 MiB CSV. No truncation or treating invalid amounts as zero.
- Source settings and totals publish atomically in `report_snapshots_cache` under `report:fy-revenue-goals:v1`; no new database schema. Compare-and-swap prevents an older refresh overwriting a newer one. Failed refreshes retain the previous successful data.
- Query metadata is checked before and after execution. The existing query executor bounds polling; a timeout does not publish partial results. There is no automatic retry loop or scheduled refresh in this release.
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

Implemented locally on October 19, 2026; not yet deployed. The previously deployed cash panel above remains the production version.

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

Implemented locally on October 19, 2026; not yet deployed. Correct standard names are **JU Parents Fund** and **Future. Rising. Scholarship Fund**. Saved source names now control the main breakdown and included-fund group labels instead of hard-coded labels. Existing custom mappings are preserved. An explicit Use corrected standard names button offers replacement of the original defaults only; changes still require confirmation and Save cash source and refresh.

The form now permits name-only edits using existing saved field mappings without reloading metadata. Unsaved changes disable the saved-settings refresh button and explain how to apply edits; hiding the editor does not discard them. Inputs suggest returned fund names and describe exact matches by system ID. Failed refreshes keep previous source/totals together and preserve the draft for retry. Missing-fund messages explain that changing a group name cannot add gifts absent from query results. No new backend operation or NXT write is introduced.

Read-only live inspection on October 19 found both corrected names already saved in source settings, but the deployed table still showed its original labels. The saved 11:01:37 AM cash refresh contained 206 gifts across 14 funds; neither corrected fund appeared in the included-funds table. Therefore the label fix does not by itself produce nonzero amounts: review query 31075's criteria and qualifying gifts, then refresh. No live source settings, query criteria, or totals were changed during inspection.

Validation: 81 focused tests passed, including saved-name persistence/regrouping in isolated PostgreSQL, stale-update protection, no-metadata name edits, failed-refresh draft retention, and absent-fund diagnostics. Final full suite: **7,100 passed / 192 existing environment-dependent skips**. Typecheck, production build, release-worktree check, and diff whitespace check passed. Browser verification used fictional data for the correction/save flow and a 390px layout; production inspection was read-only. Fixed FY27 contribution details remain absent from public client assets.
