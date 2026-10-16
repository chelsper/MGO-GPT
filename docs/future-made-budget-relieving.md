# Future. Made. Budget Relieving

## Scope and calculation

Budget Relieving is an independent classification of gifts already included in
the main campaign query, not an additional source of campaign dollars. The
implementation permits overlap with Comprehensive Investment and Philanthropic
giving. Confirm this interpretation with the report owner before live setup.

- Main campaign query: `27460`.
- Comprehensive Investment query: `31071`.
- Budget Relieving query: `31072`, `FM Campaign Gifts - Budget Relieving - JUMGOGPT`.
- Classify by gift system record ID. Repeated IDs are counted once. Every verified
  fund allocation of a matching gift receives the classification.
- Classification query amounts, dates, balances, and fund descriptions are not
  imported. Use the main campaign's effective amounts, write-offs, pledge
  balances, and campaign-only adjustments.
- Philanthropic remains campaign total minus Comprehensive Investment.
- Budget Relieving plus Other campaign giving equals the campaign total. Do not
  add Budget Relieving to the investment/philanthropic categories.
- Received is paid to date on the classified gifts. Fiscal years follow the
  original gift date, not the date of each pledge payment. Undated gifts retain
  the existing Date needed bucket.

## Dashboard

The overview includes a separate Budget Relieving panel with Committed and
Received controls, a proportional bar, and exact dollar amounts. Missing setup
does not display a misleading zero. Confirmed empty query results display zero.
Missing, negative, or unreconciled category amounts do not draw a misleading
proportional chart; available exact amounts remain visible.

The fiscal-year chart offers Investment/Philanthropic or Budget Relieving/Other
breakdowns. Committed and Received use the same dollar scale. Switching the
breakdown also switches the exact detail table unless the viewer explicitly
selected the amounts/deductions table. The existing five pillars, gift detail
filters, assignments, and campaign-only amount edits are unchanged. Gift detail
filters do not filter the overall/FY totals.

## Setup after deployment

1. Confirm query 31072 is a subset of 27460 and whether overlap is permitted.
2. As Admin or Advancement Services, open Manage dashboard, then Budget Relieving
   setup. The default query ID is 31072.
3. Load classification fields. Review the query name and choose System Record ID.
   This reads query metadata only; it does not execute the query.
4. Confirm the gifts are already included, then save the classification query.
5. Refresh campaign. The main query, financial processing, and each configured
   classification complete before the new snapshot is published atomically.
6. Reconcile both category breakdowns against the same campaign and FY totals.
   Check that fund assignments, write-off source, and overrides remain present.

Viewing the dashboard never starts an NXT query automatically. Existing report
access rules apply; only Admin/Advancement Services may change setup. This
feature does not write gifts, custom fields, funds, or saved-query settings to
NXT. Running a refresh creates read-only query execution jobs.

## Refresh and recovery

All configured classification metadata is checked before the main query starts.
Budget query stages are `budget_starting`, `budget_waiting`, and
`budget_downloading`, with `budgetRelievingJobId` in the saved refresh job.

Membership must use valid system IDs, complete row counts, and gifts present in
the staged main campaign. Unknown IDs, changed metadata, incomplete downloads,
expired leases, and permission failures prevent publication; the last complete
dashboard remains available. Duplicate IDs are deduplicated, not added.

Rate limits pause the relevant checkpoint and respect the existing cooldown.
An uncertain query submission is not blindly repeated. A resumed classification
does not rerun the main query or already completed classifications. A newly
configured query marks the displayed snapshot as out of date until refresh.
Do not remove validation or treat unmatched IDs as new campaign gifts to resolve
a failed refresh.

## Schema and implementation

`campaign_priority_rows.is_budget_relieving` is an additive boolean, initially
false. `campaign_priority_effective` appends this field after `is_investment`.
Existing financial columns and published data remain unchanged. Readiness comes
from the published run configuration, so legacy rows are not presented as a
verified Budget Relieving zero. Existing source identity excludes classification
configuration to retain fund assignments and exceptions. Ordinary same-source
mapping saves preserve both classification settings.

The shared classification registry is `src/utils/campaignInvestment.js`.
Existing investment helper names retain their default behavior; optional `kind`
arguments select the allowlisted Budget Relieving classification. The API
operation is `budgetRelieving`. UI presentation fields are centralized in
`campaignBreakdown.js`.

## Verification on 2026-10-16

- Read-only live metadata verified query 31072 as an executable, unprompted Gift
  query with System Record ID. No gift result download or NXT write was performed.
- Isolated PostgreSQL/PGlite tests cover overlapping/disjoint memberships,
  duplicates, splits, empty results, write-offs, balances, CSV adjustments,
  overrides, permissions, stale versions, lease loss, incomplete results,
  throttling, cancellation, and migrations from the existing investment schema.
- UI tests cover exact totals, unchanged campaign/Philanthropic amounts,
  coordinated fiscal-year views, missing-data safeguards, setup isolation,
  read-only viewer restrictions, and resumable budget stages.
- Actual-source fictional-data browser preview checked at 1280px and 390px.
  No page-level horizontal overflow at 390px; wide tables scroll internally.
- Production build, type checking, and release worktree checks passed.
- Final full-suite run: 6,922 passed and 192 environment-dependent tests skipped.
  All 88 campaign PostgreSQL/PGlite tests ran and passed; no live NXT writes,
  production campaign refresh, or hosted PDF test was used for this change.

## JU deployment on 2026-10-16

Deployed source: `aecc19b8525e5b9751687776a08fdeb098d667e3`.
JU deployment: `dpl_3hSfwAKvpKmERfxZah5EEG8aQJFj`, hosted at
`mgo-hg2yx35e5-chelspers-projects.vercel.app` and promoted to
`https://www.jumgogpt.app` after candidate verification.

Rollback target: `dpl_2QPJ8Jticept8sC8shEhorGreBWU`, source
`b7b8beb9956f4ab219cf168aa9e75e243200cb79`.

Fresh release verification passed: 6,922 tests, including all 88 isolated
campaign PostgreSQL/PGlite checks; 192 existing environment-dependent tests
remained skipped. Typecheck, release guard, scoped whitespace checks, and the
hosted production build passed. The committed archive contained 1,418
hash-verified upload files and excluded unrelated local changes.

Both the protected candidate and live domain passed release identity, campaign
pages/assets, existing dashboard feature markers, Budget Relieving controls,
and unauthenticated GET/POST guards. The standard production verifier confirmed
the exact source SHA and deployment ID. No authenticated refresh or NXT writes
were used. JU project settings and all five cron schedules remained unchanged;
cron hosts followed the promoted release. The sandbox and all other Vercel
projects were unchanged. No Git push was performed.

Live Budget Relieving setup and its first campaign refresh remain outstanding.
Deploying the code does not automatically configure query 31072 or populate
its totals. Existing campaign data, assignments, and financial adjustments were
not changed by the release checks. The overlapping-subset interpretation is
explicit in setup and must be confirmed when configuring the source.

Evidence: `/private/tmp/ju-budget-release-*`,
`/private/tmp/ju-budget-deploy-*`, `/private/tmp/ju-budget-candidate-smoke.log`,
`/private/tmp/ju-budget-live-smoke.log`, and
`/private/tmp/ju-budget-verify-prod.log`. This documentation update is separate
from the deployed application source.
