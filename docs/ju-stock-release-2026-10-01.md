# JU Stock and Undated History Release - October 1, 2026

## Scope

- Explicitly approved undated NXT gift history retains a missing date rather than
  inventing one. Invalid/future dates and ambiguous app overlaps remain held.
- Staff-only opening counts, restocks, physical returns, and recounts have audited
  before/after balances and independent stock versions.
- Newly delivered receipts can explicitly deduct quantity, atomically with the
  receipt and request audit. Replays never deduct twice; competing deliveries
  cannot overdraw stock. Corrections and historical imports never adjust stock.
- Zero-count items cannot be newly selected; unknown counts stay distinct from
  zero. Item pictures and reservations are not part of this release.

## Verification

The isolated PostgreSQL fixture passed all 60 assistance, receipt, import, and
stock tests, including simultaneous writes, missing dates, source-key replay,
possible app matches, permission changes, insufficient stock, and audit rollback.
No production or NXT writes were performed by these tests.

The regular suite passed 5,455 tests (158 opt-in skipped); type-check, production
build, release-worktree guard, and whitespace checks passed. Deployment and live
import results will be appended after verification. Deploy only the JU Vercel
project; do not push shared Git or change
sandbox/other-copy targets. Production opening counts must be supplied by staff,
not inferred from historical gifts or invented for testing.
