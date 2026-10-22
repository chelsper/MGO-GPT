# JU FY Revenue Goals Release - October 19, 2026

## Deployed First Source

JU production: https://www.jumgogpt.app/reports/dashboards/fy-revenue-goals

- Source commit: `14c6d8e0b3024d01abd18706286c5cfb7dcd1f8a`
- Deployment: `dpl_TXKhRKXgYLvyGZ9yeeXqMzquitMS`
- Candidate: `mgo-1cedfqtly-chelspers-projects.vercel.app`
- Previous deployment: `dpl_8XhJaVFLYxD4PvAdDNapDJq5A3oy` (`f7bf5cef9ff86e478a0327a8b256009c0bde0f28`)
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`

Adds FY Revenue Goals using Gift query 31074. Projected Gift Re-Investment To Date defaults to the user's confirmed **10% set aside**, not the 90% remaining. Source mappings and received-only scope require manager confirmation. Opening the dashboard reads saved totals only. No donor records, gift amounts, NXT query definitions or sharing permissions were changed by deployment.

## Verification

- Exact committed web tree archived and uploaded; 1,294 tracked web files and 1,432 upload files hash-checked. No local environment files or uncommitted web changes included.
- Production candidate built with domain promotion withheld until smoke checks passed. Candidate and live dashboard assets and unauthenticated API guards checked.
- 52 first-source focused tests passed, including isolated PostgreSQL publication tests. Full pre-release suite: 7,021 passed, 192 existing environment-dependent skips. Typecheck and production build passed.
- Standard production verifier passed after promotion.
- JU settings and five cron schedules unchanged. Other project comparisons empty; sandbox deployment remains `dpl_GZ5Xb6o8Fo7NkhqkrkRXBFhZNSMW`.
- Deployment did not execute query 31074 or initialize its source. Live output mappings and financial reconciliation remain a first-use verification, not a completed deployment check.

Evidence is in `/private/tmp/ju-fy-revenue-*`, including `live-smoke.log`, `production-verify.log`, `deploy-after.log` and `deploy-other-project-changes.json`.

## Follow-On Work

The budget-relieving cash panel using query 31075 was implemented and tested **after** this deployment. It is not live in the deployment above. See `docs/fy-revenue-goals.md` for its six fund groups, mapping requirements, tests and remaining live verification.
