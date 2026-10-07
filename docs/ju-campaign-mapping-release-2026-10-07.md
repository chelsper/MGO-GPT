# JU Campaign Mapping Release

Deployed October 7, 2026 to JU only, following the user's explicit Deploy request.
No source settings were saved, campaign query executed, or NXT record changed.

## Included

- Guided source setup with explicit field loading, conservative unique-label
  suggestions, required-field progress, and contextual system-ID instructions.
- Validation for missing, removed, duplicate, lookup/import-code, whole-gift versus
  split-amount, and pledge-balance mappings, including server-side preflight guards.
- Stale field-response protection, renewed confirmation after changes, and working
  close/reopen controls before the first source save.
- Existing single-fund mode verified for JU's stated one-fund-per-gift dataset.
  Unexpected conflicting gift/fund rows stop publication instead of double-counting.
- No schema, dependency, scheduler, gift-total calculation, or NXT write changes.

## Verification

- Full release suite: 452 files and 5,945 tests passed; 14 files and 174 existing
  opt-in tests skipped. All 17 campaign SQL integration tests ran in isolated PGlite.
- Typecheck, production build, release guard, and whitespace checks passed.
- Fictional-data desktop and 390px mobile UI checks passed in the preceding turn.
- Isolated Git archive matched all 1,171 tested web files. Upload inspection found
  no real environment files, dependency directories, or local Git metadata.
- Candidate and live version identity, seven page shells, three JavaScript assets,
  and unauthenticated GET/POST protection passed.
- Signed-in live setup loaded 12 metadata fields from query 27460. Selecting one
  amount/fund per gift, System Record ID, and Gift Amount completed 4/4 required
  mappings; Fund System Record ID and Fund Description were correctly suggested.
  Confirmation remained unchecked and Save was not pressed. This did not execute
  the query or validate live gift totals. The prepared draft was left for review.
- Existing optional canvas and dependency deprecation warnings remain; build passed.

## Release And Recovery

- Application commit: `a90bfb6b0ea058fd18107600d71ad7d0e64ee971`.
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`.
- Deployment: `dpl_7ZCsZkGvUwDExJB3PoJfiwiQDcTc`.
- Candidate: `https://mgo-7mz6rf1wl-chelspers-projects.vercel.app`.
- Live: `https://www.jumgogpt.app`.
- Deployed via isolated archive with `--prod --skip-domain`, then promoted only
  after candidate checks passed. The custom domain retained its previous release
  during candidate verification. No Git push was made.
- JU root/build/install settings, Git linkage, five cron schedules, and PDF
  environment configuration identities stayed unchanged.
- Sandbox remained `dpl_BMnNMuz5weHFR4UvmAM8prqw7S3j`; the other app copy remained
  `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. The PDF project was not changed or deployed.

Rollback target: `dpl_H6DXi1dFP78qhW9R4tT26SEKw7Aw`, application commit
`cde26a279ac104958831d8acdc04c0a66e22fd0a`. No new schema migration needs reversal.
Application rollback does not undo any later staff-authorized configuration changes.

Next: obtain approval to save the prepared mapping, then separately run and reconcile
the first read-only campaign import before trusting totals or assigning funds.
Pledge balance remains in the NXT query for future received-versus-committed work;
the current dashboard does not import it or add it to campaign credit.

Local evidence: `/tmp/ju-campaign-mapping-` followed by `release-tests.log`,
`release-build.log`, `release.json`, `dry.json`, `deploy.log`, `candidate-smoke.log`,
`promote.log`, `live-smoke.log`, `projects-before.json`, and `projects-after.json`.
