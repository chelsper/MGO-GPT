# JU Household Appeal Release - September 27, 2026

- Commit: `35346dcb7fe0beef0f304ba455228da639aca483`.
- JU deployment: `dpl_8tSWew7K48hr6GUXDZYnmYMkdKiV` (READY).
- Deployment URL: https://mgo-39fbuws1t-chelspers-projects.vercel.app
- Production alias: https://www.jumgogpt.app
- Verified production commit, deployment ID, environment, and public assets
  with `npm run verify:prod -- 35346dcb7fe0beef0f304ba455228da639aca483`.

Released the final postal-letter workflow documented in
[household finalization](society-letter-finalization.md): explicit preview and
confirmation, fresh member checks, durable per-member appeal receipts, and
recovery without blind duplicate writes. Review alone still does not assign
appeals. One selected mailing address does not remove the other household ID.

## Isolation

Deployed an archive of the exact tested commit, not the dirty workspace, with
explicit JU project `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` and team scope.
The dry-run upload contained 982 files, 10,822,979 bytes. Only `.env.example`
was included; no environment secrets, build output, node_modules, Git, or
Vercel local credentials. No Git push occurred.

Read-only project inventory before and after confirmed the sandbox stayed on
`dpl_B8rEqHDQpCyHxZrNArjiS6xTcL3D`, Git disconnected. The other linked copy
stayed on `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. Cron schedules did not change.

## Validation and Rollback

Before release: 4,404 tests passed, 30 opt-in tests skipped; the temporary local
PostgreSQL suite separately passed all 11 tests. Build, typecheck, release
guard, and desktop/mobile fictional UI checks passed. No real letter, email,
or NXT assignment was created as a deployment test.

Prior JU deployment: `dpl_Gh4Syh9WtE4TqxXjMoUGtZGxnD82` (Step 5).
Do not blindly roll back after final letters have been created: the older code
does not understand the new appeal receipts or recovery guards. Preserve the
database reservations and NXT assignments, stop new finalization, and use a
forward fix if any real household has entered this workflow.

Step 6 batch summaries are a separate local change and are not in this release.
