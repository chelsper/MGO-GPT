# Lifetime Giving Societies: History Review

## Scope

Reporting > Dashboards > Lifetime Giving Societies uses Gift query **31118**, **Lifetime Giving - JUMGOGPT**. It is an initial history-review report, not a complete reconstruction of complex recognition histories or an official society induction register.

The first release imports a saved, searchable constituent history, checks both society thresholds, provides provisional dates only for uncomplicated direct gifts, and exports filtered results to CSV. Individual records needing reconciliation remain visible without a guessed date or partial total. No NXT gift, constituent, recognition, appeal or custom-field records are written. It does not combine households or change existing society eligibility logic.

The saved active society configurations supply thresholds and count sources. On November 16, 2026, 1934 Club uses $100,000 committed giving; Frances Bartlett Kinne Society uses $1,000,000 committed giving plus recognition credit. Do not silently change these rules to match the query's soft-credit settings. Configuration changes invalidate the displayed calculation until refreshed.

## Source Outputs

Required output paths (aliases may vary; paths must match):

- Constituent > Constituent ID. Alternatively, Constituent > System Record ID if available, preferably aliased `Constituent System Record ID`.
- Constituent > Name.
- Gift Information > System Record ID.
- Gift Information > Gift Date, Gift Amount and Gift Type.
- Gift Information > Soft Credit/Matching Gift Flag.

The actual November 16 metadata already has the required **Constituent ID**. No additional constituent system-ID output is needed for this read-only report. **Constituent Integration ID** was blank in all 51,453 returned rows; the output simply named **System Record ID** belongs to Gift Information. Neither is substituted for constituent identity.

When a constituent system-ID column is absent, the report groups by exact Constituent ID (lookup ID) within this query snapshot. Leading zeros and case are preserved. Internal keys are explicitly namespaced and are never API IDs. CSV system-ID cells remain blank; UI labels show Constituent ID. There are no per-person lookup API calls, NXT profile links, cross-report joins, or persisted annotations attached to these query-local identities. Every refresh replaces the complete snapshot, so an editable lookup ID is not used to carry identity across refreshes. A later feature needing durable cross-report identity must resolve and verify a canonical system ID separately.

Missing identifiers, conflicting names for one identity, ambiguous output paths, or a lookup ID attached to multiple available system IDs stop publication and preserve the previous snapshot. Names never join different IDs. When the system-ID output is present, it is required on every row rather than silently falling back row by row.

The one-time read-only profile returned 51,453 rows, 18,530 distinct gift system IDs and 452 distinct constituent lookup IDs. These are diagnostic counts, not validated society membership counts. Multiple funds, installments and credit rows expand the result. The query filters on Donor Recognition descriptions for Kinne and 1934, excludes deceased constituents, credits soft gifts to Both/FullAmountToAll, and credits matching gifts to Both. It is not a discovery query for donors missing recognition attributes.

## Calculation Safety

- Whole gifts are deduplicated by constituent, gift system ID and credit flag, not by name or amount. Fund/installment output expansion does not multiply gifts.
- Conflicting repeated values or direct owners put affected constituents in review; unrelated records can still proceed.
- Same-day gifts are grouped before testing threshold crossing. The report does not invent within-day ordering.
- Only recognized, uncomplicated direct gift types are calculated in this initial release. Pledges, pledge payments, matching gift transactions, write-offs, planned gifts, recurring commitments and unknown types require linked-history reconciliation before a date is shown.
- Soft-credit allocations are not inferred from a recipient name or a soft-credit record ID. Kinne histories involving soft credit are withheld. A donor's own gift is not added again for their personal soft credit.
- Missing/invalid/future dates, invalid/negative amounts, unsupported society rules and gift-level filters withhold dates. An undemonstrated threshold is not a claim of ineligibility.
- All shown dates remain **provisional calculated qualification dates**. Historical adjustments, recognition settings and household credit have not yet been reconciled. No official membership totals are claimed.

## Access, Persistence And Operations

The registered dashboard defaults to specific-user access. Admins and Advancement Services manage source checks and refreshes; explicitly authorized viewers read saved snapshots. GET does not contact NXT. POST accepts only `fields` or `refresh` for fixed query 31118, checks active roles and same-origin requests, and redacts unexpected provider errors.

Refresh uses the existing shared reporting account and quota-aware transport. Complete CSV results are bounded to 32 MiB / 250,000 source rows / 10,000 constituents / 150,000 credit-gift keys; truncation is never accepted. The query job count must equal parsed rows. Query definitions and society rules are checked before and after execution. Failures leave the last snapshot unchanged. Publication uses revision compare-and-swap in existing `report_snapshots_cache` under `report:lifetime-giving-societies:v1`; no migration is required. Internal actor IDs are not returned.

Tests are part of the offline workflow gate: identity path validation, deduplication, threshold/day boundaries, conservative withholding, access control, row completeness, definition/rule races, stale revisions, source errors and viewer UI behavior. Fixtures are fictional.

## Next Calculation Stage

Validate the imported roster and review categories using the existing query outputs. Then add linked pledge/payment identities, dated write-off/adjustment events and verified recipient-level credit allocation. Reconcile historical cumulative amounts to NXT recognition totals before graduating provisional dates. Current pledge balance and installment due dates alone cannot establish historical milestone dates. Household treatment requires a separate verified relationship history and an explicit rule, not current spouse-name matching.

Primary references: [Blackbaud constituent giving](https://webfiles-sc1.blackbaud.com/files/support/helpfiles/rex/content/en-ca/content/bb-constit-giving.html), [soft-credit query options](https://blackbaud.my.salesforce-sites.com/bbknowledge/articles/Article/47146), [donor analysis settings](https://webfiles-sc1.blackbaud.com/files/support/helpfiles/rex/content/en-gb/content/bb-donor-analysis-settings.html).
