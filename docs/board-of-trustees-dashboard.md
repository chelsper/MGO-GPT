# Board of Trustees Dashboard

## User Workflow

Open Reports > My Dashboards > Board of Trustees. Admins can see the new built-in dashboard; select additional viewers in Report configurations. Admins and Advancement Services can manage sources and refresh results. Other authorized viewers are read-only.

FY17 through FY27 are preconfigured with the user's queries and field mappings. Select a fiscal year, then **Refresh FYxx** to save its trustee names and giving summaries. All eleven years are available before their first refresh; an unrefreshed year is never shown as zero. Viewing the dashboard, searching, sorting, paging, or changing fiscal year only reads saved results; it does not execute NXT queries. Existing saved sources take precedence over defaults and are never silently replaced.

| Fiscal year | Query system record ID | Query name |
| --- | --- | --- |
| FY27 | 31092 | FY27 BoT Giving - MGOGPT |
| FY26 | 31093 | FY26 BoT Giving - MGOGPT |
| FY25 | 31094 | FY25 BoT Giving - MGOGPT |
| FY24 | 31095 | FY24 BoT Giving - MGOGPT |
| FY23 | 31096 | FY23 BoT Giving - MGOGPT |
| FY22 | 31097 | FY22 BoT Giving - MGOGPT |
| FY21 | 31098 | FY21 BoT Giving - MGOGPT |
| FY20 | 31099 | FY20 BoT Giving - MGOGPT |
| FY19 | 31100 | FY19 BoT Giving - MGOGPT |
| FY18 | 31101 | FY18 BoT Giving - MGOGPT |
| FY17 | 31102 | FY17 BoT Giving - MGOGPT |

The dashboard shows participation through cash, pledges or planned gifts, cash giving credit, and separate pledge/planned-gift credit for eligible trustees. A prominent searchable table lists eligible trustees by name, constituent ID, both amounts, and participation status. Eligibility details list excluded and unresolved people with the original Trustee service dates and a reason. Cash and commitments are deliberately not added together: pledge payments can overlap with the pledge commitments. Eligible zero-giving trustees remain in the denominator. A blank amount is displayed as "Not reported" and the affected aggregate is withheld instead of implying zero.

The top bar chart shows annual trustee participation in chronological order on a fixed 0-100% scale. Each year displays both its percentage and participant count out of that year's eligible roster. Cash, pledges or planned gifts establish participation; each eligible person counts once even when they have both. The chart reuses the same `boardParticipation` calculation as the main card and comparison table, not aggregate dollars. Selecting a year updates the fiscal-year selector and trustee roster, clears its search and resets pagination without contacting NXT. Searching the roster does not change the chart. Year navigation is disabled during source setup or a refresh. Missing results, older eligibility rules, unresolved eligibility, incomplete participation and empty rosters are labeled instead of plotted as zero. A complete roster with no participants shows a true 0%. YTD and pre-FY coverage use each saved snapshot's refresh date; they are not comparable to a completed full year. Percentages and counts are visible and available through accessible names and hover titles. On narrow screens, the chart scrolls within its card. Dollar totals remain in the existing cards and trustee table below.

Participation counts eligible trustees with a positive annual cash summary OR a positive annual pledge/planned-gift summary, following the user's October 30 update. Each person counts once even when both are positive. A positive amount in either summary establishes participation even when the other is missing or negative; the summaries are not netted against each other. When neither is positive and either amount is unreported, the person's participation is unknown and the rate is withheld. Two reported zero or negative amounts do not qualify. The denominator is all distinct eligible constituent IDs for the fiscal year. Unresolved membership withholds both aggregate giving totals and participation, while confirmed eligible names remain visible. Empty and unrefreshed rosters have no rate, rather than 0%. Searching, sorting, and paging never change participation or totals.

Year-over-year change is the difference between adjacent fiscal years' unrounded participation rates, displayed in percentage points. Every year uses the same cash-or-commitment participation rule and keeps its own denominator. Missing or incomplete adjacent years show an unavailable comparison, not a substitution from a different year. Coverage is labeled from the snapshot refresh date in Eastern time: a year-to-date snapshot is not an equal-period comparison to a completed fiscal year. Do not average annual percentages into a multi-year "overall" rate; the main card is overall participation for the selected fiscal year.

To change a mapping or add a year outside FY17-FY27, open **Manage fiscal years**, enter the four-digit fiscal-year end and that year's query ID, then load fields. Output aliases suggest the name, cash, pledge/planned-gift, constituency code and service date fields. Save and refresh validates the entire result before publishing that year. Cancel returns to the same displayed year without saving. The participation comparison shows saved years and all eleven preset years, with missing results explicitly identified. Snapshots from an older service-date rule must be refreshed; old figures are never presented as eligible figures or compared with newly filtered years.

## Service Eligibility

The user's clarified rule is **six or more months**, not strictly more than six. Use only the original **Trustee** code's Date From and Date To. Trustee-Former dates are not board-service dates.

- Known Trustee service dates must overlap the selected fiscal year for at least six calendar months. This includes open terms and terms ending after that fiscal year: a blank Date To is no longer a blanket exemption for a known start date. Barry A. Gleichenhaus's May 1, 2023 start excludes him from FY23 (and FY22), but an ongoing term qualifies in FY24. Eligibility filters the names, giving totals, and participation numerator and denominator together; no per-person override is used.
- A Trustee Date From after the selected fiscal year's June 30 is excluded. A Trustee Date To before July 1 is excluded. Otherwise, clip the start to July 1 and the end to June 30 (including open terms), include the final service day, and compare to the six-month anniversary. January 1 through June 30 qualifies; January 2 through June 30 does not. July 1 through December 31 qualifies; July 2 through December 31 does not. Fiscal-year boundaries, not today's date, determine the comparison.
- Preserve the prior explicit exception when no Trustee Date From is recorded and the term has a blank Date To or a Date To conclusively after the FY. This does not exempt a known late start. A simultaneous Trustee-Former code is disclosed but does not override qualifying Trustee service. A future or short open term does not prevent a separate earlier term from qualifying on its own service dates.
- Year-only and month-only dates are ranges. Use them only when every possible date supports the same decision. An old end year such as 2008 is safely excluded; a December end month at the six-month cutoff needs review. A January start month also needs review for an open term because January 1 qualifies but later January dates do not; a February start month is conclusively too late. For terms ending within the FY, missing start dates are not silently assumed to precede July 1.
- Repeated constituency rows never multiply money or participation. Merge overlapping/adjacent exact service periods. Conflicting current-period dates or nonconsecutive short terms that could add up to six months require review rather than guessed eligibility.
- A person with only Trustee-Former and no original Trustee code is excluded with that reason visible. Do not invent their original service dates.

## Source Contract

- One executable Constituent query per fiscal year, without prompted criteria. Include Trustee or Trustee-Former candidates without a blank-end-date requirement or former-trustee exclusion. The app uses Trustee service dates to select the eligible roster.
- Output constituent Name and two Total Amount of Gifts summaries with distinct aliases. FY27 aliases are `Total Gifts FY27 (Cash)` and `Total Pledges or Planned Gifts FY27`.
- Also output Constituency Code, Constituency Date From and Constituency Date To from the same constituency group. Metadata verifies the mapped field types and group path. The app cannot apply the rule from unrelated dates or from a query that already removed eligible people.
- Each mapped summary must have a Gift Date Between July 1 of the prior year and June 30 of the fiscal-year end. Unsupported or broadening OR filters are rejected rather than treated as a verified annual summary.
- The completed result supplies `QRECID` as constituent identity. Names are never used as identity. Consolidate multiple code/date rows per person, preserving distinct service terms; conflicting financial summaries or names still stop the refresh. Same-name people with different IDs remain separate.
- Limits: 30 years, 2,000 unique trustees per year, 10,000 raw rows, 24 configured output columns plus QRECID, 4 MiB CSV. Limits reject results; nothing is silently truncated. The UI pages 50 rows at a time without changing aggregate totals.

### Source Verification

October 30, 2026: all eleven query definitions passed read-only metadata checks. Each has the expected fiscal-year-specific cash/commitment aliases, July 1-June 30 giving filters, and constituency code/start/end fields from the same group. FY26 now has the updated service outputs; the October 29 setup limitation below is resolved. No NXT query definition was edited. Query execution checks do not publish production snapshots.

All eleven completed query results were then checked against the earlier v2 start-date rule. Each returned 408 source rows; every year passed duplicate/identity, amount and service validation, with zero unresolved eligibility decisions and zero missing amounts. FY17 had 31 eligible trustees / 26 cash participants under the previous cash-only participation rule; FY27 had 31 / 9. These are historical verification observations, not published snapshots or counts under the expanded participation and v3 six-month rules. The multi-year release gate passed 1,685 tests across 77 files with none skipped, plus route types, TypeScript, the production build and unchanged-source verification. The multi-year v2 change was deployed October 30; the later v3 rule requires another refresh per year after deployment.

### Historical FY27 Findings (Read-Only Check, October 29, 2026)

The user updated query 31092 to include Trustee or Trustee-Former and all three constituency outputs. It returned 408 rows for 210 people. Offline validation of that read-only result under the new rule found 31 included, 179 excluded and zero unresolved service decisions. Nine of the 31 eligible trustees have positive FY27 cash giving (29.0%). Six included people also have Trustee-Former but retain a blank Trustee end date; they are included exactly as requested. Exclusions were service ending before FY27 or no original Trustee code returned. No production snapshot was published.

At that time FY26 query 31093 had only the name and two giving summary outputs, with blank-Date-To and former-trustee-exclusion criteria. The user has since updated it and it passed the October 30 metadata checks above. Its old query-only results must not be compared with filtered results. FY26 aliases are `Total Gifts FY26 (Cash)` and `Total Pledges or Planned Gifts FY26`, covering July 1, 2025 through June 30, 2026.

No NXT query criteria were changed by the app. Keep non-givers in every query; donor-only criteria would inflate participation. Preserve original Trustee service history rather than replacing it with dates describing former status.

The cash column also includes stock/property and other query-selected received gift types. It is the query-defined cash giving credit, not independently reconciled bank cash. Summing constituent-level soft/matching credit may count an underlying gift on multiple trustees' records. The dashboard labels these as giving-credit totals, displays query credit settings, and does not claim unduplicated institutional revenue.

## Developer Notes

- UI: `apps/web/src/app/reports/dashboards/board-of-trustees/page.jsx`.
- Annual participation chart: `TrusteeParticipationChart.jsx` beside the page, with a mandatory workflow suite covering chronological order, fixed percentage scaling, per-year denominators, cash-or-commitment participation without double counting, missing and stale snapshots, genuine zero participation, coverage labels and navigation locks. It uses the saved eligible roster and shared participation helper; no new query, endpoint or database schema is required.
- Authenticated API: `apps/web/src/app/api/reports/board-of-trustees/route.js` (GET saved state; POST fields or refresh).
- Adapter: `apps/web/src/app/api/utils/boardTrustees.js`. Client-safe contracts: `apps/web/src/utils/boardTrustees.js`.
- Service evaluation: `apps/web/src/app/api/utils/boardTrusteeEligibility.js`; covered by a mandatory date-boundary/fuzzy-date/term-consolidation suite. Snapshots carry rule `trustee-service-six-months-v3` and included/excluded/unresolved counts plus decision audit rows. The v3 rule applies the six-month overlap to known starts even with open or future-ending terms. Both v1 and v2 snapshots must be refreshed and are withheld from totals and comparisons. Adjacent exact terms can establish continuous qualifying service even when the final term is open; duplicated/overlapping periods are not counted twice. Legacy three-field mappings are upgraded during refresh only when the required output metadata exists; missing fields fail before query execution.
- Registry key: `board-of-trustees`, schema `board-of-trustees-v1`, default visibility `specific_users`. Shared report navigation and the dashboard switcher include it.
- Storage uses existing `report_snapshots_cache`, key `report:board-of-trustees:v1`; no schema migration. One revision covers all saved years. Optimistic compare-and-swap publishing prevents concurrent updates from dropping another year's changes. Source settings and complete results are saved together. Failed refreshes leave the prior snapshot untouched.
- Inspect source metadata before and after execution. Fingerprint membership, summary filters, output configuration and giving-credit settings; reject definition changes during a refresh. Keep each year's saved definition fingerprint and refresh actor for provenance.
- Reuse the shared reporting account, existing Blackbaud quota/token handling and bounded saved-query execution. No gift, constituent, custom-field or query-definition writes. Query execution creates only the provider's read job; normal token renewal may update app connection credentials.
- GET and POST use private, no-store responses. Unauthenticated/inactive/unshared readers are denied; non-manager writes and cross-origin commands are denied. Unexpected database/provider errors are sanitized. Permission-loss responses clear visible donor data.
- Unit, API and UI suites are part of the mandatory workflow gate. Live validation is separate and does not publish production snapshots. Fictional query metadata is in `apps/web/test/boardQueryFixture.js`.
- Participation is derived from the validated, deduplicated saved roster, not independently cached. `boardParticipationStatus` shares the cash-or-commitment rule between counts and roster badges. The participation expansion itself needs no new source fields or database migration, but the subsequent six-month eligibility correction requires refreshing older snapshots under v3. All FY17-FY27 defaults and pure participation/coverage functions have a separate mandatory unit suite at `apps/web/src/utils/boardTrustees.test.js`. Parameterized adapter and UI tests verify every year's identity, aliases, annual filters and refresh request; tests also preserve saved overrides and other years' snapshots.

## Next Inputs

After deployment, refresh each desired year under the v3 eligibility rule, including previously refreshed v2 years. No remapping is needed for the verified default queries. Pledges and planned gifts remain included in participation for the newly eligible roster. Future additions could include exports, a paced multi-year refresh, and like-for-like year-to-date comparisons; the present annual-summary queries do not support a historical same-date cutoff.
