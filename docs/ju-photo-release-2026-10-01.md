# JU Inventory Photos - October 1, 2026

## Scope

Gift Inventory Add/Edit item now supports one optional image, a required visual
description, local preview, replacement, removal, and undo before save. Images
are resized and re-encoded before submission. Saved photos remain private to
Admin/Advancement Services in the instance database and load separately from
catalog JSON. No remote upload service, NXT writes, receipt changes, or stock
adjustments occur. No sample photos are to be saved in production for testing.

## Validation

- Final regular suite: 5,490 passed, 164 opt-in skipped.
- All 17 inventory PostgreSQL tests and 60 receipt/import/stock PostgreSQL tests
  passed using isolated local fixtures. These cover atomic rollback, permissions,
  concurrent edits, stale versions, old-client preservation, archive/restore,
  private photo reads, and unchanged stock balances.
- Type-check, production build, release guard, and whitespace checks passed. The
  final sizing correction was verified in the browser and final production build.
- An offline synthetic browser fixture used the actual inventory and photo
  components with no production data or network writes. It verified descriptive
  text save, remove/undo, and photo fit on desktop and at 390px. The mobile dialog
  had matching 356px client/scroll widths; the photo matched its 158px frame
  without clipping. No browser upload to production was performed.
- Local preview and PostgreSQL servers were stopped; viewport override reset.

## Release

Pending JU-only release verification. Deploy from a clean commit archive with
explicit JU project IDs, without pushing shared Git or changing sandbox targets.
