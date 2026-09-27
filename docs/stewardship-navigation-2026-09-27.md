# Stewardship Navigation - September 27, 2026

## Recipient Selection Release

The sole returned constituent is preselected without bypassing review, choosing
an organization contact, saving choices, or sending anything. Saved reviews and
restored drafts take precedence. Multiple candidates still require selection.

Deployed commit `d8c2630cbcb22e392663ef28a75598d25f2f25e4` to JU deployment
`dpl_26ZMS3mhF33FiUqzMrBvHzut2wuw`:
https://mgo-w0qzj4ej9-chelspers-projects.vercel.app

Production commit and public asset checks passed at https://www.jumgogpt.app.
Tests: 4,424 passed, 30 opt-in skipped; typecheck, build, release guard, and
desktop/mobile fictional recipient review passed. Clean archive upload: 988
files, 10,863,681 bytes; only `.env.example`, no private environment files,
dependency directories, generated build output, or Git/Vercel credentials.

## Navigation Changes

- Letter workspace Back returns to the prior visited workspace view, rather
  than always leaving for Stewardship. Browser Back/Forward works between views
  without reloading membership. Only allowlisted view names enter history.
- Direct links/reloads restore the selected view. When no local trail exists,
  Back uses a deterministic parent: field mappings to Source & period, setup
  editors to the checklist, and other workspace views to the holding list.
- Society definitions opens the organization settings anchor with a validated
  return path to the original letter setup screen. Other organization settings
  visits still return to Setup Hub. Unsaved source settings require confirmation
  before leaving for organization settings.
- Closing a personalized preview, including Escape inside its document, closes
  only the preview and returns focus to its opener. Recipient edits remain.
  Closing the recipient review retains its existing unsaved-edit guard.
- Existing review Previous/Skip/Close, template/sample preview Close, exclusion
  Cancel, and final-letter Close remain local to their parent workflow.

Navigation does not save forms or create NXT, email, appeal, or letter requests.
There are no server, schema, permission, or schedule changes. Same-page Back
preserves holding-list filters and parent-held source settings; it does not
persist unsaved editor data across page reloads or departures.

## Validation

4,444 tests passed, 30 opt-in skipped. Typecheck, production build, release
guard, and diff checks passed. New coverage includes all eight view URLs,
Back/Forward, direct-entry fallbacks, invalid return paths, source drafts and
filters, organization return links, preview-only close, and no navigation fetches.
Local browser QA used fictional data under React Router: sequential Back,
browser Back with retained search, preview close with retained wording, existing
discard confirmation, and a 390-pixel mobile layout. No live records were edited.

Both releases use explicit JU project `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` and
clean commit archives, with no Git push. The baseline for this work is sandbox
`dpl_EyJB2zAbgkAb7uayPnUhyodwgmj7` (Git disconnected) and other linked copy
`dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. Do not use older sandbox release baselines.

## Navigation Production Release

Deployed commit `d57199d311963d7cad3dbf66f1e350041449092f` to
`dpl_5cZKhpoo7AwTXuB13NMahccnoxZq` (READY):
https://mgo-hzkwgqkqb-chelspers-projects.vercel.app

The clean upload contained 992 files / 10,880,793 bytes. The manifest contained
only `.env.example`, no private environment files or generated/dependency output.
JU's production alias verified the expected commit and public asset references.
Read-only smoke checks passed on four page URLs (including direct letter-view
and organization-return URLs) and 20 referenced assets. The unauthenticated
society-letter API returned HTTP 401. Browser behavior was checked locally with
fictional data; no authenticated live NXT mutation was used as a smoke test.

The post-release inventory confirmed the sandbox and other linked copy remained
on the baseline deployments above, sandbox Git remained disconnected, and all
three projects' cron paths and schedules were unchanged. No Git push occurred.

Previous JU deployment: `dpl_26ZMS3mhF33FiUqzMrBvHzut2wuw`, the sole-recipient
release. This navigation-only release does not change stored data or delivery
receipts. Preserve all existing appeal reservations/history during any recovery.
