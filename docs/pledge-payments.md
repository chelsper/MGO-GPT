# Advancement Services Pledge Payments

Entry points: Advancement Services home and navigation, under **Reports & Exports > Pledge Payments** (`/pledge-payments`). Opening the home page does not fetch pledge data or start a refresh.
Only active admin and Advancement Services users (including the legacy reviewer
role) may read or refresh `/api/pledge-payments`. Authorization uses the actual
session user, not an acting MGO. Cache and refresh leases are scoped to that user
and app origin; one user's NXT connection is not used to populate another's cache.

## Worklist definitions

- Standard NXT `Pledge` gifts returned by saved Gift query **12033**, "all pledges
  unpaid"; not recurring gifts or matching pledges. Its existing amount, date,
  status, and missed-payment criteria are intentional and remain unchanged.
  This is a query-scoped worklist, not a claim to include every unpaid pledge.
- One row per pledge, not per donor. Multiple pledges remain separate.
- Past Due includes outstanding installments with due dates **through today**.
  The overdue count is strictly before today; currently due includes today.
  The date shown is the oldest unpaid installment; the amount is all unpaid
  installment balances due through today.
- Upcoming includes outstanding installments strictly after today, sorted by
  earliest due date. Amount due is the sum of remaining installments on that
  next date, not the pledge's full future balance.
- A pledge can appear in both tabs. Do not add the tabs' pledged totals together.
- Dates use Eastern today and NXT calendar dates without shifting midnight UTC
  back to the previous day. Date classification is recalculated from cached
  schedules when the page loads, without an NXT request.
- Total pledged and balance come from the pledge gift. Paid to date is the sum
  of verified applied payment amounts whose gift dates are through today.
  It is **not** pledge amount minus balance: that would count write-offs as paid.
- Remaining installment balance, not original scheduled amount, determines dues.
  Settled (paid or written off) installments have no amount due.
- Unknown payment types, missing amounts, malformed dates, duplicate application
  keys, or inconsistent pledge/installment balances require review. No guessing,
  default-zero financial values, or partial replacement of last-good data.
- Amounts display as USD, following this organization's existing report currency.

## Refresh and safety

GET only reads local cache. Load/Refresh starts a persistent job. Discovery uses
separate checkpointed stages: validate Gift query metadata, submit one asynchronous
CSV execution, poll that job, then download its `sas_uri` and verify the manifest.
There is no all-pledges listing or fallback on a query error. Following requests perform at most six
individual retrieval/normalization steps, sequentially, with a 45-second soft
budget. Even individual payment-gift reads are checkpointed. The existing central
SKY transport handles bounded retries and subscription quota cooldowns.

Only `QRECID` selects gift system IDs. Do not substitute Gift ID (lookup ID),
Constituent ID, integration IDs, or installment IDs. Query row count must equal
the parsed CSV row count before deduplicating repeated installment rows by gift.
The September 10, 2026 diagnostic returned 394 CSV rows and 69 distinct `QRECID`
values; three sampled IDs were confirmed by Gift Get as positive-balance pledges.
The actual result MIME was `text/csv; charset=windows-1252`.

CSV downloads are bounded at 10 MB, 50,000 rows, and 64 columns. Bad encoding,
HTML/JSON/XLSX, missing IDs, ambiguous headers, malformed rows, and count mismatches
pause discovery without replacing the previous cache. SAS URLs and raw CSV are
never persisted. Only the existing SKY API host, single-account Azure Blob
hosts, and the verified Blackbaud result host `nsa-pusa01.app.blackbaud.net` are
accepted. The latter was confirmed from the authenticated job response for
query 12033 on September 10, 2026. Signed-file downloads do not receive the
Blackbaud bearer token or subscription key. Nonstandard ports, URL credentials,
fragments, lookalike domains, and redirects are rejected in this workflow.

The initial production job paused at `query_download` with
`invalid_query_result_url`: the original allowlist omitted Blackbaud's own
signed-file host, despite successful query execution. This was not a Gift API
permission failure. After the host correction, **Resume** checks the same saved
query job, obtains a fresh signed URL, and validates its manifest without
resubmitting the query. Paused discovery is labeled by stage, not `0 / 0 pledges`.

Query polls are spaced three seconds apart and stop for manual Resume after 30
pending responses. Resume polls the same query job. Submission has no automatic
POST retries: an uncertain outcome is held for explicit cancel/restart rather
than quietly executing another job. Throttling preserves stage and Retry-After.
Each selected gift is still verified as a Pledge; if it was settled after query
execution its cached row is cleared without fetching the rest of its schedule.

Each pledge retains its last-good normalized snapshot alongside a staging draft.
Successful pledges publish incrementally. Failed new pledges are excluded and
listed in review issues; failed previously loaded pledges retain visibly stale
values. During discovery prior rows remain visible; after the full manifest is
discovered, rows absent from that manifest no longer appear. Incomplete worklists
are always labeled as such. No report snapshots or production count logic change.

The browser continues batches only after an explicit Load/Refresh/Resume action.
Closing or pausing the page preserves progress. Resume does not rerun verified
items. Retry failed pledges restarts only failed pledges from fresh gift data.
Cancel preserves cache; a later explicit Refresh creates a new manifest.
There is **no new scheduled/nightly workload** in this feature.

Existing jobs from the old all-pledges source cannot resume or retry. They display
an explicit **Use query 12033** action, which starts query discovery under the same
cache scope. Old values are marked stale and retained until the new manifest is
verified; they are not presented as a complete query-scoped worklist. New query
jobs retain normal resume, cancellation, and failed-only retry behavior.

Single-writer database leases and checkpoint conditions prevent concurrent tabs
from overwriting each other's progress. Interrupted leases expire after three
minutes. No tokens, bank/payment-method data, raw donor payloads, or raw upstream
error bodies are persisted in diagnostics. The only Blackbaud POST executes the
saved query; all constituent/gift retrievals are GET-only. No NXT definitions or
donor records are changed.

## API references and deployment validation

- [Gift list and Gift Get](https://developer.sky.blackbaud.com/api#api=58bdd5edd7dcde06046081d6&operation=GetGift)
- [Gift V2 installments](https://developer.sky.blackbaud.com/api#api=gft-gifts&operation=GetInstallments)
- [Gift V2 pledge payment applications](https://developer.sky.blackbaud.com/api#api=gft-gifts&operation=GetPledgePayments)

The Gift V2 endpoints are public preview. Verify live endpoint permissions with
an Advancement Services connection after deployment. A forbidden endpoint or
unsupported response must remain a visible review issue, never a zero balance.
For first acceptance, compare an unpaid pledge, a partial payment, a write-off,
and a pledge with multiple payments to the same NXT records before relying on
the worklist for outreach. This feature sends no reminders and makes no NXT writes.
