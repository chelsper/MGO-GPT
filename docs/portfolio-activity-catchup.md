# Bounded Morning Activity Catch-Up

## Status And Scope

Local follow-up to the deployed capacity report (`6402169`, September 21, 2026).
Not deployed or enabled. No production environment setting, enrollment, queue,
snapshot, NXT record, or credential was changed to validate this implementation.

The normal six-hour night provides 288 activity request reservations despite a
360/day hard cap. An optional morning window can use up to 72 more of those
existing reservations. This applies only to last-gift / last-action enrichment,
not the full portfolio summary/giving worker, reports, imports, or contact checks.

This is a bounded improvement, not a daily-freshness guarantee. The current 1,816
activity items still exceed 360 fresh calls/day, even before pagination, retries,
or newly due checks. The capacity audit remains open. Larger expansion requires
combined subscription-demand measurement and interactive headroom, not higher
limits by assumption. No real-time NXT change notifications are introduced.

## Guardrails

- `PORTFOLIO_ACTIVITY_CATCHUP_ENABLED` must be exactly `true`, and `VERCEL_ENV`
  must be `production`. Unset, malformed, preview and development settings do not
  enable catch-up. Existing canonical-origin, enrollment, cron-secret and active
  authorized scheduled-account checks still apply.
- Ordinary scheduled catch-up is admitted from 7:00 AM inclusive to 9:00 AM
  exclusive, America/New_York. The existing ten-minute cron cadence is unchanged.
  Every catch-up request reservation also checks the database's Eastern clock,
  so a batch crossing 9:00 AM cannot start another API request reservation.
- The same origin lease serializes normal, manual and catch-up batches. Each
  batch retains its eight-call, 20-row and 90-second processing limits, eight-
  second request timeout, no internal retries, and spacing between calls.
- Atomic SQL reserves both the unchanged 360/day total and a 72/day catch-up
  sub-budget. All enrolled workspaces share those counters. Catch-up can use only
  remaining total capacity; a missed night does not authorize 360 morning calls.
  Failed provider requests still consume reservations. Old-day counters roll over
  together using the Eastern date; wrong/expired leases cannot reserve.
- New gate claims and each reservation check the persisted subscription cooldown.
  The existing provider circuit breaker remains authoritative at request time;
  this worker's counters do not represent the subscription's remaining quota.
  A 429 stops the batch rather than treating every remaining row as failed.
- Existing lane fairness, workspace rotation, scan resumption, hint handling,
  last-good result retention and staggered next-check times remain unchanged.
  No snapshot deletion, bulk invalidation, queue reset or constituent write occurs.
- Existing secret-authorized `force=1` behavior is retained outside scheduled
  windows. Inside an enabled catch-up window it uses the catch-up sub-budget and
  cannot bypass the cutoff. It always shares the total daily limit and cooldowns.

## Schema And Visibility

One additive `catchup_call_count INTEGER NOT NULL DEFAULT 0` column is added to
`portfolio_activity_refresh_gates` under the existing activity-schema advisory
lock. Existing total reservations and saved results are preserved. No destructive
migration or historical reset is required.

Setup > Integration Health shows the switch state and saved morning usage to
Admins. Its existing gate query reads the optional column via `to_jsonb`, allowing
read-only health inspection before a worker initializes the column. Missing
evidence stays unknown. There is no enable button and no new constituent-card
banner, page-load refresh, or additional NXT request on the health page.

## Activation Gate

1. Review and deploy the code with the switch off. Verify production SHA/assets,
   schema initialization, health access and unchanged normal scheduled behavior.
2. Confirm the target is isolated sandbox or explicitly approve a bounded JU
   production trial. Review saved subscription cooldowns and interactive demand.
   Keep enrollment and other workers' budgets unchanged; do not copy JU secrets
   or donor data to the conference environment.
3. With explicit activation approval, set the production switch to `true` and
   redeploy. Wait for scheduled execution rather than forcing a full refresh.
   Record the release, workload, starting counters and initial coverage.
4. Compare saved evidence before and after consecutive overnight/morning windows:
   catch-up use no higher than 72, total no higher than 360, progress distributed
   across portfolios, failures/cooldowns, oldest checks and first-fill backlog.
   Verify normal user requests remain responsive. A newer timestamp alone does
   not prove complete coverage. No monitor or recurring task was created here.

If activation is not approved, leave the switch off. Deploying the feature does
not itself authorize morning reads.

## Rollback

Set `PORTFOLIO_ACTIVITY_CATCHUP_ENABLED=false` and redeploy to stop new catch-up
batches. An in-flight bounded batch can finish; the database cutoff and caps still
apply. To stop all scheduled activity enrichment use the existing enrollment
mode `disabled`. Do not clear counters, snapshots, receipts or saved errors.

Older code can ignore the additive column, but mixed-version rollout still shares
the existing total budget and lease. Restoring old code does not require dropping
the new column. Leave the catch-up switch off during rollback and verify the
production SHA before considering another trial.

## Validation

All 311 test files / 3,639 tests passed, along with typecheck, production build,
release guard and `git diff --check`. The existing list-route mixed static/dynamic
import notice remains unrelated and non-blocking. No live NXT requests or
production database mutations were used for catch-up validation.

Focused tests cover production-only opt-in, Eastern/DST window boundaries, route
guards, same batch budget, cutoff/cooldown interruption, first-429 stop, additive
migration, health rendering and read-only capacity reporting.

The disposable PostgreSQL script `apps/web/scripts/check-portfolio-activity-postgres.mjs`
also exercises actual SQL with synthetic fixtures: concurrent migration preserves
legacy counters, 16 competing reservations cannot exceed either cap, day rollover
resets both counters correctly, ordinary calls share the total cap, expired/wrong
leases are fenced, shared cooldowns block claims/reservations without spending
counters, and a leased batch cannot reserve after 9:00 AM Eastern. Existing saved
data, fairness, authorization-scope and enrollment checks also pass. The fixture
uses only an explicitly supplied local Unix socket and drops its own schema.
The disposable database server was stopped after validation.
