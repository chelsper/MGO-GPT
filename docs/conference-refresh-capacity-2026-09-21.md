# Portfolio Freshness And Capacity

## Decision

Measure before increasing API traffic. The existing schedule cannot support a
daily fresh check of every assignment slot. The read-only capacity implementation
is deployed as `6402169babb27cebc0f06268675d952bd2e75630`, Vercel deployment
`dpl_9ixsa2tiDAtjJxRhRJw8D2Td8spS` on the canonical `mgo-gpt` project.
It adds an Admin-only, read-only capacity section to Integration Health. It does
not alter schedules, budgets, timeouts, concurrency, enrollment, or user pages.

## Verified Baseline

Effective Vercel project: `chelspers-projects/mgo-gpt`, root `apps/web`.
The web manifest schedules portfolio maintenance every ten minutes and activity
checks five minutes later. Both workers admit ordinary scheduled execution only
between 1:00 AM inclusive and 7:00 AM exclusive, Eastern.

On a normal six-hour night:

- Portfolio maintenance: 36 invocations x 10 items = at most 360 item attempts.
- Activity enrichment: 36 invocations x 8 calls = at most 288 reserved API calls,
  even though its separate daily budget allows 360. An action scan may need more
  than one page/call. Reusing saved activity may avoid a provider call.
- The ceiling is not delivered throughput. Cooldowns, errors, assignment work,
  lease contention, and timeouts reduce it. Daylight-saving transitions change
  the number of actual slots. Browser/manual work is not unattended capacity.

Signed-in saved evidence at approximately 12:50 PM Eastern on September 21:

- Five MGO portfolios, 908 assignment slots; 578 giving checks due, zero summaries
  due, and zero saved summary errors. This is newer than the morning audit's 489
  due count; freshness eligibility changes over time.
- Activity: 1,816 gift/action check items, 1,026 never verified, 1,528 eligible;
  288 of 360 daily reserved calls used. No saved subscription cooldown.
- One portfolio sweep takes at least three normal-night equivalents at the
  current ceiling. One fresh API call for each activity item needs at least seven.
  These are lower-bound sizing comparisons, not completion forecasts. Newly due
  work and pagination compete for capacity, while saved reuse can reduce calls.

No live NXT reads, new jobs, retries, or writes were triggered for this check.

Post-deployment signed-in evidence at approximately 1:08 PM Eastern:

- The all-active-workspace aggregate includes eight saved/MGO workspaces, 913
  known assignment slots and 853 distinct constituents. Its broader scope includes
  five additional slots beyond the five MGO portfolios in the detailed view.
- 578 assignment slots need checks; 424 have saved giving checks within 24 hours,
  zero have never been checked, and 355 have checks at least 48 hours old.
- Activity coverage remains 1,816 items / 1,026 never verified / 1,528 eligible,
  with 288 daily reservations used. No active saved subscription cooldown.
- Production SHA/assets and the signed-in capacity section were verified. No
  refresh, recovery, configuration change, or NXT write was triggered.

## Measurements Added

The capacity aggregate covers all active users with saved portfolio membership,
matching the maintenance worker's scope, and includes active MGOs without initial
snapshots as unknown. It is not capped at the detailed list's 100-workspace limit.
Malformed/absent arrays and unverified empty membership remain unknown. Existing
populated snapshots are saved membership evidence, not a live membership check.

Counts distinguish assignment slots from unique constituent IDs; duplicate roles
within one workspace count once. Different workspaces still consume separate
slots because current refresh snapshots are workspace-scoped. Removed assignments
and inactive accounts are excluded. Summary/giving backlog uses a union, not a sum.

Freshness evidence includes saved giving checks in the last 24 hours, checks at
least 48 hours old, never-checked slots, and the oldest successful giving check.
The last-24-hour count includes all refresh paths and counts each assignment only
once; it must not be interpreted as cron-only throughput. Missing/failed aggregate
reads display unknown, never healthy zeros. No donor payload or credentials are
returned. Admin authorization and private/no-store responses remain unchanged.

Worker window and batch constants are shared with the arithmetic. A regression
test checks the cron cadence against `apps/web/vercel.json`. This is configured
capacity, not runtime proof that cron executed or the provider was available.

## Freshness Targets And Release Gate

For the conference, the acceptance target is 100% of the explicitly approved
synthetic demo portfolio having saved giving and last-gift/action checks within
24 hours of rehearsal, with complete summaries within seven days. A verified
no-gift/no-action result counts; unknown does not. Prewarming requires an isolated
sandbox and an approved bounded dataset, not a forced JU-wide refresh.

For JU, the intended daily-giving target remains a sizing goal, not a supported
guarantee. Keep the 20-hour giving eligibility and seven-day summary rules as-is;
changing labels/TTLs to hide overdue work would not fix the backlog. A 48-hour age
count is an investigation threshold, not a newly promised service level.

Before expanding unattended work, compare saved coverage across consecutive
overnight windows and select an explicit freshness target with the release owner.
Then budget the combined subscription demand (reports, imports, user work, summaries
and activity), reserve interactive headroom, and test bounded catch-up and fair
workspace selection under cooldowns. Do not raise the existing activity budget or
remove the shared quota gate simply to make the arithmetic fit.

The next local change is default-off bounded morning activity catch-up, documented
in `portfolio-activity-catchup.md`. It uses at most 72 reservations within the
existing 360 daily cap and leaves the full portfolio-summary worker unchanged.
It has not been deployed or enabled and does not close the capacity finding.

Capacity measurement does not close the audit finding. Historical import-result
reconciliation, sandbox isolation, and approved sandbox write acceptance remain
separate work; no historical import was retried here.

## Validation

- 310 test files / 3,609 tests passed; typecheck, production build, release guard,
  and `git diff --check` passed. The pre-existing list-route mixed import warning
  remains unrelated and non-blocking.
- Actual aggregate SQL passed against a disposable local PostgreSQL instance:
  shared/duplicate IDs, overlapping backlog, valid empty vs unavailable membership,
  inactive/removed assignments, age buckets, 117 workspaces, and empty database.
  The database was stopped afterward. Reproduce with
  `apps/web/scripts/check-refresh-capacity-postgres.mjs` and its guarded local
  socket environment setting.
- The actual page with synthetic responses and built CSS rendered at 1487px and
  390px widths, with matching document widths and no browser errors. Component
  tests verify disclosure/reload behavior adds no automatic fetch or NXT work.
- Capacity UI and measurements were deployed and confirmed by SHA/assets and
  signed-in read-only health inspection. Catch-up is a separate local follow-up.
