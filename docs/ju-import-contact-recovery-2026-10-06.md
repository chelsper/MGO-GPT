# JU Import Contact Recovery

## Scope

Deploy the saved-import contact recovery path to JU only. From the original
saved import, staff can select **Complete missing contact information** to
recover mapped email and phone values omitted from the original write plan.
The linked update-only correction preserves primary flags and the exact IDs
already created. Original row results and write history remain unchanged.

Checking saved contacts and preparing a correction do not call NXT. Sending
uses the existing contact review, target verification, and checkpointed write
flow. Already staged contacts remain in the original retry/verification flow;
uncertain operations cannot acquire a second writer. Incomplete contact reads
are held instead of treated as empty lists. No schema migration, dependencies,
environment settings, schedules, converter changes, or sandbox changes.

## Verification

- Full suite: 5,632 passed, 166 skipped; 429 files passed, 12 skipped.
- Includes four isolated in-memory PostgreSQL tests for atomic correction
  creation, overlapping requests, rollback, and subsequent correction links.
- Typecheck, local build, release guard, and diff checks passed.
- Fictional recipients and mocked NXT only. No live imports or NXT writes.

## Release Procedure

Deploy a clean archive of the reviewed commit directly to JU project
`prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`, without a Git push or automatic domain
promotion. Verify candidate startup, version, and assets before promotion.
Then verify the live site and that authenticated import endpoints reject
unauthenticated access. Retain all five existing cron paths and schedules.

Previous verified JU release: `aa45e9536caa69509f5e1b0a64de9df24f65eac4`,
deployment `dpl_HjdKWevMbnMB4ThNkrg2MTxRxBuv`. This remains the rollback
target. No recovery batch should be prepared or sent as a deployment test.
