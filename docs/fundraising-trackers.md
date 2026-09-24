# Fundraising Trackers

Shared fundraising trackers live in Reports > My Dashboards. Manage them in
Setup > Report Access & Configurations. No database migration is required;
configuration and snapshots use the existing dashboard tables and permissions.

## A-Train Setup

1. Choose **Set up A-Train Campaign**. This opens a local, unsaved draft named
   **The A-Train Campaign**, goal **$250,000**, milestone **$187,500 (75%)**,
   both revenue views, and all-time giving.
2. Choose **Load NXT funds**, then select the exact **A-Train Campaign** fund.
   Load more directory pages if necessary. Selection stores the fund's system
   record ID, not just its display name. No production ID is hardcoded.
3. Create the disabled report, select its viewers (including any administrator
   who should view it), and enable it. Open the report and choose Refresh data.
   Continue refresh if another bounded batch is needed. Review the first totals
   against an NXT report before presenting them.

Other campaigns can use Add report > Fundraising tracker, or Add fundraising
tracker inside an existing custom dashboard. Each panel has a configurable name,
goal, optional milestone, up to 25 funds, optional inclusive giving-date range,
and committed / received / both display. All-time applies no giving-date filter.
Trackers are shared dashboard panels, not yet individual Metric Library entries.

## Revenue Basis

This first version uses recorded gift amounts in USD, aggregated from the
selected fund splits only. A gift allocated across several selected funds is
counted once for the sum of those splits. Soft-credit recipients do not multiply
revenue. Unknown values are not displayed as zero.

- Both: Donation, Stock, SoldStock, Other, GiftInKind, RecurringGiftPayment,
  RealizedPlannedGiftRevenue.
- Committed only: Pledge, MatchingGiftPledge.
- Received only: PledgePayment, MatchingGiftPayment.
- Excluded: unrealized PlannedGift, RecurringGift schedules, WriteOff,
  PledgeWriteOff, MatchingGiftWriteOff.

Committed is a gross commitment total, not a net pledge balance. Write-offs are
not deducted. Non-cash gifts use their recorded value, not sale proceeds or net
cash. The two displayed totals overlap and must not be added together. Unsupported
gift types stop a refresh rather than silently undercounting. Revenue definitions
are available in the campaign's expandable explanation.

## Read and Refresh Boundaries

- Opening dashboards, configuration and previews reads saved values only.
- Dashboards containing campaigns can be refreshed by report managers only;
  other selected viewers read the shared snapshot. Managers must have the
  appropriate NXT access to all gifts for the selected funds.
- Loading the fund picker performs one explicit, manager-only request of at most
  500 funds. It never scans gifts or changes NXT records.
- A campaign refresh verifies selected fund IDs before listing gifts filtered to
  those IDs. No funds selected means no gift request and no implied zero.
- A request shares the existing two-source refresh budget: each query execution
  uses one slot; each tracker fund verification or gift page uses one slot.
  Gift pages contain at most 500 records; complete passes are capped at 20,000
  records and 100 pages. No automatic per-request retries are introduced.
- Continuations must preserve fund and date filters and the trusted API host.
  Duplicated gifts, changed counts, incomplete pagination, malformed money, or
  split totals that do not reconcile with the gift amount reject the pass.
- In-progress totals stay server-side. The last complete totals remain visible
  until every page is verified. Transient failures keep the last verified page;
  validation failures discard the partial pass. Checkpoints expire after 24 hours
  and are restarted when a different refresh user takes over.
- Fund/date edits invalidate old totals; display, goal, milestone and label edits
  reuse them. Existing compare-and-swap and configuration-revision checks protect
  concurrent saves. Clients never receive continuation URLs or gift-ID checkpoints.
- Existing scheduled dashboard refreshes apply to enabled dashboards with
  selected viewers. Viewing a dashboard does not start or poll a refresh.
- Layout-only export omits fund IDs, goals, milestones, dates and saved amounts.
  Imported layouts start disabled and unconnected for sandbox isolation.

API contracts reviewed:
[Blackbaud Gifts connector](https://learn.microsoft.com/en-us/connectors/blackbaudgifts/#list-gifts),
[Blackbaud Fundraising connector](https://learn.microsoft.com/en-us/connectors/blackbaudfundraising/#list-funds).

Automated coverage includes schema validation, fund permissions, bounded reads,
split accounting, source invalidation, partial failure/recovery, mixed query and
tracker continuation, safe layout transfer, and component behavior. Desktop and
390px mobile rendering were checked using sample amounts. Live NXT totals and the
production A-Train fund binding still require the first configured refresh after
deployment; no production records or settings were changed during implementation.
