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

The dashboard shows cash participation, cash giving credit, and separate pledge/planned-gift credit for eligible trustees. A prominent searchable table lists eligible trustees by name, constituent ID, both amounts, and participation status. Eligibility details list excluded and unresolved people with the original Trustee service dates and a reason. Cash and commitments are deliberately not added together: pledge payments can overlap with the pledge commitments. Eligible zero-giving trustees remain in the denominator. A blank amount is displayed as "Not reported" and the affected aggregate is withheld instead of implying zero.

Participation counts only eligible trustees with a positive annual cash giving summary, as requested. Pledges or planned gifts alone do not qualify; zero or negative net cash does not qualify. The denominator is all distinct eligible constituent IDs for the fiscal year. Missing cash withholds the rate, but missing commitments do not. Unresolved membership withholds both aggregate giving totals and participation, while confirmed eligible names remain visible. Empty and unrefreshed rosters have no rate, rather than 0%. Searching, sorting, and paging never change participation or totals.

Year-over-year change is the difference between adjacent fiscal years' unrounded participation rates, displayed in percentage points. Each year keeps its own denominator. Missing or incomplete adjacent years show an unavailable comparison, not a substitution from a different year. Coverage is labeled from the snapshot refresh date in Eastern time: a year-to-date snapshot is not an equal-period comparison to a completed fiscal year. Do not average annual percentages into a multi-year "overall" rate; the main card is overall participation for the selected fiscal year.

To change a mapping or add a year outside FY17-FY27, open **Manage fiscal years**, enter the four-digit fiscal-year end and that year's query ID, then load fields. Output aliases suggest the name, cash, pledge/planned-gift, constituency code and service date fields. Save and refresh validates the entire result before publishing that year. Cancel returns to the same displayed year without saving. The participation comparison shows saved years and all eleven preset years, with missing results explicitly identified. Snapshots from an older service-date rule must be refreshed; old figures are never presented as eligible figures or compared with newly filtered years.

## Service Eligibility

The user's clarified rule is **six or more months**, not strictly more than six. Use only the original **Trustee** code's Date From and Date To. Trustee-Former dates are not board-service dates.

- A Trustee Date From after the selected fiscal year's June 30 is excluded, even with a blank Date To. June 30 starts are within the year; July 1 starts are not. An open term with a fuzzy start date spanning the fiscal-year end requires review, rather than assuming the trustee had already joined.
- Otherwise, a blank Trustee Date To is included without a six-month waiting period, even if Date From is missing. A simultaneous Trustee-Former code is disclosed but does not override a qualifying open Trustee term. A future open term does not prevent a separate earlier term from qualifying on its own service dates.
- A Trustee Date To before the selected FY is excluded. A service start after the FY is excluded for dated terms. A dated term continuing after the FY is still serving at FY end and is included.
- A Trustee Date To within the selected FY qualifies only after at least six calendar months of service within that FY. Clip the start to July 1, include the final service day, and compare to the six-month anniversary. July 1 through December 31 qualifies; July 2 through December 31 does not. Fiscal-year boundaries, not today's date, determine the comparison.
- Year-only and month-only dates are ranges. Use them only when every possible date supports the same decision. An old end year such as 2008 is safely excluded; a December end month at the six-month cutoff needs review. Missing start dates are not silently assumed to precede July 1.
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

All eleven completed query results were then checked against the clarified v2 start-date rule. Each returned 408 source rows; every year passed duplicate/identity, amount and service validation, with zero unresolved eligibility decisions and zero missing amounts. FY17 has 31 eligible trustees / 26 cash participants under that rule; FY27 has 31 / 9. These are verification observations, not published snapshots. The mandatory release gate passed 1,685 tests across 77 files with none skipped, plus route types, TypeScript, the production build and unchanged-source verification. This multi-year change still requires deployment and per-year refresh to appear in production.

### Historical FY27 Findings (Read-Only Check, October 29, 2026)

The user updated query 31092 to include Trustee or Trustee-Former and all three constituency outputs. It returned 408 rows for 210 people. Offline validation of that read-only result under the new rule found 31 included, 179 excluded and zero unresolved service decisions. Nine of the 31 eligible trustees have positive FY27 cash giving (29.0%). Six included people also have Trustee-Former but retain a blank Trustee end date; they are included exactly as requested. Exclusions were service ending before FY27 or no original Trustee code returned. No production snapshot was published.

At that time FY26 query 31093 had only the name and two giving summary outputs, with blank-Date-To and former-trustee-exclusion criteria. The user has since updated it and it passed the October 30 metadata checks above. Its old query-only results must not be compared with filtered results. FY26 aliases are `Total Gifts FY26 (Cash)` and `Total Pledges or Planned Gifts FY26`, covering July 1, 2025 through June 30, 2026.

No NXT query criteria were changed by the app. Keep non-givers in every query; donor-only criteria would inflate participation. Preserve original Trustee service history rather than replacing it with dates describing former status.

The cash column also includes stock/property and other query-selected received gift types. It is the query-defined cash giving credit, not independently reconciled bank cash. Summing constituent-level soft/matching credit may count an underlying gift on multiple trustees' records. The dashboard labels these as giving-credit totals, displays query credit settings, and does not claim unduplicated institutional revenue.

## Developer Notes

- UI: `apps/web/src/app/reports/dashboards/board-of-trustees/page.jsx`.
- Authenticated API: `apps/web/src/app/api/reports/board-of-trustees/route.js` (GET saved state; POST fields or refresh).
- Adapter: `apps/web/src/app/api/utils/boardTrustees.js`. Client-safe contracts: `apps/web/src/utils/boardTrustees.js`.
- Service evaluation: `apps/web/src/app/api/utils/boardTrusteeEligibility.js`; covered by a mandatory date-boundary/fuzzy-date/term-consolidation suite. Snapshots carry rule `trustee-service-six-months-v2` and included/excluded/unresolved counts plus decision audit rows. The v2 rule adds start-date eligibility for open terms; v1 snapshots must be refreshed and are withheld from totals and comparisons. Legacy three-field mappings are upgraded during refresh only when the required output metadata exists; missing fields fail before query execution.
- Registry key: `board-of-trustees`, schema `board-of-trustees-v1`, default visibility `specific_users`. Shared report navigation and the dashboard switcher include it.
- Storage uses existing `report_snapshots_cache`, key `report:board-of-trustees:v1`; no schema migration. One revision covers all saved years. Optimistic compare-and-swap publishing prevents concurrent updates from dropping another year's changes. Source settings and complete results are saved together. Failed refreshes leave the prior snapshot untouched.
- Inspect source metadata before and after execution. Fingerprint membership, summary filters, output configuration and giving-credit settings; reject definition changes during a refresh. Keep each year's saved definition fingerprint and refresh actor for provenance.
- Reuse the shared reporting account, existing Blackbaud quota/token handling and bounded saved-query execution. No gift, constituent, custom-field or query-definition writes. Query execution creates only the provider's read job; normal token renewal may update app connection credentials.
- GET and POST use private, no-store responses. Unauthenticated/inactive/unshared readers are denied; non-manager writes and cross-origin commands are denied. Unexpected database/provider errors are sanitized. Permission-loss responses clear visible donor data.
- Unit, API and UI suites are part of the mandatory workflow gate. Live validation is separate and does not publish production snapshots. Fictional query metadata is in `apps/web/test/boardQueryFixture.js`.
- Participation is derived from the validated, deduplicated saved roster, not independently cached. All FY17-FY27 defaults and pure participation/coverage functions have a separate mandatory unit suite at `apps/web/src/utils/boardTrustees.test.js`. Parameterized adapter and UI tests verify every year's identity, aliases, annual filters and refresh request; tests also preserve saved overrides and other years' snapshots.

## Next Inputs

Refresh each desired year after deployment to populate its saved results under the current eligibility rule. No remapping is needed for the verified default queries. Future additions could include exports, a paced multi-year refresh, and like-for-like year-to-date comparisons; the present annual-summary queries do not support a historical same-date cutoff.
