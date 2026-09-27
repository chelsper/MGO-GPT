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

Navigation deployment verification is recorded below after release.
