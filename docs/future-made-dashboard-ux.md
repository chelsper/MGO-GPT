# Future. Made. Dashboard UX

## Scope

Implemented and deployed to JU on 2026-10-15. This is the first visual simplification
pass (recommendations 1 and 3), not a change to campaign accounting or refresh
behavior.

- Committed, Received to date, and Outstanding pledges lead the saved report.
  Outstanding pledges uses the existing verified balance value, never a new
  calculation or a guessed zero.
- The compact report header retains authorized report navigation and the
  dashboard switcher under Reports & dashboards. Other reports retain their
  existing header by default.
- Manage dashboard groups fund assignments, source settings, write-offs,
  classification settings, refresh controls, and viewer management. It is only
  available to existing campaign managers. First-time source setup opens it;
  configured dashboards start with it collapsed.
- Closing management hides rather than unmounts its editors, preserving drafts
  and fund selections. The close control returns keyboard focus to the toggle.
  User-started refresh continuation stays at page level and is not paused or
  restarted by opening or closing the panel.
- Source-change warnings, changed exceptions, active refresh notices, and
  refresh errors remain visible outside the collapsed controls.
- How these totals are calculated retains reconciliation, CSV source dates,
  classification methodology, and orphaned-exception explanations. The repeated
  recognition hero and category-total footer are removed. Legacy snapshots
  without configured revenue metrics still show their saved recognition total.

No API, schema, query, permissions, calculation, assignment, financial import,
or NXT behavior changes. Gift-detail filters remain scoped to gift detail;
overall, fiscal-year, and pillar totals remain independent. Charts, new global
filters, abbreviated currency, and presentation/print mode are deferred.

## Verification

- UI tests cover management visibility and draft preservation, first-time
  setup, read-only access, keyboard focus return, visible refresh failures,
  optional compact report navigation, category reconciliation, and missing
  versus verified zero balance data.
- Full regression: 6,825 passed, 192 existing opt-in/external-service tests
  skipped. All 74 campaign PostgreSQL integration tests ran using PGlite.
- Typecheck and production build passed.
- Actual React source was inspected in a loopback-only fictional-data preview,
  including desktop and 390px mobile. No horizontal page overflow at 390px;
  management controls remain usable and read-only viewers cannot access them.
- Preview data cannot submit changes or call live services. No live campaign
  settings or records were changed during verification.

Local verification artifacts use `/private/tmp/ju-campaign-ux-*`.

## Authorized Release

The user authorized deployment on 2026-10-15. Release source is
`dcac22672aab3de0532b7b3060123d01079214cd`. A fresh full regression run passed
6,825 tests with 192 existing opt-in/external-service skips; all 74 campaign
PostgreSQL tests ran. Release guard and scoped diff checks passed. A committed
archive upload was verified (1,412 files, with no secrets, local builds, or
unrelated service files).

The prior JU release, also the rollback target, is
`dpl_CBbdokcKc5L9XV6ccRNsCoPnCNEb`, source
`302bb3bcf9fc501c84b8de1a15e2d62285392b11`. The sandbox baseline is
`dpl_GZ5Xb6o8Fo7NkhqkrkRXBFhZNSMW`; its Git link remains disconnected.

The read-only campaign baseline now includes the user's completed classification
refresh (query 31071). It contains 87,913 allocations, 170 fund assignments, and
no gift exceptions. Committed is $187,017,748.74, Received $168,342,592.87,
Outstanding pledges $18,675,155.87, and Comprehensive Investment $61,507,291.00
for both Committed and Received. The saved write-off register is unchanged.

## Live Verification

JU deployment `dpl_HGsXBUkhajgSJYsMFiuVATapGshY` was built from the committed
archive with domain assignment deferred. Hosted build and candidate smoke
checks passed before promotion. The same checks passed on the live domain,
including exact source/deployment identity, public pages, new and existing
campaign assets, and unauthenticated API guards. The standard production
verifier passed.

The signed-in browser loaded the normal JU campaign URL and showed the new
summary, Outstanding pledges, collapsed management and calculation controls,
and the existing overall/fiscal-year classification data. No browser version
pin, authentication cookie, campaign setting, or refresh was changed.

Read-only database comparison verified the same published run, campaign state,
totals, classification, CSV revision, 170 fund assignments, and exceptions as
the baseline. JU project settings and all five cron schedules are unchanged;
cron hosts track the new deployment. The sandbox and all other projects remain
unchanged. No Git push, NXT write, letter operation, or live refresh was performed.

Release evidence uses `/private/tmp/ju-campaign-ux-deploy-*` and read-only
database evidence uses `/private/tmp/ju-campaign-ux-db-*`. This documentation
update is separate from the deployed application source.

## Campaign Composition

Implemented and deployed to JU on 2026-10-15. Recommendation 2 adds a
proportional bar for Philanthropic and Comprehensive Investment. The local
Committed / Received to date toggle changes only this chart, never the saved
data, fiscal-year breakdown, pillars, or gift-detail filters. Both exact amount
columns remain visible below it. Comprehensive Investment remains a subset of
the campaign, not an additional amount.

- Uses existing saved integer-cent amounts. The chart requires a published
  snapshot, configured classification, and nonnegative categories that exactly
  reconcile to the chosen saved total. Missing, invalid, negative, unreconciled,
  and all-zero values show explanations and available exact amounts, not a
  misleading bar. Verified zero categories within a positive total remain zero.
- Legacy snapshots retain the Campaign recognition label. Received is disabled
  without saved balance data; losing that data safely falls back to the primary
  view. Small positive shares are not mislabeled as zero.
- Labels, exact accessible descriptions, and a patterned segment supplement
  color. Native view buttons and the horizontally scrollable exact-amount table
  work with the keyboard. Mobile controls remain at least 44px high.
- No new dependency, API, database, permissions, calculation, or NXT changes.

Verification: 25 new component tests; 84 focused dashboard/header tests;
full regression 6,850 passed with 192 existing opt-in/external-service skips,
including all 74 campaign PostgreSQL tests. Typecheck, production build, and
release guard passed. Desktop and 390px fictional-data browser checks verified
both views, keyboard activation, keyboard table scrolling, and no horizontal
page overflow or browser errors. The local fixture cannot contact live services.

Evidence: `/private/tmp/ju-campaign-composition-*`.

### Composition Release Verification

The user authorized deployment on 2026-10-15. Application source is
`2f3151bc288907f4a2946ce64117d717e1b6c177`, JU deployment
`dpl_7pwLCBY4GWWdUiS1Pb4xseni9td4`, hosted at
`mgo-fj1c1g352-chelspers-projects.vercel.app`. The rollback target is
`dpl_HGsXBUkhajgSJYsMFiuVATapGshY`, source
`dcac22672aab3de0532b7b3060123d01079214cd`.

A fresh full regression run passed 6,850 tests with 192 existing opt-in skips,
including all 74 campaign PostgreSQL tests. Typecheck, local production build,
release guard, and hosted build passed. The committed archive upload contained
1,413 verified files; unrelated worktree changes were excluded. Candidate
checks passed before domain promotion, then passed again on the live domain:
exact source/deployment identity, chart and existing campaign controls/assets,
report pages, and unauthenticated API guards. The standard production verifier
also passed.

Signed-in browser checks verified both chart views with saved campaign totals.
Committed composition is 67.1% Philanthropic and 32.9% Comprehensive Investment;
Received composition is 63.5% and 36.5%, respectively. The saved totals remain
$187,017,748.74 Committed and $168,342,592.87 Received. A read-only database
comparison confirmed unchanged published run, configuration, financial totals,
write-off revision, 170 fund assignments, and zero local exceptions. JU settings
and all five cron schedules are unchanged; cron hosts follow the new deployment.
The sandbox and other projects are unchanged. No Git push, live refresh, NXT
write, letter operation, cookie edit, or authentication change was performed.

Known pre-existing issue: browser startup emits React hydration errors 418/423.
The same errors were reproduced on the previous immutable deployment without
signing into it; similar warnings were already recorded in the 2026-10-14
write-off release notes. This release does not fix their root cause. The live
dashboard recovered and both chart views worked; no additional interaction
errors appeared. Console evidence is saved in the composition artifacts.

This release-verification documentation update is separate from the deployed
application source.

## Fiscal-Year Comparison

Implemented locally on 2026-10-15; not yet deployed. Recommendation 4 puts a
fiscal-year bar chart before the existing detailed tables. Committed and
Received to date use a shared dollar scale, with newest years first. When
classification reconciles, each bar shows Philanthropic and Comprehensive
Investment as parts of the same total, never additional gifts.

- The chart uses saved integer-cent amounts without changing calculations,
  API responses, permissions, database records, or NXT. Its view toggle is
  independent of the overview composition toggle and table selection.
- Received remains paid to date on gifts grouped by their original gift year,
  not cash received during that fiscal year. Partial-year activity is labeled.
  Undated gifts appear separately as Date needed and remain in the total.
- Incomplete, invalid, unreconciled, or negative fiscal-year totals retain
  exact available amounts with an explanation instead of misleading bars.
  Unavailable classification uses total-only bars, not an assumed zero split.
  Category splits must reconcile both per year and to the campaign categories.
- View fiscal-year details opens the unchanged category and amount/deduction
  tables. Native buttons, a keyboard-operated disclosure, focusable scrolling
  table regions, exact accessible chart descriptions, and patterned investment
  segments provide alternatives to color and pointer interaction.

Verification: 26 new tests and 110 focused dashboard/header tests passed.
Full regression passed 6,876 tests with 192 existing opt-in/external-service
skips, including all 74 campaign PostgreSQL tests. Typecheck, production build,
release worktree guard, and scoped diff checks passed. Desktop and 390px
browser checks used a nine-year fictional fixture with no live connection:
both views, stable scale, exact tables, keyboard activation and horizontal
table scrolling, 44px view buttons, no page overflow, and no console errors.

Evidence: `/private/tmp/ju-fiscal-chart-*`; the preview harness is in
`/private/tmp/ju-campaign-ux-preview/`. Live dashboard data and the deployed
application are unchanged. The pre-existing production hydration warning
documented above is not addressed by this local presentation change.
