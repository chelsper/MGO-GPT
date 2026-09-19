# Saved Portfolio Giving Report

The default `/reports` screen is titled `FY27 portfolio giving` (the year changes
with the existing July-to-June fiscal-year convention). Other report tabs remain
unchanged. The redundant Available Reports card section has been removed.

## Read Path

- `GET /api/reports/portfolio-giving` resolves the signed-in/acting workspace,
  verifies account status and report access, and reads the published snapshot
  and refresh checkpoint in one database query. It does not call NXT, start a
  refresh, fall back to live data, or accept another workspace from URL parameters.
- The snapshot includes gift rows/groups, donor names, fund descriptions, gift
  types, report totals, and saved open-opportunity options. The page no longer
  calls the portfolio, fiscal-year giving, constituent-summary, prospects-summary,
  or gift-opportunity endpoints on normal visits.
- Dates and a last-complete-refresh timestamp remain visible. Missing data is
  shown as "No saved report yet", never as zero. An authenticated read failure
  remains an error; it does not fall back to NXT.
- Existing stewardship links and gift-link behavior are preserved. Opportunity
  options reflect the saved report; the existing gift-link endpoint still checks
  live opportunity/gift eligibility before saving a link.

## Refresh Path

Refresh is explicit and manual in this first release. No cron schedule or
overnight portfolio worker was changed. The browser sends sequential POSTs while
the page remains open; leaving pauses continuation after the in-flight request.
Returning and selecting Resume refresh continues from the saved checkpoint.

`POST /api/reports/portfolio-giving` accepts only a start or continuation command.
It never accepts client-calculated rows/totals. Phases are:

1. Read the verified assignment list through the existing portfolio adapter.
2. Read up to five constituents' giving per request using the strict existing FY
   calculator, deduplicating associated soft-credit gifts across batches.
3. Read up to four required donor profiles sequentially per request. Use the
   lightweight report profile with an explicit fresh read, not a full narrative.
   Verify the returned constituent ID, name, and authoritative constituency codes.
4. Read up to 25 constituents' open-opportunity options per request.
5. Verify the existing full-FY commitment calculation using
   `getClosedFiscalYearSummary(requireComplete: true)`. That helper retains its
   existing shared short-lived cache and fiscal-year scans; it is not performed
   when the page opens.
6. Assemble and publish the complete report atomically. Cash received and
   acknowledgment details retain their existing FY-to-date definition; committed
   totals retain their existing full-FY definition. No arithmetic was changed.

Missing fund descriptions alone may publish a clearly labeled warning because
they do not alter financial totals. Missing gift segments, donor verification,
soft-credit data, or commitment totals prevent publication. NXT throttling sets
a retry time instead of triggering a retry loop. A failed request may require
Reload status before continuing; an interrupted lease expires after six minutes.

## Storage And Safety

The existing `report_snapshots_cache` table stores separate published and working
keys under `portfolio-report-v1`. Keys isolate app origin, workspace, fundraiser
mapping/name/aliases, and fiscal year. No new table or migration is needed.

Refresh claims use an atomic revision comparison and six-minute lease, longer
than the route's five-minute execution ceiling. Every checkpoint is conditional
on lease ownership. Publication and completion use one lease-guarded SQL
statement, so overlapping tabs and late workers cannot overwrite another result.
Refresh inputs are never exposed in the public job status.

The server rechecks account/report access, workspace identity, and the report date
before saving. If a checkpoint crosses a calendar day, the next explicit refresh
starts fresh inputs for that date rather than mixing different reporting windows.
An existing complete snapshot remains intact on every failure. Reports whose
workspace/mapping or fiscal-year key changes need a new first refresh; old-year
figures are not relabeled as the new fiscal year.

## First Rollout

Existing per-constituent portfolio caches lack complete soft-credit grouping and
cannot safely seed this report. After deployment, select a fundraiser and run
Refresh report once, keeping the page open. Later visits use that complete saved
report. Subsequent data updates require Refresh report; this first step does not
claim automatic overnight report updates.

Before presenting, verify one complete production refresh, then reload and
confirm the saved timestamp/figures remain and no visit-time NXT reads occur.
Tests and the isolated desktop/mobile preview do not replace this production
readback. They deliberately perform no production refresh or NXT writes.

Tests cover authorization, workspace/date isolation, zero versus unknown, strict
donor verification, direct/soft-credit and DAF parity, duplicate gift handling,
bounded phases, retry delays, concurrent claims, last-good retention, no live
reads on mount, and preservation of stewardship/opportunity controls.
