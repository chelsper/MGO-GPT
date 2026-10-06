# JU Relationship Originator Release

Deployed to JU on October 6, 2026. No authenticated NXT refresh or donor write
was performed during release verification.

## Included

- Relationship Originator control in My Portfolio, Top Prospects and constituent
  search. MGO self-tagging, introduction date, Admin-only corrections and durable
  uncertain-write protection share the same implementation.
- Separate Team Standings FY/lifetime relationship counts and received-giving
  attribution from the introduction date forward. Existing standings ranks and
  solicitor credit are unchanged. Metrics refresh explicitly, not on page load.
- Additive originator audit/claim and refresh-lock tables. No existing donor data
  migration, dependency update, schedule change or automated NXT write.

## Verification

- Full suite: 445 files and 5,863 tests passed; 174 tests skipped. Four new local
  PostgreSQL tests remain unverified because local `initdb` could not allocate
  shared memory. No production database was used as a test substitute.
- Typecheck, build, release guard and whitespace checks passed. Clean Git archive
  matched all 1,154 tested web files; upload inspection found no real environment
  files or dependency directories.
- Candidate and live version, affected pages, JavaScript assets and authentication
  checks passed. Both new APIs returned 401 for unauthenticated GET/POST requests.
- Signed-in read-only browser checks confirmed the Team Standings originator
  section and collapsed control inside an expanded My Portfolio card. No refresh
  or save button was used. The metrics section correctly awaits its first refresh.
- NXT category/type/table values and an approved constituent write still need
  live acceptance. Do not treat page-load checks as verification of a live write.

## Release And Recovery

- Application commit: `4d004f6f004e75bd36e9d72b2ae7c35a446bad5c`.
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`.
- Deployment: `dpl_8uoqnGhGF3xQw3bijrndyS7a4Z4E`.
- Candidate: `https://mgo-bc27xmvqm-chelspers-projects.vercel.app`.
- Live: `https://www.jumgogpt.app`, verified after candidate promotion.
- No Git push. Before/after metadata confirms all other projects unchanged,
  including sandbox `dpl_DQvvYyh9oUYJJcAgPA9JsocAJBgL` and the other app copy
  `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`.
- JU roots, build/install settings, Git linkage, five cron schedules and PDF
  environment configuration identities/batch size are unchanged.

Rollback target: `dpl_5raMmALiotEHW1GvCFLXC4kdU2kg`, application commit
`b438be67721fe0cfa70383a96d30157c3545e51e`. Application rollback does not remove
the additive tables, undo later authorized NXT changes, or erase audit receipts.
Preserve unresolved writes and reconcile them read-only rather than resubmitting.

Local evidence: `/tmp/ju-originator-` followed by `release-tests.log`, `dry.json`,
`deploy.log`, `candidate-smoke.log`, `promote.log`, `live-smoke.log`,
`projects-before.json` and `projects-after.json`.
