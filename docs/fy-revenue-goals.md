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

Added locally after the first-source deployment on October 19, 2026; not included in deployment `dpl_TXKhRKXgYLvyGZ9yeeXqMzquitMS`.

Gift query **31075**, **Budget Relieving Cash - JUMGOGPT**, supplies a separate total and six rows beneath it:

- JU's Greatest Needs
- JU Parent Fund
- JU Scholarship Fund
- Future Rising Scholarship Fund
- Future. Made. Impact Fund
- Other Scholarships (every other fund returned by this query, as requested)

These rows reconcile to the cash total. The cash and eligible re-investment panels can overlap, so they are not added together. Query 31075 defines the fiscal period and which gifts are received cash; the app does not infer those facts from amounts.

### Setup

1. Choose Connect cash query, then Load cash query fields. This only reads metadata.
2. Verify the gift system record ID, fund system record ID (not its lookup code), fund description/name, and amount. Unambiguous mappings are suggested.
3. Use whole-gift amounts only when each gift belongs to one fund. Otherwise choose fund allocations and supply the gift split system record ID and split amount.
4. The five named funds are prefilled. Expand Match the five named funds only if NXT uses different names. Matching ignores case, spacing, periods and curly apostrophes, but does not guess similar names. Included fund details show each returned name and system ID for checking.
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
