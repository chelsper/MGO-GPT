# Future. Made. Campaign Dashboard

## Status

Deployed to JU production on 2026-10-06. Signed-in first-load and navigation checks
passed; the sandbox deployment is unchanged. No live query execution,
query-definition change, or campaign data import was performed during this work.
See `ju-campaign-priorities-release-2026-10-06.md` for release and recovery evidence.
The screenshot identifies Gift query 27460, "FM Campaign Gifts - Same as Dashboard",
with approximately 87,465 records. Its live output columns were verified read-only
on 2026-10-07; the single-fund mapping below is prepared but not yet saved.

### Guided Mapping Follow-Up (Deployed 2026-10-07)

The guided setup is deployed to JU only. Release evidence and recovery details are
in `ju-campaign-mapping-release-2026-10-07.md`. The live query mapping remains an
unsaved draft; deployment did not authorize or run a campaign import.

The setup editor now separates loading fields, matching columns, and confirming the
save. Unique explicit labels receive suggestions without replacing saved choices;
ambiguous system IDs still need staff selection. Missing/removed fields and unsafe
lookup-code or balance mappings explain why saving is unavailable. Server-side
preflight also rejects known unsafe mappings. Changing the query or amount basis
clears the relevant choices and confirmation; stale field-loading responses cannot
overwrite a different query. Saving settings never runs the query.

JU confirmed these campaign gifts should have one fund each. For query 27460 use:

| App setting | Returned query field |
| --- | --- |
| Amount basis | One amount and one fund per gift |
| Gift system record ID | System Record ID |
| Fund system record ID | Fund System Record ID |
| Fund name | Fund Description |
| Campaign-countable amount | Gift Amount |
| Gift date | Gift Date |
| Gift type | Gift Type |
| Donor name | Not included (not returned) |

The NXT Output tree was inspected to verify System Record ID under Gift Information,
not the constituent node. Gift ID and Gift Import ID are not substitutes. A gift
split ID is not required in this explicit single-fund mode. Identical repeated gift
rows count once; a gift appearing under different funds stops publication and keeps
the last complete snapshot. No live gift rows have been imported or reconciled yet.

The query also returns Fund ID, Fund Type, Fund Category, and Gift Pledge Balance.
These are not imported by the current dashboard. Pledge balance is reserved for the
requested future received-versus-committed view; it must not replace or be added to
campaign credit. Define gift-type/payment linkage, write-offs, and recognition rules
before calculating cash received. The current query's criteria include pledges but
not Pledge Payment or Matching Gift Pledge Payment, so received reporting may need a
separate source. That future work has not been implemented.

Follow-up validation: 61 focused tests passed, including 17 isolated SQL integration
tests. The full release suite passed 5,945 tests with 174 existing opt-in tests skipped.
Typecheck, production build, release-worktree guard, and whitespace checks passed.
Desktop and 390px mobile checks
used fictional data and the actual page component; the mobile layout had no horizontal
overflow. Live inspection read only query metadata and the query editor; no NXT
definition, constituent, gift, or fund was modified.

## Staff Workflow

Open Reports > My Dashboards > Future. Made. Campaign. Admins see this built-in
dashboard by default. Use Report Access & Configurations to select other viewers.
Admins and Advancement Services can configure and edit; other authorized viewers
can browse all saved campaign gifts but cannot edit or refresh. This is a shared
dataset, not a view filtered by each viewer's individual NXT permissions.

1. In Source & refresh, load fields for query 27460. Loading fields reads only the
   query definition. It does not execute or change the query.
2. Map gift system record ID, fund system record ID, fund name, gift split system
   record ID, and the campaign-countable split amount. Optional fields are primary
   donor name, gift date, and gift type. Use a distinct output column for each value.
3. If every gift has exactly one campaign fund, explicitly select the single-fund
   gift mode instead. Never map a whole-gift amount repeated on each fund split.
   If split IDs or split amounts are missing, add/verify the necessary query outputs
   before using split mode. IDs are not inferred from names, row order, or lookup codes.
4. Confirm and save the source mapping. Run Refresh campaign explicitly. The query
   uses the configured shared reporting account. This tab polls after a user starts
   or resumes the refresh; reopening the dashboard alone never runs NXT requests.
5. Assign funds to Scholarships; Healthcare & Business; Corporate Partnerships;
   Entrepreneurship & Innovation; or Campus Planning. Unassigned allocations remain
   included in the campaign total. Fund assignments support up to 100 funds per save.
6. Search gifts or select a priority/fund to review its allocations. Adjust allocation
   affects only that gift split, not every split of the gift. A blank amount inherits
   the source amount; zero deliberately excludes that allocation's amount. A reason
   is required for each exception or revert. Original amounts remain available.

No campaign assignment or exception changes NXT, another report, or the saved query.
The query defines campaign recognition. The app does not reinterpret pledge credit,
cash received, soft credit, or campaign eligibility. Amounts are USD only.

## Accounting And Recovery

- Original query total plus local adjustments equals the campaign recognition total.
  Five priorities plus Unassigned equal that same total. Distinct gift counts in
  different priorities should not be summed because a gift may have multiple splits.
- Identical repeated gift/split rows count once. Conflicting rows for the same key
  stop publication rather than guessing or summing repeated whole-gift amounts.
- CSV ingestion streams into disposable staging tables in batches of at most 500.
  Limits are 300,000 raw rows, 128 MiB, 25 uniquely named output columns, and 2,000 funds.
  Completed NXT job row counts must agree with the downloaded CSV before publication.
- A published-run pointer changes atomically only after a complete, valid import.
  Interrupted, conflicting, over-limit, or incomplete imports retain the last complete
  dashboard. Two recent completed datasets are retained; older disposable runs are
  cleaned after a later successful publication. Audit history is retained separately.
- Query jobs pause on throttling and resume after cooldown without resubmission.
  An ambiguous job-submission result is not automatically retried. Continue/cancel
  and reload status are available to managers. There is no new background scheduler.
- Concurrent changes require an exact state version. Saves also recheck the editor's
  current role/active status and published source under a transaction lock. An open
  gift editor stays bound to the version and run that the staff member reviewed.
- Source amounts and calculations use integer cents. Absolute aggregate limits prevent
  grouping, negative amounts, or adjustments from exceeding exact integer precision.
- An exception includes a base fingerprint of gift ID, split ID, fund ID and source
  amount. If these source values change, the exception is retained but not applied;
  it is flagged for review. Removed allocations' exceptions remain in history but do
  not contribute to totals. Name/date-only changes do not invalidate an exception.
- Query/mapping/shared-connection changes create a different source fingerprint.
  Existing fund defaults and exceptions do not silently transfer to another source.
  Old results remain visible and read-only until a complete refresh of the new source.

## Implementation

The specialized route is `/reports/dashboards/future-made-campaign`; the API is
`/api/reports/campaign-priorities`. This is separate from the generic small query
table dashboard, which is not appropriate for an 87,000-row campaign.

The additive schema is in `campaignPrioritiesSchema.js`: state, runs, rows, fund
defaults, overrides, and events, plus an effective-values view. Source, refresh, fund
assignment, override and revert events record the actor and before/after information.
Per-allocation history is available in the gift editor. All NXT calls are read-only
except submitting a read-only query execution job; there are no gift/fund write calls.

The existing bounded Blackbaud result reader now awaits asynchronous consumer writes
and completion. Synchronous consumers retain their behavior. This enables backpressure
while staging SQL batches, without buffering the full CSV or forwarding SKY credentials
to signed-file hosts. Result hosts are validated by the existing pledge query URL guard.

## Verification

Automated coverage includes exact money validation, split keys, required mappings,
87,465-row streaming, headers/counts, duplicates and conflicts, atomic publication,
partial results, throttling, changed source values, orphaned overrides, source isolation,
role/access checks, stale versions, audit/revert, read-only viewers, and UI save conflicts.
Desktop and 390px mobile checks used an isolated fictional-data fixture rendering the
actual campaign component. No live NXT records or production database were accessed.

Final local checks: 5,924 tests passed and 174 existing opt-in tests were skipped
(450 passing files, 14 skipped files). All 15 campaign SQL integration tests were
enabled and passed. Typecheck, production build, release-worktree guard and
`git diff --check` passed. Production integration and real campaign totals remain
unverified until the release follow-up below.

SQL integration tests use optional PGlite (PostgreSQL WASM) in `/tmp`. The native local
PostgreSQL instance could not initialize because the host's shared-memory allocation
limit was reached. PGlite verifies the SQL and transactional behavior without changing
host settings or using a DATABASE_URL; it is not a multi-client load test of Neon.

To repeat the isolated SQL suite from `apps/web`:

```sh
npm install --prefix /tmp/campaign-priorities-test-runtime --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.5.8
CAMPAIGN_PGLITE_MODULE=/tmp/campaign-priorities-test-runtime/node_modules/@electric-sql/pglite/dist/index.js npm test -- src/app/api/utils/campaignPriorities.integration.test.js
```

The optional package is not an application dependency. Without the environment
variable, those integration tests are skipped rather than using any existing database.

## Release Follow-Up

JU-only deployment and signed-in first-load access are verified. Next, verify the
saved-field mapping and one read-only query refresh before trusting live totals.
Reconcile the first snapshot with the NXT query and confirm one fund per gift for
JU's selected mode. If multi-fund gifts are later introduced, verify split-level
output and mappings before switching modes. Assign funds, then test
a reversible local-only exception on an approved allocation. None of these live steps
have been performed yet.

Possible later additions: exported reconciliation/audit reports, per-priority goals,
date-based comparison snapshots, an exceptions-only review queue, and an explicitly
scheduled refresh after runtime/capacity is measured on JU's real dataset. Multicurrency
recognition and splitting one allocation between multiple priorities need separate rules.
