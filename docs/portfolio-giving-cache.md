# Portfolio Giving Cache

The annual/lifetime society badges and full constituent intelligence summaries
share successful NXT gift-list and constituent lifetime-giving reads. The
calculations remain in their existing helpers. Current-FY giving reports and
fundraiser-credit calculations do not use this raw read cache. The default
portfolio report now has its own complete saved-report path; see
[Saved Portfolio Giving Report](portfolio-giving-report.md).

## Isolation And Safety

- Raw read-cache entries use a separate `portfolio-giving-v1|` key namespace in
  the existing `blackbaud_constituent_summary_cache` table. The separate nightly
  snapshots and weekly policy require the additive schema changes below.
- Keys include workspace, authorizing connection, constituent, app origin,
  exact filters and pagination limits. Different date ranges are never assumed
  equivalent, and constituent donor totals are never substituted for solicitor
  fundraising credit.
- Simultaneous identical requests within one server worker share a promise;
  completed entries are stored in the database for reuse by other workers.
  This is not a cross-worker distributed lock: simultaneous cold misses in
  separate workers can still perform duplicate reads.
- Failed, malformed and truncated responses are not cached. Errors propagate
  through the existing summary warning/throttling paths. Previously valid
  entries and summary snapshots are not deleted on refresh failure.
- Cache database failures fall back to live reads. Responses over 2 MiB are
  returned but not persisted. Superseded cache keys older than two days are
  pruned for the same workspace/connection/constituent when another key is saved.

## Freshness

- Giving cache entries expire 24 hours after retrieval starts. Reading a cache
  entry does not reset its deadline.
- Full intelligence summaries become stale after seven days. Their
  `summaryRefreshedAt` is independent of `givingDataFreshUntil` and is not
  renewed by reading the summary or updating giving. Contact-only/report-profile
  caches retain their previous 24-hour lifetime.
- Opening an existing summary continues to serve the last good snapshot.
- An active portfolio page continues its job batch by batch. The independent
  overnight worker checks every 10 minutes from 1:00 AM through 6:59 AM Eastern
  and processes one batch per invocation. This is still at most 360 constituents
  per overnight window across all workspaces when no browser is assisting;
  backlogs/throttling can delay completion beyond one night. Cron frequency,
  batch size and concurrency were not increased.
- Stale-only jobs set `refresh=1&reuse_giving=1`: rebuild the summary but reuse
  still-current giving reads. Individual manual refresh and full rebuild omit
  `reuse_giving` and fetch fresh giving data.

## Lightweight Nightly Maintenance

- Refresh assignment membership before enrichment backlog work when older than
  20 hours. Nightly manifests select missing/stale giving or intelligence and
  prioritize missing/failed intelligence. They retain the same durable
  constituent checkpoints, two-worker limit and ten-item batch size.
- Each nightly item first runs `summary?giving_only=1`. It fetches giving only,
  uses the existing annual-society and FY-giving calculations, and persists a
  separate `portfolio_giving_snapshots` row. It does not retrieve identity,
  education, family or relationships, or regenerate a narrative.
- Current full summaries are left untouched unless the persisted lifetime-giving
  inputs or local proposal-summary inputs changed. Other NXT changes are picked
  up during the weekly full refresh or a manual refresh; this is not a universal
  Blackbaud change feed.
- A successful giving update survives a later full-summary failure. A failed
  giving update does not invalidate the last good intelligence snapshot.
  Scheduled terminal jobs are not automatically recreated repeatedly in the
  same night. Manual retry-failed remains available.
- Portfolio badges and FY figures use `portfolio_snapshot=1`, serving saved
  data without NXT calls. Missing values are pending, not fabricated zeros.
  Other reports retain their existing data paths. The first nightly pass
  populates the new FY snapshot; earlier society values remain available from
  existing intelligence snapshots during that transition.
- Giving snapshots become eligible after 20 hours, allowing the next overnight
  pass to run without exact 24-hour scheduling drift. Reading never renews them.
  Old snapshots remain visible if a refresh fails. Strict nightly readers
  propagate throttling, reject partial/malformed gifts and preserve previous
  snapshots when optional relationship verification cannot finish.
- Schema changes add the giving-snapshot table and a one-time weekly-policy
  marker. Valid existing intelligence snapshots transition to seven days from
  their previous successful refresh, not seven days from deployment. Failed
  snapshots are not renewed. No existing snapshots are deleted.
- UI labels distinguish nightly maintenance from full intelligence work, show
  separate giving/narrative timestamps, and allow stale-giving refresh without
  an administrator full rebuild.

## Quiet Background Status

- A nightly-mode job with current saved summaries, zero failures, valid progress
  counts and a saved progress update within 15 minutes appears as a compact
  disclosure. It shows giving-check progress separately from summary freshness;
  current summaries do not imply that giving checks are complete.
- Expanding details is local UI only. Automatic batch requests do not reopen the
  disclosure. A normal nightly cooldown with current saved summaries, valid
  progress and zero failures also stays collapsed, with a short waiting status.
  The saved retry deadline may outlast the 15-minute progress window; the panel
  remains collapsed through the cooldown and for up to 15 minutes afterward
  while automatic continuation resumes. Opening details retains the existing
  cooldown-aware controls and does not trigger requests.
  Completion collapses it again; failures, stale/unknown summaries, invalid
  pauses, overdue pauses, missing/old running progress and status-request errors
  remain visible.
  Old progress is a reason to check, not proof of failure or a worker heartbeat.
- Manual stale-summary/full-rebuild jobs retain expanded progress. This change
  adds no NXT requests and does not alter job creation, processing, retries,
  refresh deadlines, browser assistance, scheduling, batch size or concurrency.
  The overnight capacity limit above still applies; this is a presentation fix,
  not a guarantee that every workspace finishes overnight.

## Saved Portfolio Contacts

- My Portfolio merges saved contact details into both fresh and stale assignment
  responses. It uses two bulk database reads, not a contact/summary request per
  card. Opening cards, changing density, sorting and filtering add no NXT reads.
- Contact selection excludes giving-only, incomplete and malformed payloads
  before choosing the newest complete contact snapshot. Raw summary caches stay
  scoped to the workspace and authorizing connection. Existing shared workspace
  intelligence snapshots use the same workspace boundary as the summary endpoint.
  Only assigned constituent IDs are read, and full summaries are not returned.
- Saved contact checks use the summary-cache retrieval timestamp or the workspace
  snapshot's last successful refresh, never maintenance's `updated_at`. Reusing
  contacts does not write or renew the assignment cache or its identity deadlines.
- Missing contacts may fall back to local workspace records. Explicitly empty
  fields in a saved NXT contact snapshot remain empty; older local values are not
  restored. Missing/malformed snapshots and optional cache-read failures retain
  last-known contacts. Older snapshots cannot replace newer dated contact data.
- Detailed cards show the saved-contact checked date when known. Contacts loaded
  through the existing explicit NXT Summary control remain visible while that
  summary refreshes and if the request fails. No webhook, contact-only fetch,
  additional polling, or nightly scheduling change is introduced by this fix.

## Verification

Tests cover badge-first and summary-first reuse, manual bypass, matching filters,
connection/workspace isolation, expiry, unchanged freshness deadlines, zero
giving, incomplete/malformed data, provider failures, concurrent reads,
out-of-order writes, cache outages and bounded entry size.
