# Opportunity Pipeline Report

Implemented September 27, 2026. Deployment and signed-in production checks are separate from local verification.

## Where To Find It

Reports > Opportunity Pipeline, at `/reports/opportunity-pipeline`.

Admins and Executives have access by default. Admins and Advancement Services can adjust the audience in Report Access & Configurations. Granting access exposes the organization-wide report, not just that user's portfolio. Existing access controls for other reports are unchanged.

## Scope

This first version reads saved `prospect_opportunities` across all app workspaces, including inactive staff and archived prospects. It does not discover opportunities that exist only in NXT, and it does not pull opportunities from summary-cache prose. The report and its setup description explicitly state this limitation.

The initial source assumption is all opportunities saved in the app. A separate user clarification asks whether the required scope is every opportunity in NXT. If NXT-wide completeness is required, this report is not yet a complete organization-wide NXT inventory; add a validated, resumable source before claiming that coverage.

Opening the report and reloading saved data read the app database only. Changing a fiscal year, search, sort, or filter uses the loaded results without an NXT request. Existing opportunity synchronization continues independently. No opportunity, gift, appeal, or fundraiser assignment is changed by this report.

## Using The Report

- The default view is Active in the current fiscal year, using the organization's existing July 1 through June 30 reporting policy and Eastern current date. For example, FY27 is July 1, 2026 through June 30, 2027.
- Previous/next controls allow any supported fiscal year, including empty future years. The dropdown includes current, adjacent, and represented years, plus All fiscal years.
- Active includes every saved open stage, including custom stages, rather than only solicitation-stage asks.
- Closed & archived separates Funded, Declined, Archived, and Withdrawn records. Inactive opportunities are classified as Archived for this view.
- Needs FY / review keeps undated and identity-conflicted records accessible outside fiscal-year totals.
- Search by constituent name, constituent ID, opportunity title, or fundraiser. Filter by fundraiser, stage, and closed outcome. Sort by expected date, largest ask, or constituent name.
- Summary totals and the stage/outcome breakdown follow the current filters. Rows are paginated in groups of 25. Expand Details for saved timestamps, NXT linkage, close information, and shared-copy counts.

## Calculation Rules

### Fiscal Year And History

Each opportunity's valid `expected_date` determines the fiscal year, independent of the prospect's legacy FY label. A closed record without an expected date may use its `close_date`; that fallback is labeled. An open opportunity never uses a close date or legacy FY as a substitute.

Past-year views show the current saved status and amounts of records assigned to that year. They are not point-in-time historical snapshots. Deleted opportunities cannot be reconstructed by this report. Moving an expected date changes which year contains the opportunity.

### Amounts

Ask totals are unweighted `estimated_amount` values, not gifts received, revenue commitments, or probability-adjusted forecasts. Funded amounts are shown separately from `closed_amount` and are not a gift-ledger reconciliation. Null, malformed, negative, or unsupported amounts are unknown, not zero. Totals explicitly identify incomplete amounts. Amounts are summed in cents, and unsafe totals are not presented as valid numbers.

### Shared Opportunities

Explicit NXT opportunity IDs and shared opportunity keys connect copies of the same opportunity. Transitive links are collapsed, using the most recently edited or NXT-checked saved copy. Names and titles alone never merge records. Distinct opportunities for the same donor remain separate.

Owners across linked copies and saved joint fundraiser IDs remain filterable. Joint asks count once in the overall total; adding independently filtered fundraiser subtotals can double-count those shared asks.

If linked copies disagree on NXT constituent or opportunity identity, the combined record is held outside FY totals rather than assigned guessed amounts or IDs. A parent prospect archived without updating its opportunity rows is treated as archived unless another explicitly linked workspace copy remains active.

## Technical Map

- `apps/web/src/utils/pipelineReport.js`: pure fiscal-year, identity, status, filter, and amount model.
- `apps/web/src/app/api/reports/opportunity-pipeline/route.js`: authenticated, permission-checked saved-data endpoint; private/no-store responses; no NXT provider calls.
- `apps/web/src/app/reports/opportunity-pipeline/page.jsx`: report controls, summaries, row details, and client-side pagination/filtering.
- `apps/web/src/app/reports/opportunity-pipeline/pipeline.module.css`: responsive styling, with horizontal scrolling confined to the table on narrow screens.
- `apps/web/src/app/api/utils/reportRegistry.js`: navigation and configuration metadata.
- `apps/web/src/app/api/utils/reportAccess.js` and `apps/web/src/app/api/reports/configurations/route.js`: executive fallback if this report's settings are missing or invalid, including first title-only saves.
- `apps/web/src/app/api/utils/ensureAppSchema.js`: idempotent default report configuration seed; existing configuration is preserved.

The endpoint bounds source reads at 20,001 rows and refuses reports exceeding 20,000 raw workspace copies, rather than returning misleading partial totals. Larger datasets require server-side paging with complete aggregation. The payload omits notes, email, and contact information.

## Verification And Release Checks

Unit/API/UI tests cover July rollover and Eastern midnight, expected/close-date precedence, missing dates, all archive outcomes, custom open stages, shared identity deduplication, conflicting IDs, missing amounts, permissions, sanitized failures, bounded reads, navigation configuration, filters, details, and pagination.

Before release, verify the intended source scope. After deployment, check the report as Admin/Executive and a denied MGO, compare a known shared ask across workspaces, and verify one active and one closed record against saved opportunity details. Opening or filtering this report should not increment NXT requests. No production write or opportunity synchronization is needed for those checks.
