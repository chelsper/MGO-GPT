# Future. Made. Campaign Dashboard

## Status

Deployed to JU production on 2026-10-06. Signed-in first-load and navigation checks
passed; the sandbox deployment is unchanged. No live query execution,
query-definition change, or campaign data import was performed during this work.
See `ju-campaign-priorities-release-2026-10-06.md` for release and recovery evidence.
The screenshot identifies Gift query 27460, "FM Campaign Gifts - Same as Dashboard",
with approximately 87,465 records. Its live output columns were verified read-only
on 2026-10-07. Staff later saved the single-fund mapping, but the first import was
blocked by two genuine split gifts; see First Import Diagnosis below.

### Guided Mapping Follow-Up (Deployed 2026-10-07)

The guided setup is deployed to JU only. Release evidence and recovery details are
in `ju-campaign-mapping-release-2026-10-07.md`. At deployment, the live query mapping
was an unsaved draft; deployment did not authorize or run a campaign import.

The setup editor now separates loading fields, matching columns, and confirming the
save. Unique explicit labels receive suggestions without replacing saved choices;
ambiguous system IDs still need staff selection. Missing/removed fields and unsafe
lookup-code or balance mappings explain why saving is unavailable. Server-side
preflight also rejects known unsafe mappings. Changing the query or amount basis
clears the relevant choices and confirmation; stale field-loading responses cannot
overwrite a different query. Saving settings never runs the query.

JU initially selected one fund per gift. Staff saved this mapping for query 27460;
split-gift support is now deployed to JU. A fresh refresh with the existing mapping
is required before the first complete import can publish:

| App setting | Returned query field |
| --- | --- |
| Amount basis | Whole gift amount (saved `gift` mode) |
| Gift system record ID | System Record ID |
| Fund system record ID | Fund System Record ID |
| Fund name | Fund Description |
| Campaign-countable amount | Gift Amount |
| Gift date | Gift Date |
| Gift type | Gift Type |
| Donor name | Not included (not returned) |

The NXT Output tree was inspected to verify System Record ID under Gift Information,
not the constituent node. Gift ID and Gift Import ID are not substitutes. A gift
split ID is not required in whole-gift mode. At the guided-mapping release, repeated
identical gift rows counted once and a gift under different funds stopped publication.
The deployed split-gift follow-up replaces that limitation with bounded, read-only
allocation verification. No live campaign totals have yet been published.

### First Import Diagnosis (2026-10-07)

Staff subsequently saved this mapping and started the first refresh. A database-
enforced read-only inspection found 87,463 staged gift IDs, 476 distinct funds,
two conflicting gifts, and no published run. Read-only NXT gift-page inspection
confirmed that both exceptions are actual two-fund gifts in the campaign. The
single-fund assumption is therefore not true for the entire dataset. The import
must remain unpublished until actual fund allocations can be represented without
repeating or discarding whole-gift amounts. Do not switch modes without verified
split identifiers and amounts, infer a 50/50 rule, silently exclude the two gifts,
or overwrite staging rows to force publication.

The local diagnostic fix separates duplicate conflicts, fund-count limits, and
row-count validation errors. Manager-only messages include the actual conflict
count, up to five gift system IDs, and the actual fund count. Already-failed legacy
runs are diagnosed using SELECT-only reads; no query restart is needed to explain
the failure after deployment. Ordinary viewers receive no job diagnostics. The
diagnostic change alone does not resolve split allocations or publish the failed run.

Validation: 5,953 tests passed, 174 existing opt-in tests skipped; all 19 isolated
campaign SQL integration tests passed. Typecheck, production build, release guard,
and whitespace checks passed. No production records, configuration, or query
definition changed; the read-only API diagnostic sent no request because its
existing token was unavailable, and the gift details were verified in the user's
signed-in NXT browser instead. No refresh or deployment was performed for this fix.

### Verified Split Gifts (Deployed 2026-10-07)

JU-only release, signed-in page checks, sandbox isolation, and rollback evidence
are recorded in `ju-campaign-split-release-2026-10-07.md`. Deployment did not run a
campaign refresh; the previous failed import still needs a fresh run.

Staff approved treating the two split gifts as four campaign rows: $50 for Haskell
Public Policy Institute Fund, $50 for JU's Greatest Needs, $26.50 for JU's Greatest
Needs, and $26.50 for JU Scholarship Fund. These total $153, retain the two original
gift IDs, and do not create four new gifts in NXT.

Whole-gift mode now stages each distinct gift/fund pair. Identical repeated rows
collapse; conflicting values for the same gift/fund still block publication. If a
gift has multiple returned funds, a separate resumable phase reads that exact gift
through the existing shared reporting connection. It requires actual NXT split IDs
and amounts, exactly one split per returned fund, an exact match to the query's fund
set, and a split sum equal to the whole-gift amount on every query row. Missing,
additional, repeated, changed, negative, or unreconciled allocations fail closed.
Nothing is guessed, divided equally, or appended from outside the query.

These checks use GET Gift (read-only); see the primary
[Blackbaud Gift and Gift Split entities](https://developer.blackbaud.com/skyapi/renxt/gift/entities).
Only multi-fund gifts trigger detail reads: up to 100 gifts per refresh, 20 funds
per gift, and 10 sequential requests per continuation, with existing shared cooldown
handling and no automatic retries. Larger or more complex split datasets require
explicit split-ID/split-amount query outputs. After a cooldown, the completed gifts
are retained without rerunning or redownloading the query. Ordinary single-fund
gifts retain their existing keys and need no extra NXT calls. Split allocations use
real `giftId:splitId` keys, so local overrides remain allocation-specific.

The only schema addition is an index on staged run/gift ID. Allocation replacements
are atomic and lease-guarded; publication still waits for the whole dataset. The old
failed run cannot be repaired from its retained first rows because it discarded the
second fund rows. After deployment, start a fresh refresh with the existing saved
mapping. No mapping change, NXT query edit, gift write, or production import was
performed during this deployment.

Local verification: 5,988 tests passed, 174 existing opt-in tests skipped. The final
focused pass passed all 110 campaign tests, including 29 isolated PostgreSQL tests:
four allocations totaling $153; unequal allocations; cross-batch deduplication;
unchanged single-gift keys and overrides; missing/extra IDs and funds; amount
reconciliation; ten-request batches; the 100-gift cap; saved cooldown checkpoints;
connection changes; cancellation; lease expiry; and preservation of the prior
published dataset. Typecheck and the production build passed. Release-worktree and
whitespace checks passed. Live import validation remains a post-deployment step.

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
3. For mostly single-fund gifts, choose Whole gift amount and return every fund for
   every gift. Occasional multi-fund gifts are reconciled to NXT's real split amounts
   before publishing. Do not map a whole-gift amount as a split amount. For complex
   splits, use verified split-ID/split-amount query outputs instead. IDs are never
   inferred from names, row order, or lookup codes.
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

- Original allocation total plus local adjustments equals the campaign recognition total.
  Five priorities plus Unassigned equal that same total. Distinct gift counts in
  different priorities should not be summed because a gift may have multiple splits.
- Identical repeated gift/split rows count once. Conflicting rows for the same key
  stop publication rather than guessing or summing repeated whole-gift amounts.
- In whole-gift mode, the original total uses verified split amounts for multi-fund
  gifts, not the sum of repeated whole-gift values. Four allocations can belong to
  two NXT gifts; gift counts and allocation counts are intentionally different.
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
The allocation follow-up is deployed. Refresh the existing saved source and
verify the two real split gifts appear as four allocations totaling $153. Reconcile
the full first snapshot against NXT, using fund allocations rather than summing
repeated whole-gift output. Assign funds, then test
a reversible local-only exception on an approved allocation. None of these live steps
have been performed yet.

Possible later additions: exported reconciliation/audit reports, per-priority goals,
date-based comparison snapshots, an exceptions-only review queue, and an explicitly
scheduled refresh after runtime/capacity is measured on JU's real dataset. Multicurrency
recognition and splitting one allocation between multiple priorities need separate rules.
