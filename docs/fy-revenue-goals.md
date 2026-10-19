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
