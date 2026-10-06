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
