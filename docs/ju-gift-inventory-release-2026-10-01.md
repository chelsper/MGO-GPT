# JU Gift Inventory Release - October 1, 2026

- Commit: `85c141a492b9b6baf8cf1c192278dcaf104f67e1`.
- Deployment: `dpl_4fFQv7Cyb8gKzLn61MvgHxDU8ou1`, READY, production.
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`.
- Live URL: https://www.jumgogpt.app/stewardship/inventory.
- Released from a clean Git archive, without pushing the shared repository.
- Production SHA and assets verified; all five scheduled jobs preserved.
- A bounded post-release error-log check returned no error entries.
- Sandbox remains `dpl_DjwTBKV1P5PptBLibP4oQC9GAK6N`; the other copy remains
  `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`.

Signed-in smoke testing confirmed the inventory page and saved catalog read.
Following the user's instruction to use the existing items, all 26 supplied
gift-specific starter names were added to JU through the inventory UI. All are
Not checked; no stock quantity, availability, reservation, delivery, or NXT mapping
was inferred. A reload confirmed 26 active items. No NXT or donor records changed.

Pre-release checks: 5,250 tests passed, 115 opt-in tests skipped; 11 PostgreSQL
inventory tests passed separately, plus type-check, production build, and synthetic
desktop/mobile UI checks. Existing dependency deprecation warnings remain.

Rollback target: `dpl_6wnj7dtFbi9eYFKwATqQiYzjLMxg`, commit
`8498366ab54ea14bbe1dff471a223d55764616e0`. Rollback may leave the additive inventory
tables and their item/history data in place. Preserve them rather than deleting
catalog or audit records.

The request-selection connection is a subsequent increment, not included in
this deployed catalog release.
