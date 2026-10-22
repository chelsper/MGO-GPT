# Society Letter Document Readiness

Status: deployed to JU and verified on October 9, 2026. Conference sandbox unchanged.

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

## JU Release Verification

- Release commit: `621bb9fcc90accf0b10039305b2d056cd4a44bad`.
- Promoted deployment: `dpl_8k7bLMAe6zsvmtrtR5vLCYQmBLFi`, verified at `https://www.jumgogpt.app/api/version`.
- Previous production deployment: `dpl_7PfJyKrSrXzjoMHhoEBBsTMaYTx2`; commit `e87c78b0dc8cb56d25fac3f54204efe1b4058fce`.
- Clean release archive: all 1,210 tracked web files matched the tested workspace. Unrelated local changes were excluded; no Git push was used.
- Clean archive suite: 6,241 passed, 155 gated tests skipped. The hosted-PDF gate was subsequently exercised inside the protected candidate build; the remaining 154 optional database cases are outside this workflow and were not claimed as passing.
- Typecheck, local production build, release guard, and hosted build passed.
- Six fictional letters passed the actual protected PDF adapter, using existing production secrets within Vercel: individual, household, and organization examples for both supplied templates. Every result has one page, complete matching text, embedded Carlito fonts, no unresolved merge fields, and is below 4 MiB. All six page images were visually inspected.
- The initial local hosted check received Vercel's `[SENSITIVE]` placeholders from `env pull`, not real credentials. Its authentication failure did not establish a production defect. No credentials or protection settings were changed. Future local test runners must reject redacted placeholders before issuing requests.
- A release-only build hook performed the six conversions before building the app. Fictional inputs were removed before bundling; only encrypted QA artifacts were emitted for local layout review. The private decryption key stayed outside deployment inputs and was removed after verification. No diagnostic endpoint or public PDF artifact was added.
- Candidate and live smoke checks passed: release identity, eight page shells, boot assets, readiness UI assets, and unauthenticated API/download rejection. These were not authenticated live-recipient approval tests.
- JU cron schedules and PDF environment metadata stayed unchanged. The converter was not redeployed. Sandbox remains on `dpl_BrAqKBRfj5ZTYBmDUJ22NeYKteiq` with its configuration unchanged.
- The broad account comparison observed concurrent deployments of the unrelated `lotura-ju-pilot` and `shindig` projects. This task did not deploy or modify them; scoped JU, sandbox, and converter comparisons passed.

No production database migration, membership refresh, saved-template edit, recipient approval, NXT write, appeal assignment, or email send was performed during release testing.
