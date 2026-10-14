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
