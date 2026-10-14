# JU Campaign Write-Offs and Received Reporting

## Release Scope

Future. Made. Campaign only. Original mapped gift amounts remain stored and visible.
Gift amount and Committed equal the original amount less total write-offs, with
approved campaign-only net overrides. Received subtracts current pledge balances
from Committed. Fiscal-year Received is paid to date on gifts originating in that
year, not a payment-date cash ledger. Nothing is written to NXT.

Verified multi-fund gifts distribute whole-gift deductions proportionally using
integer cents. Write-offs are weighted by gross splits; balances by the net splits
after rounding. Totals reconcile exactly. Split-mode queries require split-level
deductions. Conflicting rows, malformed deductions, or unreconcilable allocations
retain the last complete published snapshot. Negative Received is visible for review.

Adding only write-off/balance mappings preserves source identity and assigned funds.
An affected local exception needs review when its write-off changes; balance-only
changes do not invalidate it. Overrides replace net amounts without subtracting
the write-off again. Legacy snapshots have unknown deductions, not verified zeros.

## Verification Before Release

- 164 campaign tests passed, including 41 isolated PostgreSQL tests.
- Full suite: 6,693 passed; 192 existing opt-in tests skipped.
- Typecheck, production build, release guard and diff checks passed.
- Old-view upgrade was tested twice while preserving existing data, assignments
  and exceptions. Publication, partial mappings, empty results, duplicate conflicts,
  proportional rounding and totals across fiscal years/funds/priorities are covered.
- Production build retains existing dependency eval/chunk-size warnings.

## Activation and Recovery

The schema update adds two nullable columns and replaces the reporting view without
dropping historical data. It does not apply financial mappings automatically. After
release, load query 27460's fields, map total write-offs and current pledge balance,
and complete one refresh. Keep the amount mapped before write-offs; do not count a
pledge and its payments as separate commitments. Verify sample gifts and aggregate
totals against NXT before relying on the new figures.

The rollout uses a clean reviewed Git archive, an explicitly linked JU project,
a production candidate without domain assignment, then smoke checks before promotion.
No shared Git push, sandbox release, persistent environment edits or NXT mutation.
Application rollback does not remove the additive schema or undo financial refreshes.
Before activation, unchanged mappings retain legacy totals. If recovery is needed
after activation, preserve the data and review the reporting view and source snapshot
as well as the application version; do not delete imported rows or audit history.

Release identity and post-deployment checks will be recorded after verification.
