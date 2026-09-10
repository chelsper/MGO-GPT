# Advancement Services Pledge Payments

Entry points: Advancement Services home and navigation, `/pledge-payments`.
Only active admin and Advancement Services users (including the legacy reviewer
role) may read or refresh `/api/pledge-payments`. Authorization uses the actual
session user, not an acting MGO. Cache and refresh leases are scoped to that user
and app origin; one user's NXT connection is not used to populate another's cache.

## Worklist definitions

- Standard NXT `Pledge` gifts, all years; not recurring gifts or matching pledges.
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

GET only reads local cache. Load/Refresh starts a persistent job. One request
discovers one gift-list page (200); following requests perform at most six
individual retrieval/normalization steps, sequentially, with a 45-second soft
budget. Even individual payment-gift reads are checkpointed. The existing central
SKY transport handles bounded retries and subscription quota cooldowns.

Known zero balances in the gift list skip historical settled-pledge detail reads.
Missing balances always get a detailed read. List pagination is followed only
within the filtered SKY Gift endpoint, never to an arbitrary bearer-token URL.

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

Single-writer database leases and checkpoint conditions prevent concurrent tabs
from overwriting each other's progress. Interrupted leases expire after three
minutes. No tokens, bank/payment-method data, raw donor payloads, or raw upstream
error bodies are persisted in diagnostics. NXT calls are GET-only.

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
