# Team Standings prior-year refresh

## Reproduction

- On November 3, the live leaderboard retained its November 2 snapshot and showed
  "Refresh required" for every full FY26 scorecard total.
- One explicit Refresh standings attempt returned the previous snapshot. Production
  logs identified `giving_comparison` / `incomplete_results`, not an action failure.
- The comparison reader previously rejected any gift-type/date window with more
  pages after its 20-page, 500-gift limit. Adding the full prior fiscal year makes
  this limit applicable to a much larger window. Logs do not contain the exact
  underlying gift count, so that count has not been independently verified.
- Retaining the old snapshot was intentional: partial gift data must not appear
  as complete giving totals or alter fundraiser rankings.

## Fix

- When a date window reaches the page cap, discard its partial result and read
  two smaller, non-overlapping, inclusive date windows. Repeat only as needed.
- Retain the existing 20-page per-window limit, with an aggregate 120-page and
  150-second comparison budget. Each gift-page read has a 12-second timeout and
  no automatic transport retry. Existing provider cooldown handling remains.
- Reject malformed results, an incomplete single day, or an exhausted budget.
  Do not replace the shared snapshot if any required metric remains incomplete.
- Reuse complete full-year results for prior YTD, retaining existing gift-type,
  planned-gift, deduplication, and fundraiser-attribution rules.
- Show refresh progress while retaining saved scorecards, and explain incomplete
  data versus safety-limit failures without exposing provider response bodies.

## Validation

- Targeted API, pagination, calculation, and UI tests: 58 passed.
- Regression fixtures cover more than 10,000 gifts, discarded partial parents,
  recursive date splits, leap-day boundaries, page/time limits, malformed feeds,
  no retries after failure, stale-snapshot preservation, and refresh UI behavior.
- Gift pagination tests are included in the required workflow release gate.
- Full mandatory workflow gate: 2,087 tests across 110 files, none skipped.
- Typecheck, production build, and `git diff --check` passed.

## Rollout

- Not deployed by this task. No schema migration is required.
- No donor, gift, appeal, or action records were changed in NXT.
- After deployment, perform one Refresh standings and verify the refreshed time,
  full FY26 giving/actions on each card, and absence of a stale-snapshot warning.
- If the overall budget is reached, keep saved results and investigate a resumable
  background refresh rather than increasing limits indefinitely or publishing
  partial totals.
