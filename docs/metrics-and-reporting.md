# Metrics And Reporting Contracts

Reviewed September 17, 2026 against the application baseline in
[Developer Handoff](../DEVELOPER_HANDOFF.md). These describe current calculations,
not new accounting policy. Changes need product-owner approval and regression tests.

## Fiscal And Comparison Windows

Team Standings uses July 1 through June 30 and America/New_York calendar dates.
FY27 is July 1, 2026 through June 30, 2027; FY26 is July 1, 2025 through June 30,
2026. These are currently implemented rules, not universally wired organization
settings.

The main comparison is current FY to date against the same calendar cutoff one
year earlier, inclusive. For September 17, 2026, compare July 1-September 17, 2026
with July 1-September 17, 2025. Leap-day cutoffs clamp to the prior February's last
day. Last completed week means the previous Monday-Sunday, not rolling seven days.

Action retrieval is constrained to the mapped solicitors and the required fiscal
year windows; the local calculator then applies each comparison period. Future
dates within the fiscal year do not automatically count in today's YTD score.

Source: [standingsPeriods.js](../apps/web/src/utils/standingsPeriods.js).

## Team Standings

| Metric | Implemented meaning |
| --- | --- |
| FY raised / FY raised YTD | Sum of qualifying NXT gift amounts dated in the selected period and explicitly credited to the mapped fundraiser; includes qualifying commitments, not cash only |
| Lifetime solicitor credit | Separate all-time fundraiser-credit calculation; not donor lifetime giving and not interchangeable with FY raised |
| NXT actions | Distinct NXT actions attributed to the mapped fundraiser and dated in the period; not limited to actions entered through this app |
| High-value actions | Category equals Meeting OR Type equals Solicitation, case-insensitive; an action meeting both conditions counts once per credited MGO |
| Active prospects | Local Top Prospect records whose status is Active; not all assigned NXT portfolio constituents |
| Open pipeline | Sum of local Active opportunity estimated amounts for the workspace; not restricted to current FY |
| Next-step coverage | Rounded percentage of active local prospects with nonblank primary next-step text and no completion timestamp; a due date is not required |
| Overdue follow-ups on the standings card | Active local prospects with an incomplete, nonblank primary next step whose due date is before the SQL current date |
| Recent momentum | Local recent workflow activity, not a complete measure of all work performed in NXT |

### Attribution And Double Counting

Gift matching uses explicit fundraiser IDs, including saved mapping aliases, not
the donor's portfolio owner or a fundraiser name match. Gift system IDs are
deduplicated. For each qualifying gift, the current FY calculator credits the
full gift amount once to each matching MGO; it does not allocate the gift by an
individual solicitor's credited amount. One gift can therefore contribute to more
than one MGO's score. A sum of those scores is not unique institutional revenue.

Current FY retrieval requests Donation, Stock, SoldStock, Other,
RecurringGiftPayment, PlannedGift, Pledge, GiftInKind, and MatchingGiftPledge.
The calculator also recognizes realized planned-gift revenue, but FY retrieval
does not independently request that type. Linked planned-gift/realized-revenue
handling avoids specified double counting; preserve its tests rather than treating
all gift types alike. Pledge payments are not another new pledge commitment.
Lifetime credit has its own fulfillment/write-off handling and explicitly queries
realized planned-gift revenue.

Malformed required data or missing attribution must not be converted to a genuine
zero. Inspect [closedFyGiftTotals.js](../apps/web/src/app/api/utils/closedFyGiftTotals.js),
[lifetimeFundraiserCredit.js](../apps/web/src/app/api/utils/lifetimeFundraiserCredit.js),
and their tests before changing inclusion rules.

### High-Value Action Completion

**There is currently no completed-only filter.** Category/type, action date, and
explicit fundraiser attribution determine qualification. A planned Meeting or
Solicitation dated within the scoring period can count even when incomplete.
The newer planned-action UI avoids recording completed local activity; it does not
change this report calculation. If competition should recognize completed work
only, that is a product decision requiring a deliberate calculation change and
snapshot refresh, not merely a label change.

Sources: [highValueActions.js](../apps/web/src/utils/highValueActions.js),
[nxtActionTotals.js](../apps/web/src/app/api/utils/nxtActionTotals.js), and
[standingsActionQuery.js](../apps/web/src/app/api/utils/standingsActionQuery.js).

### Coverage, Ranking, And Comparisons

Coverage is a local planning/adoption measure. Native NXT plans, discussion items,
and every additional reminder are not automatically included in its numerator.
With no active prospects, show the no-active-prospects state, not a meaningful 0%
performance judgment. Standings overdue logic uses database `CURRENT_DATE`, while
other follow-up views explicitly use Eastern dates; test midnight boundaries.

Ranking is descending by the selected metric. Equal scores share a competition
rank, such as 1, 1, 3, with stable name/ID ordering. Unknown values remain unranked
after known values; zero remains a valid score. Comparison percentage requires a
positive prior-period baseline. Prior zero and unavailable data have distinct labels.

Sources: [standings route](../apps/web/src/app/api/reports/executive-team-standings/route.js)
and [presentation](../apps/web/src/app/reports/executive-team-standings/standingsPresentation.js).

### Snapshot Semantics

Normal report reads and sorting use the saved snapshot. Explicit refresh or a
scheduled due-time pass obtains new data. If a required refresh source fails and
a previous snapshot exists, the previous snapshot remains visible with a warning.
An initial incomplete result may contain known values and unavailable values;
absence of a warning on one card is not proof that all metrics are current.

The MGO dashboard's FY totals are projected from the same saved Team Standings
snapshot, rather than substituted local closed-opportunity totals. Old field names
such as `fundedThisFiscalYear` and route names containing `executive-team-standings`
remain for compatibility; user-facing naming is Team Standings.

Source: [teamStandingsSnapshot.js](../apps/web/src/app/api/utils/teamStandingsSnapshot.js).

## Pledge Payments

The worklist is bounded by saved NXT query **12033** and its existing criteria,
then verified against supported standard Pledge records. It is not a scan of every
historical pledge or a guarantee that all other pledge types are represented.
Discovery requires gift system IDs; a Lookup ID is not an interchangeable substitute.

| Field/view | Meaning |
| --- | --- |
| Total pledged | Verified pledge amount, not installment amount |
| Paid to date | Verified applied payment amounts through the as-of date; not simply pledged minus balance, because write-offs are not payments |
| Balance due | Verified outstanding pledge balance |
| Payments past due | Unpaid installments with due dates strictly before today |
| Currently due | Count of unpaid installments due through today, including past due; the UI separately notes how many are due today |
| Past Due tab amount | Remaining unpaid amounts due through today, inclusive |
| Upcoming tab | Unpaid installments strictly after today, sorted by next due date |
| Upcoming amount due | Remaining amount on that next due date, not all future installments combined |
| Fund description | Saved verified fund description(s) for the pledge |

One pledge can appear in both tabs. Do not add their pledged totals together.
Dates use the report's Eastern as-of date; amounts are USD. Unverified or inconsistent
data is held for review instead of silently included as zero. Partial refreshes
retain available last-good values and mark incomplete coverage.

In Top Prospects/My Portfolio, the active-pledge panel uses the latest eligible
query-12033 discovery and authorized saved verified results, with no NXT read on
expansion. Total pledged and balance sum the included active pledges once each.
The next unpaid payment can be today or later; this differs from the full report's
strictly future Upcoming tab. Overdue amount appears only when positive and relates
to dates before today. Multiple pledges use the oldest verification date for the
summary. Missing evidence does not prove that the constituent has no pledge.

Sources: [pledge feature contract](pledge-payments.md),
[worklist columns](../apps/web/src/components/PledgePaymentList.jsx),
[pledgePayments.js](../apps/web/src/utils/pledgePayments.js), and
[pledgePaymentPipeline.js](../apps/web/src/app/api/utils/pledgePaymentPipeline.js).

## Saved Dates, Exports, And Query Reports

- Last gift/action dates are saved activity evidence, not guaranteed live values.
  A missing date may mean enrichment has not completed. Do not infer no giving or
  no contact from absence, and do not introduce full-detail fetches during sorting.
- Top Prospect exports retain each selected MGO's context. The same constituent
  or opportunity can appear in multiple workspaces; exports are not deduplicated
  institutional revenue reports. Contact columns are opt-in.
- Query output comes from the configured query boundaries. Labels, number formats,
  and panel arrangement do not provide field-level access control. Review output
  and audiences before sharing; query changes can change the exposed data.

## Decisions Still Required

The product owner should explicitly approve whether high-value actions must be
completed, whether team fundraising totals should be unique-gift or per-MGO credit,
and which metrics are suitable for competition versus internal workflow adoption.
Developers should also inventory fiscal/timezone/query constants before promising
reuse at another institution. This documentation does not change those policies.
