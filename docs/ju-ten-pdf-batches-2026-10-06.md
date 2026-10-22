# JU Ten-PDF Batches

## Scope

Raise JU production's `SOCIETY_PDF_MAX_BATCH_SIZE` from `3` to `10`. This is
within the existing server-validated maximum; Word batches remain at ten.
The page describes the configured capacity rather than the initial pilot.
Do not change the sandbox, converter service, credentials, database schema,
cron schedules, recipient review, or appeal checks.

Documents are prepared one at a time in separate requests and saved as each
finishes. Staff can resume the saved draft after an interruption without
reconverting finished letters. Every exact PDF still requires approval. NXT
checks and appeal writes remain one household per request, covering both
members where applicable. Preparing documents does not write appeals.

The four-MiB per-document and combined-download safeguards remain. If a batch
is too large for the combined ZIP, staff can download its saved letters
individually. This release does not introduce PDF compression or larger
than ten-document batches. Existing three-document drafts are not expanded
automatically; the higher cap applies when starting a new draft.

## Verification

- 139 focused tests passed, including ten-PDF selection, upper-limit rejection,
  failed-conversion recovery, saved document reuse, explicit document approvals,
  and exactly one mocked appeal assignment per member across ten households.
- Full suite: 5,561 passed, 166 skipped; 423 test files passed, 12 skipped.
- Typecheck, local build, release guard, and diff checks passed.
- Tests use fictional recipients and mocked conversion/NXT. No real-recipient
  PDFs, approvals, appeal writes, emails, or mailed confirmations are part of
  release verification. Converter content/rendering behavior is unchanged.

## Release Procedure

Update only the production-scoped variable on JU project
`prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`, then deploy the reviewed clean archive to
that project without a Git push. Verify the production SHA/assets, authenticated
PDF capability of ten, and the selection UI without starting a real draft.
Compare other projects and JU's five scheduled jobs with the pre-release
snapshot. To restore the pilot ceiling, change the variable back to `3` and
redeploy JU; preserve existing drafts, documents, and appeal receipts.

## Startup Packaging Recovery

The first hosted release (`dpl_58EgcWyhxCNtyDAaUxUT5yZSLz83`) built successfully
but failed the live version check with `ERR_MODULE_NOT_FOUND` for
`react-router-dom/dist/index.js`. JU was immediately rolled back to verified
deployment `dpl_5evnxiwhxPXUdcD6zEt8b5KtADiT`; its version and homepage check
passed. An uncached candidate (`dpl_A6KJ3ekVSobmhJhkCmuVbtqBxmyg`), built
without promoting the JU domain, reproduced the same packaging error.

The layout generator was the only remaining application producer of a
`react-router-dom` import. It now imports `useParams` and `useLocation`
directly from `react-router`, as the rest of this React Router 7 application
does. No dependency versions or routing behavior were changed. The resulting
local server output no longer contains the compatibility-package import.
Four regression tests cover server router context, normal parameters,
catch-all parameters, and static/already-wrapped pages. Subsequent candidates
must pass their own version/homepage checks before promotion to the JU domain.

## Verified Release

JU production was successfully promoted on October 6, 2026:

- Application commit: `aa45e9536caa69509f5e1b0a64de9df24f65eac4`.
- Deployment: `dpl_HjdKWevMbnMB4ThNkrg2MTxRxBuv`, READY.
- URL: <https://www.jumgogpt.app>.
- Full suite after the routing fix: 5,565 passed, 166 skipped; 424 files passed,
  12 skipped. All four router tests also passed with the final static-router
  test fixture. Typecheck, build, release guard, and diff checks passed.
- The candidate version and homepage checks passed before promotion. Live
  version/HTML checks passed afterward; all three entry assets returned 200,
  and unauthenticated society-letter API access returned 401.
- In a fresh signed-in tab, selecting PDF displayed "Create up to 10 PDFs per
  batch" and "Select reviewed households (up to 10)". No recipients were
  selected and no draft, NXT update, template change, or letter was created.
- Production configuration confirms `SOCIETY_PDF_MAX_BATCH_SIZE=10`.
  The other PDF settings, five cron schedules, project root/build settings,
  sandbox, converter metadata, and other app copy remained unchanged.

Existing dependency/install-script, optional canvas, PDF.js eval, and mixed
import build warnings remain. They did not block the verified final deployment.
