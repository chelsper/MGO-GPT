# JU Budget Cash Dashboard Release - October 19, 2026

## Released

- Live dashboard: https://www.jumgogpt.app/reports/dashboards/fy-revenue-goals
- Source: `a97e7a75a604a36f5f980eca553a97a6180cb0f2`
- Deployment: `dpl_4yNAW8TKakARvMDr8FgNLFFFTmvT`
- Hosted URL: `mgo-e3kmh7zad-chelspers-projects.vercel.app`
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`
- Previous known-good deployment: `dpl_TXKhRKXgYLvyGZ9yeeXqMzquitMS`, source `14c6d8e0b3024d01abd18706286c5cfb7dcd1f8a`

Adds query 31075's budget-relieving cash total and five named fund rows plus Other Scholarships to FY Revenue Goals. The separate 10% re-investment panel remains intact. Source confirmation and initial refresh are still required; deployment did not run a live query or change NXT records. No database migration, permission change or schedule change was introduced.

## Verification

- Full suite rerun: 7,069 passed, 192 existing environment-dependent skips. Isolated PostgreSQL revenue/cash publication tests ran, including separate cache keys and stale-write protection.
- Typecheck, production build, release guard and whitespace checks passed. Previous desktop/mobile fictional-data checks remain applicable to this exact source.
- Exact committed archive verified against 1,302 tracked web files; 1,441 upload files hash-checked. Unrelated dirty files, local credentials, build outputs and services were excluded.
- Candidate built with `--skip-domain`, then passed release identity, page/asset, new cash panel, existing campaign/portfolio features, and unauthenticated GET/POST guard checks before promotion.
- All checks repeated successfully on the live JU domain; standard production verifier confirmed the expected source SHA and deployment ID.
- JU project settings and five cron definitions unchanged; cron hosts now reference the new deployment. Sandbox remained `dpl_GZ5Xb6o8Fo7NkhqkrkRXBFhZNSMW`.
- The before/after inventory observed a separate concurrent CLI deployment of `mmstudio-author-studio`, source `cc1b08e50eab662f11182e731b5610e61b739856`, deployment `dpl_BkizY3v2FfypDrKfSNshnkqaJG5i`. It was not this JU release; only that project's production pointer/timestamp changed, and no action was taken on it.

Evidence: `/private/tmp/ju-fy-cash-deploy-*`, including test/build/typecheck logs, upload manifest, candidate and live smoke logs, project snapshots, promotion log and production verifier. Private inspection evidence for the separate deployment is `/private/tmp/ju-fy-cash-other-deployment.json`.

## First Use And Recovery

Open Connect cash query, load query 31075's fields, verify gift ID/fund ID/name/amount, confirm the received-only scope and amount basis, then save and refresh. The fiscal period comes from the query. Verify the total and six fund group amounts against NXT before relying on them. These live financial checks were not performed as part of deployment.

The cash and re-investment snapshots are independent; a failed refresh preserves prior data. If a release regression occurs, promote the recorded prior deployment and reverify JU. Code rollback does not reverse any subsequent source setup or snapshot refresh, and neither operation writes gifts to NXT.
