# Server-Managed Portfolio Continuation

## Scope

This opt-in extension lets the existing ten-minute scheduler continue unfinished
`nightly` portfolio jobs outside the 1:00 AM through 6:59 AM Eastern window.
The page need not remain open. It uses existing durable constituent checkpoints
and keeps the last good giving and summary snapshots available.

Daytime work only resumes existing queued, processing, or eligible paused jobs
for active users. It does not rebuild assignment membership, seed new portfolios,
restart completed/failed jobs, or continue manual stale/full rebuilds. Existing
overnight membership and job creation behavior is unchanged. The separate
last-gift/action catch-up worker is unchanged.

## Bounds And Recovery

- One constituent per daytime invocation, processed serially. The existing
  overnight ten-record batch and two-worker setting remain unchanged.
- At most 360 additional daytime SKY API attempts per Eastern calendar day,
  shared across every portfolio in the database, and 60 per batch. Reservations
  are atomic and made before each provider request, including pagination.
- These are conservative local ceilings, not a measurement of remaining
  Blackbaud subscription quota. Other jobs, interactive requests, overnight
  work, and OAuth token refreshes are outside this additional SKY-read budget.
  Existing subscription-wide cooldowns still take precedence.
- Only provider GETs are allowed inside the budgeted context. Transport retries
  are disabled and each request has an eight-second timeout. Interactive reads
  and writes outside this context retain their existing behavior.
- A database-wide, token-fenced 240-second lease prevents overlapping daytime
  batches. New provider requests stop after 160 seconds. Summary and worker
  subrequests have 170/180-second deadlines, below the existing five-minute
  abandoned-item recovery lease.
- Reservations check the lease, origin, job, active workspace user, cancellation,
  and specific processing constituent. A denied reservation or budget-store
  failure pauses work rather than returning incomplete successful summaries.
- Releasing the lease enforces one minute of minimum spacing. Lost workers
  recover after lease expiry; counters are retained. Eastern day rollover resets
  the daily count on the next reservation. Different origins do not get separate
  counters within one database.
- Old open browser tabs cannot process server-managed nightly jobs. New tabs
  poll saved status every minute instead of driving a batch every three seconds.
  Manual jobs keep their existing browser-assisted behavior.

This is bounded catch-up capacity, not a promise that all portfolios finish
daily. Large records, old backlogs, authentication issues, provider throttling,
or terminal failures can still require attention.

## Controlled Rollout

The feature is **off by default**. Implementation and local verification do not
enable it in any deployed environment.

For an explicitly approved JU production deployment, set only on the JU Vercel
project's production environment:

```dotenv
PORTFOLIO_MAINTENANCE_CONTINUATION_ENABLED=true
PORTFOLIO_MAINTENANCE_ORIGIN=https://www.jumgogpt.app
```

`VERCEL_ENV` must also be `production`. The origin must be an exact HTTPS origin
with no trailing slash, credentials, path, or query. Do not copy these settings
to the conference sandbox or another project. Existing scheduled-secret and
authorized service-connection requirements still apply.

No cron schedule change is required. The first eligible daytime claim creates
the additive `portfolio_maintenance_gate` table under an advisory schema lock.
Schema privileges are required; a failure blocks continuation rather than
running unbounded. No constituent or NXT records are mutated by this feature.

After activation, verify a saved checkpoint advances on a scheduled daytime
tick with the portfolio page closed; verify the correct workspace and saved
snapshots remain visible. Check the gate's call count and expiry without exposing
lease tokens. Observe the following overnight run before increasing capacity.
Turn the flag off and redeploy to return to the existing overnight/browser
behavior; do not delete the gate or reset its counters as a retry mechanism.

## Verification

Unit tests cover opt-in/origin isolation, DST, budgeted provider reads, concurrent
reservations, route authentication, daytime-only selection, no work when idle,
browser bypass prevention, cancellation, and snapshot retention on pauses.

`scripts/check-portfolio-maintenance-postgres.mjs` runs the actual store SQL in a
disposable schema against an explicitly provided temporary local Unix socket.
It refuses remote targets. It checks concurrent migration, single lease ownership,
exact daily/batch caps, day rollover, scope fencing, deadlines, subscription
cooldowns, cancelled/inactive jobs, and DST boundaries. It drops only its own
test schema. It does not load app environment files or connect to production.

```sh
MAINTENANCE_TEST_PGHOST=/tmp/your-disposable-pg-directory \
MAINTENANCE_TEST_PSQL=/path/to/psql \
node scripts/check-portfolio-maintenance-postgres.mjs
```
