# JU Automatic Appeal Verification Release

Deployed October 8, 2026, with explicit authorization. JU only; no Git push,
sandbox deployment, live letter approval, query refresh, email, or NXT write.

## Included

- Uncertain saved postal and exclusion appeal submissions are checked
  automatically while Society Letters is open and visible, between editing
  and other operations. Completed receipts and unsubmitted appeals do not
  become background work.
- Verification reads NXT and saves the confirmation in the app. Actual appeal
  creation remains part of explicitly approved letter creation or exclusion.
  Verification does not resubmit, delete, or change NXT appeals.
- Three persisted read-check attempts, cooldowns, workspace leases, and
  revision checks bound recovery across reloads and tabs. Permission failures
  stop automatic checks. Missing or conflicting assignments remain unresolved.
- Automatic results preserve recipient selections and saved approvals.
  Successful reconciliation can unlock Continue but never starts new writes.
  Manual verification remains a recovery option, not the routine next step.

No dependency, schema, environment, schedule, or PDF service changes. This is
page-driven verification, not an unattended background worker.

## Verification

- 461 test files and 6,081 tests passed; 14 files and 174 opt-in tests skipped.
  Campaign SQL tests used isolated PGlite, not the production database.
- Typecheck, production build, release-worktree guard, and diff checks passed.
- The isolated archive matched all 1,191 tested web files. All 18 changed files
  were in the inspected upload; no real environment files were included.
- Candidate and live smoke checks verified the exact SHA, eight page shells,
  three JavaScript assets, and unauthenticated GET/POST protection for the
  campaign and Society Letters endpoints.
- The sandbox and every other project retained their deployment identities.
  JU project settings, cron definitions, and PDF settings were unchanged.
- Live smoke checks were unauthenticated. No live letter or appeal was created;
  write behavior, retained approvals, cooldowns, and duplicate prevention were
  exercised using test fixtures rather than donor records.
- Existing dependency and optional install-script warnings remain; the hosting
  build completed successfully.

## Release And Recovery

- Application SHA: `e9d58e441c5f0b4675314cc59139575d02fe3b33`.
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` (`mgo-gpt`).
- Deployment: `dpl_5y5g6xGTASHCBoapq3Z5kwASynSV`.
- Candidate: `https://mgo-klydgy5r4-chelspers-projects.vercel.app`.
- Live: `https://www.jumgogpt.app`.
- Sandbox unchanged: `dpl_H5mHhcYkDbkCZvteAeSSoqkaT2fs`.
- Previous JU / rollback target: `dpl_TEhBXcHRCLE6xVNj9XktfLRjoDtB`,
  SHA `7270fb6db370b6745ee1ef4ff16f8a1fe54bc565`.

Pause active processing before rollback. Retain saved documents, approvals,
reservations, and per-member receipts. A code rollback does not undo NXT writes
or letters staff may subsequently authorize. Reconcile uncertain assignments
read-only; do not create a replacement batch to retry them.

Evidence: `/tmp/ju-auto-appeal-` files `release.json`, `release-tests.log`,
`release-typecheck.log`, `release-build.log`, `dry.json`, `deploy.log`,
`candidate-smoke.log`, `promote.log`, `live-smoke.log`, `projects-before.json`,
and `projects-after.json`.
