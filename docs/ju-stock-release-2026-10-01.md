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

## Production Verification

- Source commit: `47c81ee68e94d2b077df1d8618c139ec1167c7db`.
- JU deployment: `dpl_Aztdf6axmkBAoybm3CvmzMJbTRhd`,
  `https://mgo-jf5crr2px-chelspers-projects.vercel.app`.
- `https://www.jumgogpt.app/api/version` reported the exact commit.
- Sandbox stayed at `dpl_DjwTBKV1P5PptBLibP4oQC9GAK6N`; other copy stayed at
  `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. No Git push or persistent environment change.
- The live inventory loaded all 26 items as Not counted. Manage stock opened with
  a blank opening count and disabled save until confirmation. Desktop and 390px
  mobile layouts were inspected; the mobile dialog measured 356px client and
  scroll widths (no horizontal overflow). No live count was entered or saved.
- Unauthenticated inventory API access returned 401. Responsive overrides were
  reset and the disposable PostgreSQL fixture was stopped after tests.

## Live Historical Import

The authorized refresh of query 31053 returned 834 rows. Saved column/category
mappings were retained, including the explicitly mapped Vinyard/Vineyard Tote
spelling difference. The explicit missing-date option was enabled. Final preview:

- 357 eligible gift records with constituent system IDs verified from NXT actions.
- 13 new records, all with Date not recorded; 344 existing records skipped.
- 4 duplicate source rows consolidated; 473 unmapped/non-gift rows excluded.
- No source conflicts and no rows still held for missing-date review.

One read interruption at 208 verified records showed the generic query-read error.
After a pause, one resume continued the same checkpoint successfully. No fresh
query or repeated completed checks were needed. The message could be made more
specific to recipient verification in a future usability pass.

The UI confirmed **13 records added; 344 already present or held for review**.
Received Items then visibly showed all 13 newly imported records with **Date not
recorded**. Together with the prior import, 357 NXT historical gift records are
saved (not 357 distinct recipients). Source action/custom-field identities remain
separate for genuinely distinct gift records. No NXT writes, stock adjustments,
opening counts, emails, or donor updates were made. Historical fundraiser
ownership remains unverified, so imports remain staff-only.
