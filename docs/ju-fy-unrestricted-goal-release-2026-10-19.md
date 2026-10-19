# JU FY27 Goal And Fund-Name Release - October 19, 2026

## Released

- Production dashboard: https://www.jumgogpt.app/reports/dashboards/fy-revenue-goals
- Latest-version entry: https://www.jumgogpt.app/reports/dashboards/fy-revenue-goals?dpl=dpl_B7KZzcpv9tSc2FrxePFirUPaEosh
- Application source: `2bcf21b5567f9c7a56df80ee2563dea081ab50a4`
- Deployment: `dpl_B7KZzcpv9tSc2FrxePFirUPaEosh`
- Hosted URL: `mgo-d35667t6b-chelspers-projects.vercel.app`
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`
- Previous known-good release: `dpl_4yNAW8TKakARvMDr8FgNLFFFTmvT`, source `a97e7a75a604a36f5f980eca553a97a6180cb0f2`.

Includes all pending web-app changes for the FY27 $6.5M unrestricted goal and cash fund-name fixes. The roll-up adds query 31075 cash, 10% of query 31074 received gifts, and $3.03M in fixed contributions. Configuration is returned only through the authorized revenue endpoint. The fund breakdown uses saved names, supports name edits without metadata reload, previews matching returned funds, and explains missing query results. No schema migration, NXT write, permission change, scheduled-job change, or live query refresh was performed.

## Verification

- Exact tested source: 7,100 tests passed; 192 existing environment-dependent tests skipped. Targeted isolated PostgreSQL tests passed, including persistence of corrected names with matching totals, stale-write protection, and separate snapshot keys.
- Typecheck, production build, release-worktree guard, and whitespace checks passed. Fixed contribution names were absent from public client build assets.
- Packaged a clean committed archive with 1,308 tracked web files; all 1,448 upload files were hash-verified. Unrelated dirty documentation, local credentials, build outputs, and untracked services were not included.
- Built using the existing JU project and web manifest with `--skip-domain`. Verified release identity, dashboard/portfolio/stewardship routes, assets, prior campaign features, new goal/name controls, and unauthenticated GET/POST access guards before promotion.
- Promoted the verified candidate, then repeated the smoke checks on the live domain. Standard production identity verification passed.
- JU project settings and five cron definitions remained unchanged; cron deployment/hosts now identify this release. Sandbox and all other inspected projects remained unchanged.
- Read-only signed-in browser verification passed for both the normal dashboard URL and the explicit latest-version link. The corrected names appear in the table and form, and Save cash source and refresh is enabled with saved mappings without loading metadata. No form was submitted.

### Existing-Session Caveat

The additional synthetic stale-cookie check intentionally supplied the previous deployment's `__vdpl` pin. Vercel still routed that pinned request to the old deployment, so that check reported `existingSessionCurrent: false`; explicit latest-deployment routing passed. This was not hidden or counted as a passed check. The actual signed-in browser loaded the current release at the normal URL, and the explicit latest-version dashboard URL was also verified. Older pinned tabs should use the latest-version entry above. No user's cookies, login state, or hosting security settings were cleared or weakened.

## Observed Saved Totals

The live dashboard correctly rolled up the existing saved sources without running new queries:

- Budget-relieving cash: $364,377.52, saved October 19 at 11:01:37 AM Eastern.
- Re-investment at 10%: $57,918.99, from $579,189.89 eligible received gifts saved at 10:44 AM Eastern.
- Fixed cash contributions: $3,030,000.
- Combined received: $3,452,296.51, or 53.1% of the $6,500,000 goal.
- Remaining: $3,047,703.49.

JU Parents Fund and Future. Rising. Scholarship Fund are saved with the corrected names, but neither occurs in the saved query 31075 results. They remain zero with an explicit no-match notice. If receipts are expected, inspect the query criteria and qualifying gifts before refreshing; the deployment did not expand query scope or infer missing amounts. Browser verification confirms arithmetic and displayed saved data, not independent reconciliation of the source gifts to NXT.

Evidence: `/private/tmp/ju-fy-goal-deploy-*`, including package/upload manifests, hosted build, candidate/live smoke checks, promotion, project inventories, standard version verification, the separate stale-session result, and the signed-in screenshot. Test/build evidence is also retained under `/private/tmp/ju-cash-name-fix-*`.

## Recovery

If a code regression occurs, promote the previous known-good deployment above and verify the live source and routes. Code rollback does not revert later saved query settings or refreshed snapshots. Preserve those records; no NXT receipts or donor records need reversal for this deployment. The FY27 goal and fixed entries require an explicit update before a later fiscal year.
