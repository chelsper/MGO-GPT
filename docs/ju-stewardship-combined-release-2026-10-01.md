# JU Combined Stewardship Release - October 1, 2026

Status: release candidate verified; deployment verification pending.

## Scope

- Optional available gift preference on the existing Personal gift assistance
  request, shared with staff and the fundraiser without a second inbox.
- Received Items history, item and constituent filters, confirmed receipt dates,
  and audited corrections without deleting history.
- Society Letter selection for up to 50 editable recipients independently of
  delivery checks. Document approval remains gated and limited to 10 households.
- Additive request/audit columns and a receipt table. No destructive migration,
  automatic delivery, NXT writes, stock deduction, or inferred historical receipt.

Historical NXT action attributes are not imported by this release. The receipt
page states that its history covers receipts recorded in this app.

## Target And Recovery

- Only JU project `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`, root `apps/web`.
- Publish a clean Git archive directly to Vercel. Do not push the shared repo.
- Prior JU deployment: `dpl_4fFQv7Cyb8gKzLn61MvgHxDU8ou1`, commit
  `85c141a492b9b6baf8cf1c192278dcaf104f67e1`.
- Preserve all five current production cron definitions.
- Sandbox baseline: `dpl_DjwTBKV1P5PptBLibP4oQC9GAK6N`.
- Other Git-connected copy baseline: `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`.

Rolling back application code must leave new request snapshots, receipt rows,
and audit history intact. It does not undo any staff actions taken after release.
The schema changes are additive and compatible with the previous application.

## Verification

- Full suite: 5,310 passed; 140 opt-in tests skipped.
- Society Letter UI: 175 passed, including 11 new selection cases.
- Typecheck, production build, release guard, and whitespace check passed.
- Synthetic desktop/mobile checks covered request selection, receipt recording
  and correction, shared fundraiser status, recipient selection and review,
  preserved delivery gates, and no horizontal page overflow at 390px.
- All 42 isolated PostgreSQL assistance/receipt tests passed before release,
  including idempotent schema setup, duplicate protection, corrections, and
  permission checks. No production database was used for these tests.

Unrelated documentation edits, desktop metadata, and the unfinished private PDF
conversion service are excluded. Production verification is read-only: no live
donor mutation, recipient exclusion, appeal assignment, email, or letter send.
