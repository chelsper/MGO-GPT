# Society letter print ready PDF

Implemented locally on October 8, 2026. Not deployed.

## Staff workflow

Choose PDF when preparing a batch, approve the documents, and finish the saved NXT appeal updates as before. In the current letter workspace or Letter history, **Download print-ready PDF** combines that batch's approved PDFs into one file. Existing PDF batches qualify too; no new approval is required just to combine them.

Each letter begins on a new page. Multi-page letters remain together in the original approval order. Print single-sided at actual size to avoid placing another household's letter on the back. PDF viewer preferences request these settings, but printer/viewer support varies.

The button stays disabled until appeal receipts are complete. Downloading does not add appeals, create another letter reservation, change reviewed wording or dates, or mark anything mailed. **Mark batch mailed** remains an explicit action after dispatch. Individual downloads and the ZIP remain available. Word batches keep their existing Word downloads; this feature does not silently convert them.

## Implementation and limits

- Authenticated reviewer-only `GET /api/stewardship/society-letters?download=<batchId>&format=combined-pdf` returns `society-letters-print-ready.pdf` with private, no-store headers.
- `societyLetterPrintPdf.js` reads only the selected non-cancelled postal batch and copies existing pages with pinned `pdf-lib` 1.17.1. It uses no converter, external service, write lease, or database mutation.
- Every saved PDF is checked against its approved SHA-256 and byte size. Only approved, prepared/mailed PDF letters with completed member receipts are accepted. Duplicate letter/document/order identities and mixed batches are rejected.
- All original pages, font resources, images, page dimensions, rotations, and letter dates remain intact. There is no rasterization, image downsampling, cover page, or inserted separator page. Object-stream compression does not change the printed content. Source files remain unchanged.
- Limits remain ten letters per batch, with a four MiB total source/output limit and 100 combined pages. An oversized, missing, damaged, encrypted, empty, or interactive-form PDF stops the entire download; no partial batch is returned. Staff can use individual downloads when a batch is too large.
- Multiple approved batches are not combined in this step. There is no new schema, environment variable, converter deployment, NXT permission, or background job.

The merge uses the library's [page-copying API](https://pdf-lib.js.org/docs/api/classes/pdfdocument#copypages), rather than re-rendering the letters.

## Verification

Full local suite: 6,088 passed, 207 skipped (opt-in integration/fixture tests); no failures or unhandled errors. Typecheck, production build, release worktree check, and diff whitespace check passed.

Regression coverage includes reversed history order, multi-page letters, ten-letter batches, mailed re-downloads, relationship-only spouses, incomplete member receipts, unchanged source data, authentication/roles, filename/headers, corruption, missing files, duplicate identities, forms, and byte/page bounds. The browser download is a GET and does not trigger appeal synchronization, document preparation, or mailing status changes.

Fictional local QA combined three letters into four pages, including embedded Carlito fonts, a letterhead image, and a two-page letter. All four combined page renders matched their source page renders pixel-for-pixel at 100 DPI. Desktop and 390-pixel mobile controls were visually checked. No production recipients, NXT writes, live converter calls, emails, or physical printing were used for these checks.

Local evidence: `/tmp/ju-print-pdf-full-tests.log`, `/tmp/ju-print-pdf-typecheck.log`, `/tmp/ju-print-pdf-build.log`, and `/tmp/ju-print-pdf-qa/`. Focused regressions are in `societyLetterPrintPdf.test.js`, the society-letters API `route.test.js`, `LetterBatchCard.test.jsx`, and the society-letters `page.test.jsx`.
