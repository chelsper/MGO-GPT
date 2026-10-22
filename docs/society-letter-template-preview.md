# Saved Society Letter Preview

## Staff Workflow

In Stewardship > Society Letter Creation > Letter templates, each saved society
letter has Preview saved letter, Download Word file, and Replace Word file.
The replacement upload stays hidden until requested. Cancelling a replacement
keeps the stored file; merge settings can still be saved without another upload.

Preview displays the saved version, not unsaved changes or a personalized letter.
Merge tags remain visible. It does not prepare letters, reserve recipients, mark
delivery complete, assign appeals, send email, or call NXT. Existing personalized
recipient previews and batch downloads remain separate workflows.

## Implementation Boundaries

- The existing authenticated stewardship GET route accepts a 64-character
  `templateVersion`. It is restricted to active Advancement Services/admin users.
- It reads the exact immutable stored version, revalidates document/archive
  safety, and returns original DOCX bytes with private/no-store, nosniff, and
  same-origin resource headers. No mutation lease or delivery operation is used.
- Templates and merge preferences stay in existing database storage. There is
  no schema migration, NXT configuration change, or template replacement.
- `docx-preview` is pinned at 0.4.1 and imported only after a preview is opened.
  The production preview chunk is approximately 51 KB gzipped; normal workspace
  loading does not fetch template bytes or the renderer.
- Document rendering is isolated in a sandboxed iframe. Scripts, remote assets,
  network requests, forms, and embedded HTML chunks are blocked. Images/fonts
  use data URLs; document links are made inert. No third-party document viewer
  receives the letter.
- Browser layout can differ from Word, especially pagination and fonts. Download
  the Word file for exact layout review. Narrow screens can scroll horizontally
  from the page's left edge rather than clipping a centered page.

Renderer reference: [docx-preview primary documentation](https://github.com/VolodymyrBaydalka/docxjs).

## Verification - September 25, 2026

- 69 focused tests passed across API access/read-only behavior, preview rendering
  and failures, cancellation, keyboard close, saved-template reuse, and the
  existing stewardship page workflows.
- Full suite: 4,140 tests passed; 21 opt-in tests skipped.
- Typecheck, production build, and whitespace checks passed.
- Local isolated browser QA rendered both user-supplied President's Society and
  Order of the Dolphin documents, including embedded society logos. Desktop
  preview and 390-pixel mobile layout were inspected. Browser size was restored
  and the test server stopped afterward.
- The local fixture server rejected writes and had no production database or
  NXT connection. No production template, recipient, or configuration was changed.

Release status is recorded separately in the JU release notes. These checks
describe the implementation before deployment.
