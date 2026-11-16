# Lifetime Giving Societies: History Review

## Scope

Reporting > Dashboards > Lifetime Giving Societies uses Gift query **31118**, **Lifetime Giving - JUMGOGPT**. It is an initial history-review report, not a complete reconstruction of complex recognition histories or an official society induction register.

The report imports a saved, searchable constituent history, checks both society thresholds, provides provisional dates for uncomplicated direct and approved full-recognition gifts, and exports filtered results to CSV. Records needing reconciliation remain visible without a guessed date or complete total; a separately labeled supported-gifts subtotal shows only the uncomplicated portion. No NXT gift, constituent, recognition, appeal or custom-field records are written. Household confirmation is report-only and does not change existing society eligibility logic elsewhere.

The saved active society configurations supply thresholds and count sources. Following the user's November 16 clarification, this report explicitly includes recognition credit for **1934 Club**, in addition to its saved committed-giving source. Frances Bartlett Kinne Society already includes both sources. Current thresholds are $100,000 and $1,000,000 respectively. The user additionally approved **Full amount to all** recognition, following query 31118 rather than recipient allocation amounts. This is a report-specific rule, not a write to shared society configuration or NXT. Other eligibility workflows are unchanged. Rule version 5 invalidates earlier calculations and company/person confirmations until a refresh; rule/configuration changes are checked during publication.

## Married Households And Credit Sources

Two individuals are grouped automatically when their query output contains reciprocal spouse IDs, both have a consistent Married marital status, and no other constituent claims either spouse. IDs must be in the same namespace: exact Constituent IDs or verified system IDs, never names or integration IDs. Pairs do not need shared gifts. Both must be present as individuals in the imported query history. Blank, invalid, one-sided, inconsistent, self, organization and competing links remain separate with review notes. Missing, divorced, separated, widowed or unknown marital status is not assumed to mean Married. Current spouse links do not establish the historical date of a marriage; the report continues to describe calculated milestone dates as provisional.

Organizations are credit sources, never household members. Combine only gifts given by or explicitly credited to the individual household members, deduplicated by gift system ID. For example, two spouses credited for one corporate gift receive that gift once as a household; other gifts from the company do not enter their household. The company remains a separate report record. A current spouse pair's combined history includes their separate personal gifts as well as shared gifts, not just the shared-gift count displayed on the card.

Exact co-credit sets of two or more remaining individuals can suggest a household for explicit Admin/Advancement Services confirmation. Companies are excluded before these suggestions are made. A+B on one gift and B+C on another never automatically create A+B+C. Individuals already in automatic households or with unresolved spouse links are not suggested for another household. Neither shared gifts nor names prove marriage. No excluded spouse, estate, foundation or other record is silently added. Server-side validation rejects organization membership and overlap with another active household.

The default view combines automatic and manually confirmed households. A local toggle restores separate individuals without changing saved grouping. Admins/Advancement Services can also keep an automatic spouse pair separate or restore it with an explicit confirmation. Household rows appear in the individuals view; companies stay in the organizations view. Search and CSV include member IDs and grouping basis without inventing an NXT household ID. Recognition totals must not be added together as organizational revenue.

Confirmation, undo and staff separation use the current revision, compare-and-swap publication and a private bounded audit trail. They do not execute NXT queries. Refresh retains manual confirmation or staff separation only when rule version, rule/source fingerprints, member identities and the relevant spouse/shared-gift evidence still match. Staff separation depends on spouse evidence, not the gift list: new gifts alone do not restore automatic grouping. Old v4 company/person groups are not carried forward. These are snapshot-scoped decisions, not a canonical crosswalk. Manual suggestions are bounded to 1,000 sets with at most 20 members each; automatic pairs are bounded by the 10,000-person import limit, not the suggestion cap. All separate histories remain available.

## Views And Filters

Prominent society buttons select Both societies, 1934 Club, or Frances Bartlett Kinne Society. Constituent type selects individuals, organizations, or their combined view. Search, review status, and calculated fiscal year further narrow the view. Counts and CSV exports use all filtered rows, not just the visible page; constituent counts deduplicate the two society rows. These controls are local and do not run NXT queries. Clear filters restores the combined view.

Constituent > **Key Indicator** supplies record type: I/Individual or O/Organization. It is matched by native field name and Constituent path, never by alias, donor name, constituency code or a spouse's type. Blank, unknown or inconsistent types remain visible in the combined view and a separate unclassified view; they are not silently treated as individuals or organizations. Missing type does not block history refresh or invalidate otherwise supportable dates. Add the optional output and refresh to classify previously untyped results. Conflicting types have an explicit review note and do not affect other donors.

The updated query criteria exclude Estate, Donor Advised Fund and Consortia constituencies. Refresh replaces the snapshot with the query's current results; the application neither restores excluded records nor adds name-based exclusions. Constituent-only exclusions do not incorrectly trigger the gift-history restriction safeguard.

Read-only validation after Key Indicator was added on November 16 returned 62,250 complete query rows, 402 distinct constituent lookup IDs, 233 individuals and 169 organizations, with no unknown types. The local parser produced 66 provisional dates and 738 threshold checks needing reconciliation. These are two threshold checks per record, not membership counts. No report snapshot was published and no donor records were changed by this validation.

## Source Outputs

Required output paths (aliases may vary; paths must match):

- Constituent > Constituent ID. Alternatively, Constituent > System Record ID if available, preferably aliased `Constituent System Record ID`.
- Constituent > Name.
- Constituent > Key Indicator (optional for import, needed for individual/organization views).
- Spouse > Spouse Information > Constituent ID and Constituent > Marital Status (optional for import, required with Key Indicator for automatic households). The actual November 16 output is named **Spouse ID** with native meaning **Constituent ID**. A direct Spouse path is also supported; unrelated nested relationship paths are not. Spouse system ID is supported only alongside constituent system IDs. Display aliases never determine ID meaning.
- Gift Information > System Record ID.
- Gift Information > Gift Date, Gift Amount and Gift Type.
- Gift Information > Soft Credit/Matching Gift Flag.

The actual November 16 metadata already has the required **Constituent ID**. No additional constituent system-ID output is needed for this read-only report. **Constituent Integration ID** was blank in all 51,453 returned rows; the output simply named **System Record ID** belongs to Gift Information. Neither is substituted for constituent identity.

When a constituent system-ID column is absent, the report groups by exact Constituent ID (lookup ID) within this query snapshot. Leading zeros and case are preserved. Internal keys are explicitly namespaced and are never API IDs. CSV system-ID cells remain blank; UI labels show Constituent ID. There are no per-person lookup API calls, NXT profile links or cross-report joins. Every refresh replaces the complete snapshot; group confirmations require unchanged source, member details and shared-gift evidence, never a lookup ID alone. A later feature needing durable cross-report identity must resolve and verify a canonical system ID separately.

Missing identifiers, conflicting names for one identity, ambiguous output paths, or a lookup ID attached to multiple available system IDs stop publication and preserve the previous snapshot. Names never join different IDs. When the system-ID output is present, it is required on every row rather than silently falling back row by row.

The one-time read-only profile returned 51,453 rows, 18,530 distinct gift system IDs and 452 distinct constituent lookup IDs. These are diagnostic counts, not validated society membership counts. Multiple funds, installments and credit rows expand the result. The query filters on Donor Recognition descriptions for Kinne and 1934, excludes deceased constituents, credits soft gifts to Both/FullAmountToAll, and credits matching gifts to Both. It is not a discovery query for donors missing recognition attributes.

## Calculation Safety

- Whole gifts are deduplicated by constituent, gift system ID and credit flag, not by name or amount. Fund/installment output expansion does not multiply gifts.
- Conflicting repeated values or direct owners put affected constituents in review; unrelated records can still proceed.
- Same-day gifts are grouped before testing threshold crossing. The report does not invent within-day ordering.
- Recognized, uncomplicated direct and full-recognition gift types are calculated. Pledges, pledge payments, matching gift transactions, write-offs, planned gifts, recurring commitments and unknown types require linked-history reconciliation before a date is shown.
- Full recognition is calculated only when query metadata explicitly says Both/Recipient and FullAmountToAll, and the row has a supported soft-credit flag. Other settings still require recipient allocation verification. Recipient names and soft-credit record IDs are not used to infer allocation. A donor's own gift is not added again for their personal soft credit. Conflicting full-gift values across recipients withhold affected histories and group suggestions.
- A supported-gifts subtotal is not a complete lifetime amount or proof of the milestone date. Conflicting gift values suppress even that subtotal. Complex histories continue to withhold complete totals and dates, rather than double-counting a pledge and its payments.
- Missing/invalid/future dates, invalid/negative amounts, unsupported society rules and gift-level filters withhold dates. An undemonstrated threshold is not a claim of ineligibility.
- All shown dates remain **provisional calculated qualification dates**. Historical adjustments, recognition settings and household credit have not yet been reconciled. No official membership totals are claimed.

## Access, Persistence And Operations

The registered dashboard defaults to specific-user access. Admins and Advancement Services manage source checks, refreshes and group confirmation/undo; explicitly authorized viewers read saved snapshots. GET does not contact NXT. POST accepts only `fields`, `refresh`, `confirm-group` or `remove-group` for fixed query 31118, checks active roles and same-origin requests, and redacts unexpected provider errors. Group actions accept only an existing evidence hash and current revision, not arbitrary members or client-supplied totals. Refresh validates source readiness itself; a separate metadata check is optional rather than a required first step.

Refresh uses the existing shared reporting account and quota-aware transport. Complete CSV results are bounded to 32 MiB / 250,000 source rows / 10,000 constituents / 150,000 credit-gift keys; truncation is never accepted. The query job count must equal parsed rows. Query definitions and society rules are checked before and after execution. Failures leave the last snapshot unchanged. Publication uses revision compare-and-swap in existing `report_snapshots_cache` under `report:lifetime-giving-societies:v1`; no migration is required. Internal actor IDs are not returned.

Tests are part of the offline workflow gate: identity path validation, deduplication, threshold/day boundaries, conservative withholding, access control, row completeness, definition/rule races, stale revisions, source errors and viewer UI behavior. Fixtures are fictional.

## Next Calculation Stage

Add linked pledge/payment identities and dated write-off/adjustment events. Reconcile historical cumulative amounts before graduating provisional dates. Current pledge balance and installment due dates alone cannot establish historical milestone dates. Full-gift recognition removes allocation uncertainty for this report, but it does not resolve complex gift histories or prove marriage. Only reciprocal spouse IDs with Married statuses permit automatic household grouping; other eligible individual-only suggestions require explicit confirmation.

Primary references: [Blackbaud constituent giving](https://webfiles-sc1.blackbaud.com/files/support/helpfiles/rex/content/en-ca/content/bb-constit-giving.html), [soft-credit query options](https://blackbaud.my.salesforce-sites.com/bbknowledge/articles/Article/47146), [donor analysis settings](https://webfiles-sc1.blackbaud.com/files/support/helpfiles/rex/content/en-gb/content/bb-donor-analysis-settings.html).
