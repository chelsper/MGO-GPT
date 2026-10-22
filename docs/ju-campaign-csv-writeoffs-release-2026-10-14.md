# JU Campaign CSV Write-Off Import

## Scope

Authorized JU-only deployment, followed by import of the supplied October 14
campaign pledge write-off CSV and refresh of query 27460. No sandbox release,
Git push, persistent environment changes, or constituent/gift writes to NXT.

Managers can save a complete dated write-off baseline, then upload additions or
corrections. Gift system IDs, original amounts and pledge types must match saved
campaign allocations. Each upload replaces cumulative amounts by ID; duplicate
IDs are rejected and unlisted entries persist. Current balances come from the
main campaign query, not the CSV. Immutable run snapshots, local audit history,
source/version guards and atomic publication preserve previous results on failure.

The optional direct-NXT standard-pledge checks remain available but cannot verify
matching-gift pledges. This deployment will use the CSV source instead. All 125
supplied gifts (including 89 matching-gift pledges), pledge types and original
amounts passed a read-only match against the published JU campaign. The file's
cumulative write-offs total $1,000,158.89. No live import occurred during development.

## Verification

- 256 campaign tests passed, including 61 isolated PostgreSQL checks, rerun for release.
- Full suite: 6,785 passed; 192 pre-existing opt-in/external-service tests skipped.
- Typecheck, production build, release guard and diff checks passed.
- Tested duplicate uploads, corrections and zero reversals, matching pledges,
  exact split allocation, stale dates, permission/version guards, atomic publication,
  missing/conflicting balances, fund-assignment retention and query-field guidance.
- The supplied CSV also passed the actual importer parser without modification.

## Release And Recovery

Previous production: source `7926a6718a25b93903af19f48731c28937817afe`, deployment
`dpl_9bwkYjc7CTosVyXCMTFCHyfrb87p`. JU project
`prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`. Sandbox baseline
`dpl_GZ5Xb6o8Fo7NkhqkrkRXBFhZNSMW` must remain unchanged.

Package a clean committed archive; verify the upload contains no local secrets,
build output or unrelated untracked files. Create a production candidate without
domain assignment, smoke-test it, then promote explicitly. Verify the live SHA,
existing-session version routing and signed-in manager UI before importing.

Use the signed-in app's Manage write-offs panel for the import and normal refresh
checkpoint flow. Validate the persisted register, published write-offs, committed
and received reconciliation, all five pillars and fiscal years, and pledge 241662.
Retain the prior run and audit history for recovery. A code rollback does not undo
the register, refresh or additive schema; do not delete campaign history.

Release evidence is written under `/private/tmp/ju-csv-writeoffs-deploy-*`.
Deployment/import completion evidence will be appended after verification.

## Completed Release And Import

- Application source: `c1f467c2648bf40219e51335c93d125b703bbab7`.
- Production deployment: `dpl_D6m8PgsKtXPWBwf59jgQsNhZY6sZ`, promoted explicitly
  after the hosted build and read-only candidate smoke passed.
- Live route/asset checks and unauthenticated API guards passed. Project settings
  and five cron definitions are unchanged. Sandbox remains
  `dpl_GZ5Xb6o8Fo7NkhqkrkRXBFhZNSMW`.
- Synthetic old `__vdpl` cookies still pin the previous release; the existing-session
  check correctly reported that limitation. Explicit `dpl` latest routing passed.
  The signed-in browser loaded the new controls and completed the import on the
  current release. Do not describe the synthetic stale-session check as passed.
- Imported once through the signed-in manager UI: 125 pledges, 89 matching-gift
  pledges, complete baseline through October 14, 2026, $1,000,158.89 write-offs.
  Current balances map to `Gift Pledge Balance` in query 27460. One import audit
  event and one successful refresh event were added; the file was not resubmitted.
- Refresh completed October 14, 2026 at 4:28:33 PM Eastern. Published run
  `db6e3feb-9b4e-4ab0-a9c6-654abafc1a91`, state version 31, 87,902 allocations
  across 87,900 gifts. Previous complete run retained.
- Original gift amount $187,942,667.88; write-offs $1,000,158.89; committed
  $186,942,508.99; outstanding balances $18,625,155.87; received $168,317,353.12.
  The refresh picked up five additional allocations and $140,245.00 of gross
  giving compared with the pre-import snapshot; the change is not a write-off.
- Published totals reconcile exactly in integer cents. No missing financials or
  exceptions needing review. All five pillars plus Unassigned reconcile to the
  campaign totals; the visible fiscal-year table also shows the same totals.
- Pledge 241662: $750,000 original, $450,000 write-off, $0 balance, and $300,000
  committed/received. All 170 fund-assignment rows retain their pre-import
  checksum; no allocation overrides changed.
- Read-only verification evidence: `/private/tmp/ju-csv-writeoffs-db-before.json`
  and `/private/tmp/ju-csv-writeoffs-db-after.json`. Signed-in screenshot:
  `/private/tmp/ju-campaign-writeoffs-refreshed-2026-10-14.png`.

New NXT write-offs require a later CSV upload; normal campaign refreshes reuse the
saved register and update current balances. No live NXT gift, constituent, appeal,
or query-definition writes were performed. No environment secrets were changed.
