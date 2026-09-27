# Opportunity Pipeline Report

Initial read-only version and subsequent editing, archiving, and CSV export enhancement deployed to JU September 27, 2026. Signed-in read-only release checks passed; live NXT mutation acceptance remains a separate, explicitly authorized check.

## Where To Find It

Reports > Opportunity Pipeline, at `/reports/opportunity-pipeline`.

The report is visible to signed-in users by default, including MGOs. Admins and Advancement Services can adjust the audience in Report Access & Configurations. Granting access exposes the organization-wide report, not just that user's portfolio. Existing explicit audience restrictions are preserved; only the untouched original executive-only seed is migrated. Other reports' access controls are unchanged.

## Scope

This first version reads saved `prospect_opportunities` across all app workspaces, including inactive staff and archived prospects. It does not discover opportunities that exist only in NXT, and it does not pull opportunities from summary-cache prose. The report and its setup description explicitly state this limitation.

The initial source assumption is all opportunities saved in the app. A separate user clarification asks whether the required scope is every opportunity in NXT. If NXT-wide completeness is required, this report is not yet a complete organization-wide NXT inventory; add a validated, resumable source before claiming that coverage.

Opening the report and reloading saved data read the app database only. Changing a fiscal year, search, sort, filter, or exporting uses the loaded results without an NXT request. Explicitly opening an editor reads NXT; saving an edit or confirmed archive can update that opportunity. No gifts, appeals, fundraiser assignments, or local notes are changed.

## Using The Report

- The default view is Active in the current fiscal year, using the organization's existing July 1 through June 30 reporting policy and Eastern current date. For example, FY27 is July 1, 2026 through June 30, 2027.
- Previous/next controls allow any supported fiscal year, including empty future years. The dropdown includes current, adjacent, and represented years, plus All fiscal years.
- Active includes every saved open stage, including custom stages, rather than only solicitation-stage asks.
- Closed & archived separates Funded, Declined, Archived, and Withdrawn records. Inactive opportunities are classified as Archived for this view.
- Needs FY / review keeps undated and identity-conflicted records accessible outside fiscal-year totals.
- Search by constituent name, constituent ID, opportunity title, or fundraiser. Filter by fundraiser, stage, and closed outcome. Sort by expected date, largest ask, or constituent name.
- Summary totals and the stage/outcome breakdown follow the current filters. Rows are paginated in groups of 25. Expand Details for saved timestamps, NXT linkage, close information, and shared-copy counts.
- Export CSV downloads every matching row across all pages, in the selected sort order. It includes both IDs, owners, FY basis, amounts/dates, saved-check timestamps, and pending-sync status. Formula-like donor text is neutralized for spreadsheet imports. It is a saved-data export, not a new NXT query.

## Editing And Archiving

- Admins can edit any verified linked opportunity and explicitly archive it. MGOs see the overall pipeline but may edit only opportunities with an actual saved copy in their own workspace, including joint copies. A user ID merely listed in joint metadata is not edit authority. Executive and Advancement Services roles alone remain read-only.
- Expand Details > Edit opportunity. The editor loads current NXT values and checks both NXT identity and app revisions. The editable fields are title, stage/status, purpose, ask amount/date, expected date, and funded amount/date. Only changed fields are sent. Ask amount is independent of received revenue; funded fields do not create gifts.
- Archive replaces permanent deletion: after confirmation, PATCH `inactive: true` in NXT and save `Archived` on all explicit app copies. History, local notes, gift links, and prospect ranking are retained. Reactivate an archived opportunity in NXT before editing it again here.
- Unlinked or identity-conflicted records are held for linking/review in Top Prospects. This workflow never creates a new NXT opportunity or guesses identity. Existing dates/amounts cannot be cleared through this editor until SKY null-clearing behavior has been validated; clear those fields in NXT and reopen the editor instead.
- `opportunity_change_receipts` records actor, operation, before-values, patch, and copy revisions before a write. `pipeline_change_id` locks each participating copy. Only one unresolved change per NXT opportunity is allowed. A database trigger also blocks older in-flight local editors from overwriting locked records.
- NXT PATCH requests have zero automatic retries. After an uncertain result or delayed NXT read-back, Check sync status reads NXT without repeating the write. Only confirmed values update all linked copies, derived prospect amounts/status, dashboard caches, and summary freshness in one database statement. Saved summary payloads and contact caches are not deleted.
- Revisions, ownership, constituent IDs, and opportunity links are checked again during finalization. If a database failure occurs, every local update rolls back and the receipt remains pending. There is no automatic expiry or blind resend of uncertain writes. A permanent mismatch, deleted record, or changed group requires administrator reconciliation; do not clear receipt locks as a generic retry strategy.
- NXT and the app are not a single transaction. The preflight comparison detects changes since the editor opened, but cannot lock users editing directly in NXT between the preflight and PATCH. Read-back verification detects mismatches; it is not an NXT-wide optimistic-lock guarantee.
- The current browser's cached queries are invalidated without starting new background NXT pulls. Other already-open browser tabs must reload their saved data. This is not live cross-tab push synchronization, and older editing paths have not all been replaced by this new workflow.

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
- `apps/web/src/app/api/utils/reportAccess.js` and `apps/web/src/app/api/reports/configurations/route.js`: configurable report audience, default overall viewing with server-side ownership enforced separately for mutations.
- `apps/web/src/app/api/reports/opportunity-pipeline/[id]/route.js`: GET editor, PATCH save, POST read-only NXT verification; authenticated actor rather than an acting-workspace cookie controls permission.
- `apps/web/src/app/api/utils/pipelineOpportunity{Values,Store,Change}.js`: validation, identity grouping, revision checks, durable intent, bounded provider calls, and atomic local fanout.
- `apps/web/src/app/api/utils/ensureAppSchema.js`: additive receipt table, pending-change marker, identity indexes, pending-write trigger, and untouched-seed audience migration.

The endpoint bounds source reads at 20,001 rows and refuses reports exceeding 20,000 raw workspace copies, rather than returning misleading partial totals. Larger datasets require server-side paging with complete aggregation. The payload omits notes, email, and contact information.

## Verification And Release Checks

Unit/API/UI tests cover July rollover and Eastern midnight, expected/close-date precedence, missing dates, all archive outcomes, custom open stages, shared identity deduplication, conflicting IDs, missing amounts, permissions, sanitized failures, bounded reads, navigation configuration, filters, details, and pagination.

Before release, verify the intended source scope. After deployment, check Admin and MGO overall viewing, owner-only editing, Executive read-only behavior, and explicitly restricted report audiences. Compare a known shared ask across workspaces. Opening, filtering, or exporting must not increment NXT requests. With separate approval for one specific test opportunity, verify an edit, archive, and delayed-confirmation recovery against NXT and both app copies. Do not use real donor mutations merely for smoke testing.

New tests include nonowner/role denial, cross-origin denial, stale NXT revisions, changed-field-only PATCH, non-retrying timeouts, read-only reconciliation, archive history retention, formula-safe full-result export, and editor confirmation. Disposable PostgreSQL tests execute the real claim/finalization SQL, verify all-or-nothing copy updates, block concurrent legacy updates, preserve ranking/notes, and roll back derived-cache failures. Synthetic desktop/mobile browser tests use fake data and stubbed provider responses only.

Local verification on September 27: full regression suite passed, six disposable PostgreSQL transaction tests passed, and typecheck, production build, release guard, and diff checks passed. Desktop/mobile synthetic UI checks covered editing, CSV download, archive confirmation, read-only roles, keyboard dismissal, and narrow-screen containment. No live NXT writes were performed during verification.

Release recovery: the new schema is additive. If rolling back application code, retain the receipt table and pending-write trigger. Resolve any pending changes using the new verifier or a separately reviewed reconciliation; dropping locks or audit rows can permit a duplicate/contradictory write. The old application cannot finish a pending new-style receipt by itself.

## Initial JU Production Release

- Application commit: `18935d2de114e5ca9a1763f18470504a35652fab`.
- Deployment: `dpl_BC2CfZWNjWr8CDjfUYBH3nBgonnr`, READY, production.
- Deployment URL: https://mgo-eiep6on4v-chelspers-projects.vercel.app
- Report URL: https://www.jumgogpt.app/reports/opportunity-pipeline
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`.
- Previous known-good deployment: `dpl_5cZKhpoo7AwTXuB13NMahccnoxZq`, commit `d57199d311963d7cad3dbf66f1e350041449092f`.

The owner requested deployment after the saved-app-only scope was disclosed. No NXT-wide discovery was added. The clean commit archive was deployed explicitly to JU with no Git push. The dry-run manifest contained 1,000 files / 10,940,382 bytes, only `.env.example`, and no private environment files, local credentials, dependencies, or generated build output. Unrelated workspace documentation and other edits were preserved and excluded.

Validation: 4,488 tests passed, 30 opt-in tests skipped; typecheck, production build, release guard, and diff checks passed. Synthetic desktop/mobile browser checks passed. Production `/api/version` returned the expected application commit and deployment ID. Four page URLs and 48 JavaScript/CSS assets returned successful responses. The unauthenticated pipeline API returned 401 with `private, no-store`. Signed-in report data and live totals were not checked; no NXT mutations, refreshes, emails, or letter operations were requested during smoke verification.

Post-release inventory confirmed conference sandbox `dpl_2hwViLvkaPKUC45sS5hwJNgkgXXs` remained unchanged and Git-disconnected; the other linked `mgo-gpt-y1r7` copy remained on `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. All five JU cron paths and schedules were unchanged.

This release adds an idempotent default report-configuration row and no donor-data migration. An application rollback can leave that unused configuration row in place; do not delete report settings, constituent data, or unrelated delivery receipts during recovery.

## Editing And Export JU Release

- Application commit: `d8193e18edbb5bf7773b709206af711e790ef485`.
- Deployment: `dpl_7pBA6GBJK7ZPdcBwiNLcfbfND4PM`, READY, production.
- Deployment URL: https://mgo-mjqwbubtu-chelspers-projects.vercel.app
- Report URL: https://www.jumgogpt.app/reports/opportunity-pipeline
- Previous known-good deployment: `dpl_BC2CfZWNjWr8CDjfUYBH3nBgonnr`.

Deployed an explicit JU-only clean commit archive, without a Git push. The manifest contained 1,011 files / 11,015,493 bytes, only `.env.example`, and no credentials, private environment files, dependencies, or generated builds. Existing unrelated workspace edits were excluded and preserved. Build and runtime deployment variables both identify the exact application commit.

Release rerun: 4,520 tests passed and 36 opt-in tests skipped; typecheck, production build, release guard, and diff checks passed. The separate six disposable PostgreSQL transaction tests had already passed. Public verification confirmed the exact commit/deployment, four page routes, 49 JavaScript/CSS assets, and a private/no-store HTTP 401 from the unauthenticated pipeline API.

A fresh signed-in JU browser tab loaded saved report data and the Export CSV control. Expanding a linked opportunity showed Edit opportunity and Archive opportunity; an unlinked record showed the linking safeguard instead. A pre-release browser tab initially retained older controls, while a fresh tab loaded the new release. No live editor saves, archives, NXT refreshes, email, or letter operations were performed. Live MGO impersonation and NXT mutation/reconciliation checks were not performed; permission and mutation behavior were covered by local tests rather than production writes.

Post-release inventory confirmed all five JU cron paths/schedules unchanged. Conference sandbox remained Git-disconnected on its independently updated pre-release deployment `dpl_5kYq7tMrSKFYhmmb9fxod9AYmebi`; the separate `mgo-gpt-y1r7` copy remained on `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. This release did not deploy either copy.

The additive receipt schema and untouched-seed report audience migration are initialized through the application's existing schema helper. Keep the pending-write trigger and receipts intact on rollback, as described above.
