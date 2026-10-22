# JU Opportunity Import Eligibility Release

Deployed to JU on October 6, 2026. No authenticated opportunity sync or NXT write
was performed. James Gillis's live import still requires a subsequent authorized
opportunity sync; deployment verification does not establish that it was imported.

## Behavior

- Preserve the original Future. Made. Campaign Purpose eligibility.
- Also import other assigned, active/open opportunities created in NXT during the
  current JU fiscal year or later. FY27 starts July 1, 2026 in Eastern time.
- Use verified `date_added`, not expected, ask, modification, or app-import dates.
  Missing creation metadata is read from identity-matched NXT opportunity details;
  absent or invalid metadata never qualifies a non-campaign record by guessing.
- Apply eligibility per newly imported opportunity so an eligible donor does not
  pull in unrelated older opportunities. Reuse saved NXT opportunity IDs and
  preserve archive and pending-change protections. Existing history is retained.

No database migration, dependency update, new scheduler, or NXT write endpoint.
The earlier Nellie numeric-name correction is not included in this release.

## Validation

- Full suite: 5,801 tests passed, 170 skipped. Opt-in database/live suites were not run.
- Typecheck, production build, release guard, and whitespace checks passed.
- A clean Git archive matched all 1,138 tested web files. No local credentials,
  real environment files, or unrelated working-tree edits were uploaded.
- Vercel built the production-target candidate without domain promotion. Candidate
  and live checks confirmed the expected SHA, root/My Prospects/pipeline pages,
  and JavaScript assets. Unauthenticated pipeline/prospect reads and an empty
  opportunity-sync POST returned 401. No app session or live import was used.
- The known non-blocking optional `canvas` resolution warning and existing
  dependency deprecation notices remain.

## Release And Recovery

- Application commit: `b438be67721fe0cfa70383a96d30157c3545e51e`.
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`.
- Deployment: `dpl_5raMmALiotEHW1GvCFLXC4kdU2kg`.
- Candidate: `https://mgo-bnwxhg9hf-chelspers-projects.vercel.app`.
- Live domain: `https://www.jumgogpt.app`, verified by `/api/version` after promotion.
- No Git push was used. Only the verified JU candidate was promoted.
- Before/after metadata confirms the conference sandbox stayed on
  `dpl_Cg3aAihYRK8i7jwbWYMoVwqF6cAm`, the other app copy stayed on
  `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`, and PDF service metadata was unchanged.
- JU project roots, build/install settings, Git linkage, PDF environment
  identities/batch size, and all five cron paths/schedules were unchanged.

Rollback target: `dpl_FA563Tyg5deuAdEN6Z6YLJ7sQ6uo`, application commit
`87698e39e11b24678fc989dfde04929970d765c2`. Rollback does not remove any records
subsequently imported by an authorized sync. Never delete saved opportunities
or reset history to roll back code.

Local evidence uses `/tmp/ju-opportunity-eligibility-` followed by `deploy.log`,
`promote.log`, `candidate-smoke.log`, `live-smoke.log`, and
`projects-before.json` / `projects-after.json`.
