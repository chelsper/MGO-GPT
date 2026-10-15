# Future. Made. Comprehensive Investment

## Accounting Definition

Query 31071 (`Comprehensive Investment - JUMGOGPT`) identifies a subset of the
gifts already in the main campaign query, 27460. The user explicitly confirmed
that these are not additional gifts. Never add the second query's amounts to the
campaign total.

- Match by gift system record ID, not donor, gift lookup ID, or amount.
- Deduplicate repeated classification IDs and classify all verified fund splits
  of a matching gift.
- Main-query amounts, dates, balances, the saved cumulative write-off CSV, and
  valid campaign-only exceptions remain authoritative.
- Comprehensive Investment committed = the sum of matching effective amounts.
- Philanthropic committed = campaign committed minus Comprehensive Investment.
- Apply the same partition to Received. Received continues to mean committed
  less current pledge balance, not a payment-date cash ledger.
- Fiscal years use original gift dates and JU's July-June calendar. Undated gifts
  remain visible rather than being assigned a guessed year.
- Classification is independent of the five campaign pillars. Fund assignments
  and valid gift exceptions are preserved.

## Setup And Refresh

Managers (Admin or Advancement Services) have a **Comprehensive Investment setup**
panel. The query ID defaults to 31071. Load its fields, verify **System Record ID**,
confirm the subset definition, and save. Saving reads query metadata and stores
app-only configuration; it does not execute queries or change NXT records.

The next campaign refresh completes the main query and financial reconciliation,
then runs the classification query through the same shared reporting connection.
The second query has its own resumable job ID and waiting/downloading states.
Throttled reads resume after cooldown without rerunning the main query.

Both results publish through one guarded publication pointer. Invalid IDs,
incomplete downloads, changed metadata, unmatched membership IDs, failed queries,
or lost leases leave the previous complete campaign dataset visible. In
particular, an unmatched ID is a scope discrepancy, not permission to add another
gift or publish a partial category. The error reports a count and sample IDs.

No category totals are shown as verified zero before the first successful
classification refresh. A successfully completed empty classification query can
publish a verified zero. Later successful refreshes replace membership, so gifts
removed from the classification query become philanthropic without changing the
campaign amount.

## Implementation

- `src/utils/campaignInvestment.js`: validated subset settings, ID-field choices,
  configuration identity, resumable stage names.
- `src/app/api/utils/campaignPriorityQuery.js`: bounded streaming classification
  ID download using the existing authenticated query transport.
- `src/app/api/utils/campaignInvestmentQuery.js`: metadata verification, protected
  settings save, and staging-run classification.
- `campaignPriorityRefresh.js`: second-query checkpoints and atomic publication.
- `campaignPrioritiesSchema.js`: additive `is_investment` column and appended view
  column, preserving existing financial columns and overrides.
- `campaignPriorityStore.js` and `campaignPrioritySegments.js`: exact-cent overall
  and fiscal-year partitions from the published snapshot, independent of detail
  filters. Settings changes block stale-snapshot editing until refresh completes.
- `CampaignClassification.jsx` and `CampaignFiscalYears.jsx`: category tables for
  committed and received totals. The prior deductions view remains selectable.

Paths above are relative to `apps/web`. No dependency or environment-variable
changes are needed. The existing idempotent schema initializer handles upgrade.

## Verification And Release Status

Implemented locally on 2026-10-15; not deployed or configured in production by
this change. The only live NXT request was a read-only query metadata check:
query 31071 is an executable Gift query, has no prompted criteria, and returns
`Name`, `Gift Amount`, `Gift Date`, `Gift Type`, `Gift Pledge Balance`, and
`System Record ID`. Its actual membership has not yet been executed/validated
against the refreshed campaign.

Verification passed:

- 290 campaign tests, including 74 isolated PostgreSQL integration tests. Tests
  explicitly forbid live SQL and use a temporary PGlite database.
- Legacy and current financial-view upgrades, twice, preserving assignments,
  exceptions, deductions, and historical totals.
- Duplicate IDs, split allocations, CSV write-offs, local exceptions, zero
  membership, changed membership, undated gifts, and filter independence.
- Permissions, stale versions, cancellation, lease expiry, job identity errors,
  throttling, failed downloads, and preservation of prior published results.
- React setup and financial-table tests; typecheck and production build.
- Local browser verification with fictional data at desktop and mobile widths,
  including setup confirmation and the fiscal-year view toggle. At 390px the
  page has no horizontal overflow; tables scroll inside their containers.

After a separately authorized JU deployment, save query 31071's classification
settings and complete a campaign refresh. Confirm the category sums reconcile
with campaign totals overall and in each fiscal year. Keep the sandbox unchanged.

## Authorized Release Preparation

The user authorized deployment on 2026-10-15. Full release regression: 6,819 tests
passed; 192 existing opt-in/external-service tests skipped. All 74 campaign
PostgreSQL integration checks ran and passed. The release guard and scoped diff
check passed; typecheck and production build passed for this same application
source before packaging.

JU baseline is source `c1f467c2648bf40219e51335c93d125b703bbab7`, deployment
`dpl_D6m8PgsKtXPWBwf59jgQsNhZY6sZ`. Sandbox baseline is
`dpl_GZ5Xb6o8Fo7NkhqkrkRXBFhZNSMW`. Use a committed archive and an explicitly
scoped JU candidate with domain assignment deferred until smoke tests pass.
Preserve existing environment variables, schedules, NXT data and campaign totals.
Do not push Git or deploy the sandbox as part of this release. The schema change
is additive and compatible with the previous application version; rolling back
code does not remove the new column or any later classification configuration.

Deployment evidence will be appended after production verification. Local
release artifacts and safe deployment metadata use
`/private/tmp/ju-investment-deploy-*`.
