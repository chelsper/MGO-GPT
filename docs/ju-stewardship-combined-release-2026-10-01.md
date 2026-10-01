# JU Combined Stewardship Release - October 1, 2026

Status: deployed to JU; release verified. Live society-letter query recovery
remains outstanding as described below.

- Application commit: `543e6b14974d4759843f7b028df93e7129b59042`.
- Production deployment: `dpl_QdqwXhLe4AprQieuteogUw7PFSkJ`, READY.
- Deployment URL: https://mgo-7lu72456l-chelspers-projects.vercel.app.
- Live site: https://www.jumgogpt.app.
- Published a clean Git archive with 1,162 source files and the web Vercel
  manifest. No shared-repository push or persistent environment-setting change.
- Deployment-only build/runtime commit variables identify the exact source SHA.

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
- A fresh dependency installation in a separate clean archive repeated the full
  5,310-test suite, typecheck, and production build successfully. Vercel's build
  also succeeded. Existing dependency deprecation and mixed-import notices remain.
- Public production SHA, deployment ID, and HTML assets match this release.
- All three affected page routes and 18 referenced assets returned HTTP 200;
  unauthenticated Received Items API access returned HTTP 401.
- Signed-in checks confirmed the 26-item inventory and new Received Items page,
  including the empty-history explanation and contextual back navigation.
- Society Letter Creation displays the new review-selection controls and retains
  the server's safety gates. Live selections could not be exercised with the
  current saved membership state; see the remaining blocker below.
- No browser console errors or entries in the bounded deployment error-log check.
- All five JU cron paths/schedules, sandbox production, and the other copy's
  production deployment were verified unchanged against the pre-release snapshot.

## Remaining Live Membership Blocker

The signed-in society-letter page reports the President's Society query file
exceeds 12 MB before deduplication; no partial membership was saved. Membership
is dated September 24, 2026, setup reports query-field mappings incomplete, and
all 396 displayed recipients are unavailable for review in this saved state.
Their selection controls remain disabled with an explanation. The UI selection
improvement does not bypass missing or mismatched source data.

Recover the query output/mapping and finish a complete membership refresh before
testing live recipient selection or running delivery readiness. Do not raise
size limits blindly, infer missing household membership, or assign appeals from
this incomplete refresh. No query restart or NXT settings change was made during
deployment verification.

Unrelated documentation edits, desktop metadata, and the unfinished private PDF
conversion service are excluded. Production verification is read-only: no live
donor mutation, recipient exclusion, appeal assignment, email, or letter send.
