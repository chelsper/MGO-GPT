# Society Letter Guided Workspace

Deployed to JU October 8, 2026. The sandbox is unchanged. This is the first workflow
simplification step: keep recipient review, document approval, processing,
and downloads in one workspace without changing the NXT write policy.

## Staff Workflow

1. Review recipient names and addresses, or keep their existing saved reviews.
2. Select reviewed households and start document approval. Letter options
   contains the existing Word/PDF choice and global letter-date update.
3. Prepare the documents. Previews remain optional; one explicit approval
   authorizes the existing household checks and NXT appeal updates.
4. Progress and downloads remain in Letter workspace instead of automatically
   navigating to Letter history. Mark letters mailed only after dispatch.

The stage indicator shows the current step. Setup and optional postal preflight
controls are collapsed; actual setup blockers still appear where they prevent
preparation. Legacy delivery checks remain expanded by default.

Saved approval drafts open directly. An unfinished approved batch is restored
for display, not submitted automatically. Staff can open saved batches from
the workspace, return to recipients, or use Letter history and its filters.
Leaving during processing pauses after the current request; this is not
unattended background processing.

## Implementation And Safety

- `LetterWorkflow.jsx` renders the four-stage indicator.
- `page.jsx` keeps the active batch visible, maintains recipient filters,
  and removes scroll-only continuation controls and repeated instructions.
- `LetterBatchCard.jsx` shares the existing batch actions between the workspace
  and history. Only one view mounts a batch runner at a time.
- `PostalBatchApproval.jsx` retains the same explicit preparation and approval
  handlers, with secondary record details and clearer primary-action styling.
- Fresh approval still starts the existing bounded runner. Returning to a saved
  batch never replays that approval or starts NXT writes.
- Downloads and marking mailed remain blocked until required appeal receipts
  are complete. Uncertain assignments retain automatic read-only reconciliation
  and existing manual recovery, without automatic resubmission.
- Household validation, permissions, revisions, deduplication, hierarchy,
  preview behavior, document limits, server routes, and NXT mutation code are
  unchanged. No new dependencies, schema, environment variables, or schedules.

## Verification

The full suite passed 6,088 tests, with 174 opt-in tests skipped. The final
focused rerun passed all 86 workspace, approval, and shared batch-card tests,
including the reviewed-filter guidance correction. Campaign SQL tests used
isolated PGlite, not production. Typecheck, production build, release-worktree
guard, and diff checks passed.

A localhost-only fictional fixture exercised selection, preparation, explicit
approval, processing, and download availability without leaving the workspace.
The 390px mobile layout had no page-level horizontal overflow or browser errors.
No real recipients, letters, appeals, NXT records, or emails were changed by
these checks.

Test coverage also verifies retained selections during automatic verification,
saved-draft recovery, no writes when reopening batches, failure recovery,
unchanged latest-revision sequencing, and optional rather than repeated previews.

Local verification logs: `/tmp/ju-guided-letter-final-tests.log`,
`/tmp/ju-guided-letter-final-focused.log`, `/tmp/ju-guided-letter-typecheck.log`,
and `/tmp/ju-guided-letter-build.log`.

## Deployment And Recovery

- Application SHA: `899afcb72627967e282c5e640258e0704abf1a80`.
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` (`mgo-gpt`).
- Deployment: `dpl_HBzGwMMtSE2TAUEnRqCNxo5HcxRf`.
- Live: `https://www.jumgogpt.app`.
- Candidate: `https://mgo-gsgaanda1-chelspers-projects.vercel.app`.
- Rollback target: `dpl_5y5g6xGTASHCBoapq3Z5kwASynSV`,
  application SHA `e9d58e441c5f0b4675314cc59139575d02fe3b33`.
- Sandbox retained `dpl_H5mHhcYkDbkCZvteAeSSoqkaT2fs`.

The release rerun passed all 6,088 tests, typecheck, production build, and
release-worktree guard. An isolated archive matched all 1,194 tracked web
files; all six changed application files were verified in the upload and no
real environment files were included. There was no Git push.

Candidate and live checks confirmed the exact application SHA, eight page
shells, three JavaScript assets, and unauthenticated GET/POST protection on
the campaign and society-letter APIs. These were public smoke checks, not
live donor approvals or NXT mutation tests.

Only JU's production deployment identity changed. Other project deployment
identities, JU settings, cron definitions, and PDF settings matched the
pre-release snapshot. Existing dependency/install-script and optional
`canvas` warnings were unchanged from the previous successful deployment.

Pause active processing before rollback. Keep saved documents, approvals,
reservations, and appeal receipts. A code rollback does not undo NXT writes
or letters subsequently authorized by staff; reconcile uncertain receipts
read-only rather than preparing a duplicate batch.

Release evidence uses the `/tmp/ju-guided-letter-` prefix: `release.json`,
`release-tests.log`, `release-typecheck.log`, `release-build.log`,
`dry.json`, `deploy.log`, `candidate-smoke.log`, `promote.log`,
`live-smoke.log`, `projects-before.json`, `projects-after.json`, and
`projects-after-check.log`.
