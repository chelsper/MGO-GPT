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
  uses one slot; each tracker fund verification, gift page, or donor-name batch
  uses one slot.
  Gift pages contain at most 500 records; complete passes are capped at 20,000
  records and 100 pages. No automatic per-request retries are introduced.
- Continuations must preserve fund and date filters and the trusted API host.
  Duplicated gifts, changed counts, incomplete pagination, malformed money, or
  split totals that do not reconcile with the gift amount reject the pass.
- In-progress totals and donor rows stay server-side. The last complete snapshot
  remains visible until every gift page and donor-name batch has been processed.
  Transient failures keep the last verified page or name batch;
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
[Blackbaud Fundraising connector](https://learn.microsoft.com/en-us/connectors/blackbaudfundraising/#list-funds),
[Blackbaud constituent list](https://learn.microsoft.com/en-us/connectors/blackbaudraisersedge/#list-constituents).

## Donor Breakdown

The A-Train Campaign and other fundraising trackers include a **Campaign donors**
table beneath their totals. Search names or constituent system IDs, sort by name
or amount, and page through 25 entries at a time. Searching, sorting and paging
use saved data only. The table footer always shows all campaign giving, not just
the visible page or search results. The table includes all three columns even
when the summary cards are configured to show only one revenue view.

- **Pledged:** selected-fund allocations on Pledge and MatchingGiftPledge records.
  This is original gross pledging, not unpaid balance; write-offs are not netted.
- **Received:** selected-fund outright gifts and actual payments, using the same
  recorded-value basis as the summary card.
- **Committed:** selected-fund outright gifts plus pledges. Payments against those
  pledges do not count a second time. The columns overlap; do not add them.

Rows aggregate by the gift's hard-credit constituent system ID, not name or
household. Different constituents sharing a name stay separate. Payments credited
to a different constituent remain on that constituent; no household or matching
donor attribution is inferred. Date filters apply to each gift's date, so subtracting
received from pledged/committed does not establish an outstanding pledge balance.

Names are resolved only for donors found in the selected gifts, through explicit
ID-filtered constituent requests of at most 50 IDs per call. Include inactive and
deceased records for historical identity, without changing gift eligibility.
Only the display name and system ID are retained, not contact details. Gift-level
anonymous giving never triggers a name request; constituent-level anonymity is
also respected. Anonymous amounts are consolidated without IDs in **Anonymous
giving**. Missing or inaccessible identities are consolidated in **Donor
unavailable**, with an explanatory notice; their amounts still count.

Throttled/transient name reads retain the checkpoint without an immediate retry.
A permanent or malformed name response stops name reads for that pass, retains
verified names from earlier batches, and publishes all unresolved giving without
identities. A fresh refresh can retry. An invalid gift collection still rejects
the pass and retains the entire last-good snapshot. Each public donor table must
reconcile exactly to all three totals before it is shown. Permissions remain
those of the shared dashboard: selected viewers and manager-only preview/refresh.

No migration or source reconfiguration is needed. On release, existing saved
totals remain visible, with a prompt to refresh for donor details. Complete one
**Refresh data** cycle (using **Continue refresh** when offered), or allow the
configured scheduled refresh to complete. Pre-donor partial checkpoints restart
safely. Loading this feature does not read or change live NXT records by itself.

Automated coverage includes schema validation, fund permissions, bounded reads,
split accounting, source invalidation, partial failure/recovery, mixed query and
tracker continuation, safe layout transfer, and component behavior. Desktop and
390px mobile rendering were checked using sample amounts. Live NXT totals and the
production A-Train fund binding still require the first configured refresh after
deployment; no production records or settings were changed during implementation.

## JU Donor Table Release - 2026-10-13

- Source: `9b24cbd3669ca35ce9b6fc6cc38ff6a733b2f625`.
- Production: `https://www.jumgogpt.app`, deployment
  `dpl_5tVz8mDnE9UKH5dLznKwvw5UB5pg`.
- Rollback: `dpl_6HsA3JoYNpFCL1GiM9AvSivkN9yg`, source
  `cef4059db7aff1a47632225b48696a2b4fd2ed5c`.
- Deployed an isolated Git archive to JU only, built without assigning domains,
  smoke-tested the candidate, then promoted it. No Git push, migration,
  environment edit, authenticated report refresh, or NXT mutation was performed.
- The implementation's full suite passed 6,671 tests with 193 existing opt-in
  skips. The release rerun passed all 82 focused tests, typecheck, release checks,
  and the hosted build. Desktop and mobile checks used fictional donors.
- Candidate and live checks verified page shells, 35 published assets, donor
  controls, and HTTP 401 for unauthenticated report/stewardship requests. These
  are release checks, not authenticated acceptance of live A-Train donor totals.
- The strict production-version check passed, including routing a synthetic
  previous-release cookie to this release. JU project settings and all five cron
  schedules were unchanged. The conference sandbox stayed at
  `dpl_GZ5Xb6o8Fo7NkhqkrkRXBFhZNSMW`.
- The account-wide unchanged-project check flagged a separate concurrent `prj`
  deployment, `dpl_12d7BEANnDifvXXe1BJMa7o2ghj9`. Read-only inspection identified
  repository `PRJ`, branch `main`, commit
  `0af3992e9c94039c4e5b5e066d2391ad456731c6`, not this JU release. This task did
  not target or alter that project. The original strict check failure is retained;
  separate JU-settings and sandbox comparisons passed.

After release, open A-Train and complete **Refresh data**, followed by
**Continue refresh** when offered. Existing totals remain visible until the donor
snapshot is complete. This first authenticated refresh remains the live-data
acceptance step.
