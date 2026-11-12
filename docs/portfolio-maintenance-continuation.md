# Server-Managed Portfolio Continuation

## Scope

This opt-in extension lets the existing ten-minute scheduler continue unfinished
`nightly` portfolio jobs outside the 1:00 AM through 6:59 AM Eastern window.
The page need not remain open. It uses existing durable constituent checkpoints
and keeps the last good giving and summary snapshots available.

Daytime work only resumes existing queued, processing, or eligible paused jobs
for active users. It does not rebuild assignment membership, seed new portfolios,
restart completed/failed jobs, or continue manual stale/full rebuilds. Overnight
membership and job creation now share the fair rotation below. The separate
last-gift/action catch-up worker is unchanged.

## Fair Scheduling

The additive `portfolio_maintenance_schedule` table enrolls active users with
the MGO role and a saved fundraiser system-ID mapping on every scheduler tick.
An initial portfolio page visit is no longer required. The shared scheduled
connection still needs NXT permission to read the fundraiser's assignments.

Each tick leases the least recently served eligible workspace. New/unserved
workspaces enter before previously served ones; missing and oldest due data
break ties. Assignment discovery gets its own overnight turn, then enrichment
competes with all other portfolios on later ticks. Paused jobs, active item
leases, unmapped/inactive accounts, and manual jobs are not eligible. Completed
nightly jobs are not restarted the same night. Failed setup turns wait at least
an hour. Claims and completion updates are token-fenced; concurrent ticks cannot
claim the same workspace. Fresh assignments and current snapshots are skipped.

Within a new manifest, missing/incomplete/failed summaries come first, then
missing giving, then the oldest due snapshots. Existing manifests retain their
checkpoints. Each item rechecks saved freshness before reading NXT, avoiding
duplicate reads when another refresh already completed it.

## Bounds And Recovery

- One constituent per daytime invocation; up to ten overnight. Both budgeted
  paths process serially, reducing bursts rather than increasing concurrency.
- At most 360 additional daytime SKY API attempts per Eastern calendar day.
- At most 2,160 overnight SKY API attempts per Eastern calendar day, including
  assignment discovery. This adds a ceiling where there was no explicit night
  call cap; it does not increase the schedule. Both paths stop at 60 per batch.
  Counters are shared across every portfolio in the database. Reservations
  are atomic and made before each provider request, including pagination.
- These are conservative local ceilings, not a measurement of remaining
  Blackbaud subscription quota. Other jobs, interactive requests,
  and OAuth token refreshes are outside this worker's SKY-read budget.
  These caps leave headroom; they cannot guarantee a subscription-wide reserved
  amount for users when other integrations also consume the subscription.
  Existing subscription-wide cooldowns still take precedence.
- Only provider GETs are allowed inside the budgeted context. Transport retries
  are disabled and each request has an eight-second timeout. Interactive reads
  and writes outside this context retain their existing behavior.
- A database-wide, token-fenced 240-second lease prevents overlapping maintenance
  batches. New provider requests stop after 160 seconds. Summary and worker
  subrequests have 170/180-second deadlines, below the existing five-minute
  abandoned-item recovery lease.
- Reservations check the lease, origin, job, active workspace user, cancellation,
  and specific processing constituent (or the exact overnight membership
  workspace). A denied reservation or budget-store
  failure pauses work rather than returning incomplete successful summaries.
- Releasing the lease enforces one minute of minimum spacing. Lost workers
  recover after lease expiry; counters are retained. Eastern day rollover resets
  both window counts on the next reservation. The database clock fences each
  reservation to its claimed day/night window, including DST transitions.
  Different origins do not get separate
  counters within one database.
- Old open browser tabs cannot process server-managed nightly jobs. New tabs
  poll saved status every minute instead of driving a batch every three seconds.
  Manual jobs keep their existing browser-assisted behavior.

This is bounded catch-up capacity, not a promise that all portfolios finish
daily. Large records, old backlogs, authentication issues, provider throttling,
or terminal failures can still require attention.

Budgeted SKY HTTP 429 responses persist a subscription-wide Retry-After pause
and do not immediately replay the request. A shorter new cooldown cannot replace
a longer saved one. Subsequent workers wait; saved data remains available. This
does not add retries to NXT writes or change the interactive request retry policy.

Linked spouse/child reads sanitize provider errors before returning them. Optional
summary sections must propagate their explicit `quotaPaused` flag as well as the
original quota exception or HTTP 429. A sanitized quota error may have no HTTP
status; treating it as an ordinary optional warning would permanently fail the
item instead of pausing it. A pause keeps the item pending and preserves the last
good summary; the normal scheduler resumes after the saved cooldown without
repeating a still-current giving check. Previously failed items remain in saved
history and are not reset or automatically replayed by this fix.

### Avoiding Repeat Reads

Nightly change detection compares giving/proposal values structurally. PostgreSQL
JSONB reorders object properties; comparing serialized text to a freshly mapped
response caused unchanged inputs to trigger full summary rebuilds. Property order
alone no longer counts as a change. Actual values, types, fields and array order
still do. Expired, missing, incomplete or failed summaries still rebuild under the
existing weekly policy. No summary timestamp is advanced just for checking giving.

The fiscal-year reader goes directly to the existing four-page individual lookup
for a single constituent. It does not repeat a complete zero-result lookup, or
restart at page one after the former two-page combined-list allowance. Multi-person
requests retain their two-page combined list and per-person soft-credit fallback;
individual checks already performed during a truncation fallback are not repeated.
Incomplete results retain warnings, preventing a partial nightly giving snapshot
from being published. Read budgets, permissions, freshness windows and provider
cooldowns are unchanged; this does not add a new cross-workspace cache.

#### Pre-Release Baseline (2026-11-12)

A read-only transaction at 11:36 AM Eastern inspected saved final-attempt counters
over the preceding 24 hours, without NXT requests or data changes:

- 240 successful full summaries: 2,169 recorded calls, mean 9.04, median 9, max 15.
- 16 successful current-snapshot skips: zero recorded calls.
- No successful `giving_refreshed_summary_current` items in that window.
- 225 of the 256 latest successful workspace/constituent items had zero received
  and committed FY giving in their saved snapshot.
- Saved lifetime-giving key order differed from `mapLifetimeGiving` output order.

These are final-attempt counters, not total subscription usage or a complete retry
ledger. Some items have prior attempts; saved snapshots can change after completion.
Do not infer that every past full summary was unnecessary or that the 225 records
represent a measured production saving. The zero-result regression demonstrates
one avoided gift-list request per complete one-page individual check. Actual full
summary savings depend on current data and genuinely changed inputs.

After approved deployment, compare one normal overnight cycle without forcing
refreshes: calls per successful item by stage, giving-only successes versus full
summaries, oldest giving-check age, never-checked counts and records over 48 hours
old. Use matching workspace scopes and observation times; due counts can rise as
records age. Confirm fair turns, current-data skips and provider pauses remain
intact before considering any further capacity changes.

### Connection Renewal Failures

OAuth renewal errors retain their provider HTTP status and `blackbaud_auth`
stage, including through the nested fiscal-year giving route. An explicit
HTTP 429 or 5xx response to a refresh-token request may defer a nightly item
twice using the item's persisted `retry_count`. The existing scheduler resumes
the paused job after at least ten minutes, or the provider's longer Retry-After.
Other failures/pauses also consume that counter, so recovery is conservative.
The third failed attempt is terminal and remains available for investigation.

Invalid/rejected credentials, authorization-code exchanges, uncertain transport
responses and manual rebuilds do not get this automatic recovery. The OAuth
helper never immediately replays a request. No NXT writes are retried and no
completed historic failures are automatically requeued. A pre-fix token failure
must be reviewed before retrying because it did not retain its provider status.

## Portfolio And Admin Experience

My Portfolio shows only a small giving-update date or missing-data message.
The date is the oldest successful giving check across current assignments, not
the newest record or a completed job. Missing/future/invalid check dates prevent
a whole-portfolio timestamp. Individual summary/activity dates remain separate.
Giving over 48 hours old or a summary over 24 hours past its seven-day deadline
produces a plain-language delay notice. Failure to read saved status produces
a short availability notice. Routine progress, cooldowns and one-off failures
do not expand technical panels for portfolio users.

Admin > Integration Health owns progress, diagnostics, counters, rotation
timestamps and explicit refresh/retry/cancel controls. Opening it and opening
workspace details read saved status only. Cross-workspace reads and controls
require an active Admin session; internal summary reads use that selected
workspace without changing the browser's acting-as cookie. Manual refreshes
need the details panel open; nightly work is server-owned. A terminal failure
is not hidden from administrators or automatically retried without review.

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

No cron schedule change is required. Scheduler/lease claims initialize additive
schedule/gate tables and columns under advisory schema locks.
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
cooldowns, cancelled/inactive jobs, and DST boundaries. It also runs the actual
scheduler SQL for enrollment, rotation, current-data skipping, concurrent claims,
setup backoff, paused-job bypass and manual-job isolation. It drops only its own
test schema. It does not load app environment files or connect to production.
It also passes representative summary inputs through actual JSONB storage to
verify that property reordering does not trigger a rebuild, while real giving
and proposal changes still do.

```sh
MAINTENANCE_TEST_PGHOST=/tmp/your-disposable-pg-directory \
MAINTENANCE_TEST_PSQL=/path/to/psql \
node scripts/check-portfolio-maintenance-postgres.mjs
```
