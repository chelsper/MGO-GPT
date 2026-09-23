# Society Recognition Refresh

## Defect and scope

The NXT Gift list's `constituent_id` filter selects direct donors. It does not
discover gifts owned by another donor with a soft credit to the requested person.
The latest-gift summary can show such a gift even when the old society search
returns no gifts. On September 23, a read-only JU check confirmed that gift
309718 is returned without a donor filter, with a $10,342 credit to each of
constituents 211277 and 216939. No NXT records were changed.

The fix changes annual society discovery and saved badges, not society thresholds,
the letter ledger, household eligibility, email delivery, or FY report calculations.
Under JU's existing settings, President's Society is the displayed annual tier at
$10,000+, alongside applicable lifetime badges. It does not additionally display
Order of the Dolphin, whose configured maximum is $9,999.99.

## Background source

- `/api/internal/society-giving-refresh` requires the existing cron secret and an
  Admin/Advancement Services refresh connection. No browser can start a scan.
- Vercel runs it at minutes 7, 17, 27, 37, 47 and 57. A completed source is eligible
  for refresh after 20 hours; current data causes no NXT requests.
- At most five read-only API requests per run, 12-second request timeouts, no
  immediate retries, a 90-second lease, and a 200-page ceiling.
- It loads fund descriptions including inactive funds, then gifts from the earliest
  configured annual period through the scan's starting date. No donor filter is
  applied. Only the minimal fields needed for society calculations are stored.
- `society_giving_sources` stores leases, checkpoints and the active generation.
  `society_giving_source_pages` stores staged/completed pages. Both are created
  additively under a database advisory lock; deployment does not rewrite NXT.
- Data is scoped to the connected user, connection ID/reconnect time, application,
  callback configuration and subscription. Token renewal preserves the reconnect
  time; a fresh OAuth connection changes it. JU and sandbox must still use separate
  databases and OAuth credentials, as required by the deployment isolation policy.
- Every page must validate, counts must reconcile when supplied, and gift IDs must
  be unique across pages before the active generation changes. Off-host pagination,
  repeated pages, unknown funds and malformed amounts/credits prevent publication.
- NXT cooldowns retain the checkpoint and last completed generation. Invalid or
  changing input restarts after a cooldown, never publishes partial totals.

## Saved badges and safeguards

After publication, the worker reconciles up to 100 saved workspace/constituent
pairs per run, updating only their annual society subtree. Lifetime society
results, contact data, narratives and FY totals retain their own source dates.
Changing annual definitions restarts this local reconciliation without new API
calls when the saved date window still fits. Existing snapshots are repaired
without opening every portfolio.

Society calculations count each gift once, use the actual recipient credit amount,
and do not count a donor's self-credit again. Fund exclusions use verified fund
descriptions and preserve the existing whole-gift exclusion policy.

Portfolio and Top Prospects visits prefer saved society results; they never initiate
the organization scan. Summary enrichment uses the completed annual source while
retaining the existing lifetime/planned-gift path. If the source is unavailable, a
saved society result is retained with `refreshPending`, not replaced by zero.
Where no saved result exists, the annual enrichment remains unavailable rather
than asserting no qualification.

Snapshot writes protect a newer recognition result from an older in-flight refresh.
Reconciliation uses compare-and-set on the society subtree. Reading the active
generation and its gifts uses one MVCC query to avoid publication/cleanup races.

Annual definitions based on planned-gift *presence* require their existing
authoritative realization checks and are not rewritten by the amount-only
reconciler. Historical soft-credit discovery for lifetime planned-gift presence
and the analogous donor-filter issue in FY giving are separate follow-up work;
neither is silently changed by this release.

## Verification and rollout

Unit tests cover recognition recipients, partial credit amounts, donor self-credit,
duplicates, fund/type/date exclusions, source validation, scope isolation, saved
fallbacks, and preservation of future-dated lifetime planned gifts.
Opt-in PostgreSQL tests cover publication, reconciliation, rate-limit checkpoints,
partial results, request budgets, concurrent leases, reconnect isolation, newer
results, and threshold changes. They use a disposable local Unix-socket database,
never `DATABASE_URL`.

After a JU-only deployment, let the first source complete and reconcile. Inspect
`active_metadata`, `pending`, `retry_after`, `last_error`, `reconcile_cursor` and
`reconciled_at` through an authorized diagnostic connection. Verify Chad's saved
annual result and badge, then another credited constituent. The badge is not a
live NXT check; do not promise an immediate change before this first pass finishes.
Do not redeploy or reconnect the sandbox as part of JU verification.
