# JU FY Revenue Adjustments Release - October 19, 2026

## Live Release

- Dashboard: https://www.jumgogpt.app/reports/dashboards/fy-revenue-goals
- Application source: `76072ec8ce5c8863794884e90b30ebfc37d669df`.
- Deployment: `dpl_HQB8RYYStXn7xNvURobS8z8kkE3Q`.
- Host: `mgo-7ld2nv14s-chelspers-projects.vercel.app`.
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` (`mgo-gpt`), team `team_3IFhURAiYjacqM7q8OIl6z0G`.
- Previous deployment: `dpl_3Aqs7kqYdN6S29J1G7HJsHUGvRxJ`, source `5ae5ab99256d03840ffe4ca6aa53befc5739f205`.

Adds manager-only installment amounts counted toward the goal and an audited manual cash ledger. Original NXT balances remain visible. Installment adjustments affect only the expected-receipts projection; manual cash affects received cash and the combined projection. Both are app-only, with no NXT writes. See `fy-revenue-goals.md` for arithmetic, permissions, refresh behavior, and audit safeguards.

## Verification

- The prior complete suite passed 7,190 tests; 192 pre-existing environment-dependent tests were skipped. Release-time focused checks passed 137 tests across 13 files, including isolated PostgreSQL integration. Typecheck, release-worktree, whitespace checks, and the production build passed.
- Built from an isolated archive of the committed source. All 1,321 tracked web files matched; all 1,463 upload files and inclusion of changed files were verified. Secrets, local builds, dependencies, and unrelated services were excluded. No Git push was used.
- Candidate was built with domains unassigned, checked, then explicitly promoted to JU. Candidate and live smoke checks verified source/deployment identity, page/assets availability, existing campaign and portfolio features, new controls, and unauthenticated GET/POST denial. Private fixed-contribution descriptions were absent from public JavaScript.
- Signed-in verification used the normal dashboard URL, without a version-pin parameter. The installment table showed Count toward goal after Amount still due. Manual cash contributions showed Add cash received, Edit, and Archive. An empty new-entry form had saving disabled and was canceled without changes.
- Cash received stayed $3,452,296.51; received plus expected stayed $5,544,296.51. Unpaid installments counted toward goal stayed $2,092,000 across 14 installments with zero adjustments. Manual cash stayed $3,030,000 across the three original entries, with zero recorded changes.
- No financial values, NXT records, saved query settings, or source snapshots were changed during deployment verification. No live refresh was run. No migrations, dependencies, environment settings, or schedules were added.
- JU project settings and all five cron definitions were preserved, with their hosts attached to the new deployment. All other projects except the sandbox were unchanged. The strict sandbox-unchanged assertion detected a concurrent, separate CLI deployment: `dpl_ELgAeYfBFyCzUhtmkZ5hCQw6RfVa`, source `a42c6960a59c2452e085d6522a7dc1811c2661dd`. Sandbox project settings and schedules remained identical; its deployment was not modified or reverted by this task.

Temporary verification files use `/private/tmp/ju-adjustments-deploy-*`. Live screenshot: `/private/tmp/ju-revenue-adjustments-live.png`. These are local evidence, not runtime dependencies.

## Recovery

Before any manual entries or installment adjustments are saved, the prior JU deployment is the rollback candidate. After edits are saved, that older application does not apply the new ledgers and can display different totals. Prefer a forward fix, or explicitly reconcile reporting before any rollback.

Preserve `report:fy-revenue-goals:manual-cash:v1` and the adjustments/history within `report:fy-revenue-goals:budget-pledges:v1`. Never delete these histories to restore an earlier display. App-only adjustments do not require an NXT reversal.
