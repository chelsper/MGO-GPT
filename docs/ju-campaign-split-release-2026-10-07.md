# JU Campaign Split-Gift Release

Deployed October 7, 2026 to JU only, following the user's explicit Deploy request.
No campaign query was executed, source settings saved, or NXT gift/fund changed.

## Included

- Whole-gift query mode retains each returned gift/fund pair while staging. Rare
  multi-fund gifts are reconciled using read-only NXT Gift detail requests, with
  real split IDs and amounts rather than repeated whole-gift amounts.
- Bounded, resumable allocation verification preserves completed checks during
  Blackbaud cooldowns and keeps previous published results until the run completes.
- Existing single-fund identities and local campaign exceptions remain intact.
  Split exceptions apply to their individual allocation only.
- Specific duplicate/fund-limit diagnostics also explain the earlier failed run
  without changing it or rerunning NXT. Manager diagnostics stay hidden from viewers.
- The only schema addition is an index on staged run/gift ID. No dependency,
  scheduler, gift-write, recognition-period, or pledge-credit changes were made.

## Verification

- Fresh full release suite: 455 files and 5,988 tests passed; 14 files and 174
  existing opt-in tests skipped. All 29 campaign SQL tests ran in isolated PGlite,
  never against production. Tests cover four allocations totaling $153, exact
  amounts, duplicate handling, preserved overrides, bounds, cooldowns, and leases.
- Typecheck, production build, release-worktree guard, and whitespace checks passed.
- Isolated Git archive matched all 1,176 tested web files; upload inspection found
  all new campaign files and no real environment files, dependencies, or Git metadata.
- Candidate and live version identity, seven application page shells, three JS
  assets, and unauthenticated campaign GET/POST protection passed.
- Signed-in live campaign page loaded successfully, displayed Original allocation
  total and verified-split wording, and read the old failed run's detailed diagnostic.
  The saved run still has no published totals. Its old error is not a new refresh
  failure. The confirmation checkbox was left unchecked; Refresh was not pressed.
- Sandbox and all other project release identities were unchanged. JU root,
  build/install settings, Git linkage, five cron definitions, and PDF environment
  configuration identities were unchanged. No Git push occurred.
- Existing optional canvas and dependency deprecation warnings remain; build passed.

## Release And Recovery

- Application commit: `c27c91ab879f7084098a63ce845e56df2ebbffb3`.
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` (`mgo-gpt`).
- Deployment: `dpl_7xhrQMNrYHqBhwqyZ2Hd9HquyNuj`.
- Candidate: `https://mgo-bzgiemw86-chelspers-projects.vercel.app`.
- Live: `https://www.jumgogpt.app`.
- Isolated archive deployed with `--prod --skip-domain`, then promoted only after
  candidate checks passed and the old live release identity was reconfirmed.
- Sandbox remains `dpl_BMnNMuz5weHFR4UvmAM8prqw7S3j`; other MGO app copy remains
  `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. The PDF project was not deployed or changed.

Rollback target: `dpl_7ZCsZkGvUwDExJB3PoJfiwiQDcTc`, application commit
`a90bfb6b0ea058fd18107600d71ad7d0e64ee971`. The additive index can remain on rollback.
Old code cannot complete the new resolving phase: cancel an active refresh before
rollback rather than attempting to resume it with old code. Application rollback
does not reverse later staff-authorized imports, assignments, or exceptions.

Next: in Future. Made. Campaign, refresh once using the existing saved mapping.
The old failed staging run cannot supply the discarded alternate fund rows. Verify
the two gifts appear as four allocations totaling $153, then reconcile the complete
campaign snapshot before relying on its totals. This live acceptance step remains
outstanding; deployment smoke checks do not substitute for it.

Evidence uses the `/tmp/ju-campaign-split-` prefix: `release-tests.log`,
`release-build.log`, `release.json`, `dry.json`, `deploy.log`,
`candidate-smoke.log`, `promote.log`, `live-smoke.log`, `projects-before.json`,
and `projects-after.json`.
