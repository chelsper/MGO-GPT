# Top Prospect Opportunity Refresh

Prepared September 23, 2026. Implemented locally; not a production deployment.

## Root Cause

The previous prospect-detail GET performed an incomplete enrichment step. It
selected NXT-linked opportunities only when ask/expected/closed fields were null,
then updated dates and funding fields without updating name, stage, or ask amount.
Fully populated closed records could be skipped indefinitely. The overnight
portfolio summary reads local proposal data; it is not a full inbound opportunity
sync. This code gap can leave direct NXT edits missing from Top Prospects.

Kaye Glover / Ann Gibbs was the reported example. The exact changed field and
live NXT value have not been independently verified in this investigation.

## Targeted Correction

- Prospect-detail GET now reads saved app data without waiting for NXT.
- Opening a prospect with linked opportunities starts a separate authenticated
  POST to `/api/prospects/:id/opportunities/refresh`. Its external calls are GETs
  only. It cannot create/update NXT records or change fundraiser assignments.
- Only existing opportunity IDs belonging to this workspace/prospect are checked.
  Both returned opportunity ID and constituent ID must match before saving.
- Validated name, purpose, stage, ask amount, ask/expected dates, funded amount,
  and funded date update the local mirror. Zero remains zero; omitted optional
  fields retain saved values, and explicit null dates/amounts can clear them.
- Local notes, gift links, joint ownership, rankings, and follow-ups are retained.
  Derived prospect totals are reconciled without bumping donor activity dates or
  unarchiving a prospect. Funded, withdrawn, declined, and inactive opportunities
  no longer contribute to the active opportunity pipeline.
- A small Check NXT updates control allows an explicit retry. Cached details stay
  visible on provider failures; a partial check is not labeled fully current.

## Load And Race Controls

Successful checks have a five-minute TTL; explicit checks have a 30-second floor.
Checks are sequential, stop after eight reads or a 16-second scheduling budget,
and each NXT request has an eight-second timeout with no inline retries. Existing
subscription-wide cooldown handling remains in force. A provider rate limit
stops the pass and records a retry delay.

Two additive nullable columns, `nxt_checked_at` and `nxt_retry_after`, track
verification and a 60-second claim/cooldown. Database compare-and-set guards use
the original local revision, verification timestamp, and claim to prevent a
stale response from overwriting a concurrent saved edit. Recent app writes have
a ten-minute grace period, even for explicit checks. No remote or local failure
deletes an opportunity or assumes that a missing record is closed.

Blackbaud documents approximately ten-minute status latency in its
[opportunity API connector documentation](https://learn.microsoft.com/en-us/connectors/blackbaudprospects/#get-an-opportunity).
The UI therefore does not promise instant propagation of NXT stage changes.

## Scope And Verification

This is an opened-prospect refresh, not a webhook or portfolio-wide background
synchronizer. It does not discover newly created NXT opportunities or repair
missing links by matching names. A separate bounded inbound opportunity worker
would be the follow-up for unopened Top Prospects and new-opportunity discovery;
do not attach a full portfolio scan to page loading.

Unit/component/route tests cover mapping, zero/cleared/missing values, bad identity,
ownership, actor connection selection, rate limits, deferred checks, request
limits, draft controls, and late UI responses. An opt-in disposable PostgreSQL
test covers real compare-and-set SQL, overlapping refreshes, aggregate updates,
and preservation of archives/last-good values. It requires
`OPPORTUNITY_TEST_PG_SOCKET=/tmp/opportunity-refresh-pg.<suffix>`, port 55441, and
never reads `DATABASE_URL`. No live donor or NXT data is used in those tests.

Before release, apply the production deployment checklist, including separate
JU/sandbox deployment-trigger checks. After an authorized JU deployment, open
the reported prospect and compare the exact changed field with NXT. Do not claim
that live acceptance is complete based on mocked API tests.

Local validation: full suite 3,738 passed, nine opt-in integration tests skipped
by default; the four new opportunity integration tests passed separately against
the disposable PostgreSQL cluster, which was then stopped. Type check, production
build, and diff whitespace checks passed. No deployment or production data edit
was performed. Existing unrelated documentation changes were preserved.
