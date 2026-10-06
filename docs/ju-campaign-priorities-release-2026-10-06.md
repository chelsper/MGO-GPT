# JU Campaign Priorities Release

Deployed October 6, 2026 to JU only. No campaign query was executed, no source
settings were saved, and no NXT records were changed during release verification.

## Included

- Future. Made. Campaign under Reports > My Dashboards, with the five requested
  priorities and explicit setup for Gift query 27460.
- Admin/Advancement Services fund assignments and local-only allocation exceptions,
  using fund-split amounts and stable IDs, with original values and audit history.
- Bounded streaming, duplicate/conflict checks, atomic publication, throttling pauses,
  source-version isolation, and additive campaign tables/view.
- No new scheduler, application dependency, existing donor migration, or NXT write.

## Verification

- Full suite: 450 files and 5,924 tests passed; 14 files and 174 tests skipped.
  All 15 campaign SQL integration tests ran in isolated PGlite PostgreSQL. Native
  local PostgreSQL could not initialize because of the host shared-memory limit.
  No production database was used to run the automated tests.
- Typecheck, production build, release-worktree guard, and whitespace checks passed.
- Clean Git archive matched all 1,167 tested web files. Upload inspection found no
  real environment files, dependency directories, or local Git metadata.
- Candidate and live release identity, seven page shells, JavaScript assets, and
  unauthenticated GET/POST protection passed. Repository `verify:prod` also passed.
- Signed-in read-only checks confirmed the catalog card, all five priorities,
  unconfigured query 27460, fund-split default, and navigation back to My Dashboards.
  No load-fields, save, refresh, fund assignment, or adjustment action was used.
- The personal-dashboard section showed a transient load error on the first catalog
  visit. It loaded normally when returning from the campaign page, without edits.
- Existing build warnings, including optional `canvas` resolution, remain. They also
  appeared in the previous release; this deployment did not change dependencies.

## Release And Recovery

- Application commit: `cde26a279ac104958831d8acdc04c0a66e22fd0a`.
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`.
- Deployment: `dpl_H6DXi1dFP78qhW9R4tT26SEKw7Aw`.
- Candidate: `https://mgo-9gskmu19m-chelspers-projects.vercel.app`.
- Live: `https://www.jumgogpt.app`, verified after candidate promotion.
- Deployed from an isolated archive with `--prod --skip-domain`, then promoted after
  candidate checks. The live custom domain retained the previous release until promotion.
- No Git push. Sandbox remains `dpl_3gehckKEZ5dASHnxz81MDj67sQVE`; the other app copy
  remains `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`.
- JU root/build/install settings, Git linkage, five cron schedules, and PDF environment
  configuration identities are unchanged. The PDF service was not deployed or changed.
  An unrelated `lotura-ju-pilot` deployment changed independently during verification;
  this task issued no deployment or mutation against that project.

Rollback target: `dpl_8uoqnGhGF3xQw3bijrndyS7a4Z4E`, application commit
`4d004f6f004e75bd36e9d72b2ae7c35a446bad5c`. Application rollback does not remove
the additive tables/view or later authorized campaign audit history.

Next: verify the live query's gift/fund/split IDs and countable split amounts, save
the reviewed mapping, run one approved refresh, and reconcile its totals with NXT.
Inspect a genuine multi-fund gift before making a reversible local-only adjustment.
Live import and real financial totals are not yet verified.

Local evidence: `/tmp/ju-campaign-` followed by `release-tests.log`,
`release-build.log`, `release.json`, `dry.json`, `deploy.log`, `candidate-smoke.log`,
`promote.log`, `live-smoke.log`, `projects-before.json`, and `projects-after.json`.
