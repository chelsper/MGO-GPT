# Society Letter Document Readiness

Status: implemented and verified locally on October 9, 2026; not deployed.

## User Workflow

- The holding list checks the saved letter's required merge fields automatically. There is no separate check button or additional approval.
- A saved recipient review remains Reviewed even if an address or name value still needs attention for the template.
- Select ready households selects only eligible, reviewed recipients with the required template values. It explains how many reviewed recipients still need attention in the current view.
- Manual selections remain selected when blocked. Document approval is disabled with the affected names, missing fields, and direct repair buttons. No selected recipient is silently omitted.
- Edit address opens the exact missing field, including city, state, and ZIP in the separate-address section. Name-field repairs focus their corresponding editor fields.
- Missing templates link to template setup. Stale membership links to refresh; an unfinished running refresh links to resume. Missing appeal configuration links to appeal settings rather than showing the same generic destination for every issue.
- Refreshing membership or correcting a recipient retains the selection within the same reviewer and recognition period. The existing server rules still invalidate reviews when their inputs change or they exceed 15 days.
- These local corrections do not change NXT. Existing final approval, automatic pre-write checks, appeal receipts, household hierarchy, and download guards remain in effect.

## Implementation

`apps/web/src/utils/societyLetterDocumentReadiness.js` contains shared, pure required-value rules. The workspace and actual Word renderer use the same rules. Only fields referenced by the saved template require values; street line 2 and country remain optional. Structured address components are never guessed from free-form address text.

`apps/web/src/app/api/utils/societyLetterDocumentReadiness.js` inspects actual saved Word content and bindings once per active society template per workspace read, not once per recipient. Stored `usedFields` metadata is not trusted as the only source of requirements. The editor also receives the derived fields so it exposes the same values required by document creation.

The workspace exposes per-recipient `documentReadiness` independently of recipient review and NXT delivery checks. Global readiness issues include structured repair actions. The API returns safe structured merge blockers when server-side rendering detects a missing field after the page was loaded.

The server validates every selected recipient before persisting a new postal draft. A failure on a later recipient rejects the entire draft creation, preserving the explicit selection rather than generating a partial batch.

No dependencies, migrations, API permissions, production settings, or background jobs were added.

## Verification

- Full suite: 6,203 passed; 193 environment-gated tests skipped.
- Follow-up skip audit: 38 previously skipped checks passed, covering 33 campaign database cases, four import-recovery database cases, and the six-fictional-recipient export through the actual supplied Word templates. The targeted run passed 41 tests including three repeated renderer cases. The hosted converter check remains a pre-promotion gate.
- All 17 society-letter database integration tests passed using isolated PGlite. No production database was used.
- Typecheck and production build passed.
- Added coverage for optional versus required fields, actual Word metadata, structured repairs, attention filters, whole-selection rejection, ready-only selection, selection preservation, and server-side validation after page load.
- Local browser test with fictional recipients verified ready-only selection, explicit blocking of an incomplete manual selection, focusing a missing city, and saving the correction while retaining both selections and enabling document approval.
- Desktop and phone-width views inspected. No live NXT requests, constituent changes, letters, or emails were submitted.

Reproduce the database-enabled test run from `apps/web` with a local PGlite module:

```sh
STEWARDSHIP_PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js npm test
npm run typecheck
npm run build
```

Deployment remains a separate step. Use the JU-only release process and verify sandbox isolation before promoting.
