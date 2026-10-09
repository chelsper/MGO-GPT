# Society Letter Recovery

## Behavior

Deployed to JU and verified on October 9, 2026, after the database checks passed. Sandbox unchanged. This addresses the first two findings in the [workflow audit](/Users/chelseasantoro/.codex/worktrees/1b6f/anything%202/docs/society-letter-workflow-audit-2026-10-09.md).

- Continue unlocks when newly saved receipts resolve a definite failure, not just an uncertain submission. An unrelated render does not clear a transport stop.
- Reload saved batch status performs an app-side read only. A successful safe reload can unlock Continue but never starts an NXT write automatically.
- Saved NXT cooldowns block batch continuation in both the interface and API. Reload after the cooldown; confirmation remains required to continue.
- An authorized reviewer can choose Return to review for one approved postal letter only if every member has no evidence of an attempted NXT submission. A pending status alone is not enough: even a rejected attempt remains protected.
- Return requires explicit confirmation, an exact household/member match, the existing workspace revision/lease, and a database comparison against the saved receipt, approval, and document metadata.
- Returning a letter preserves its document, approval, appeal receipt, and saved recipient wording. The reservation becomes cancelled with a return audit containing actor, timestamp, and reason. No NXT records are read, written, or deleted by this action.
- The recipient returns to the holding list when still present in the current source. Existing restrictions, stale membership, changed data, and review expiry are not bypassed. A newly approved replacement must pass normal NXT checks before any update.
- Other batch letters remain reserved. Returned letters are explicitly identified in history and excluded from progress totals, downloads, and mailing. Submitted/uncertain letters cannot use this shortcut.

## Staff Workflow

For an interrupted batch, use Reload saved batch status, resolve any outstanding member issue, then explicitly continue the saved batch. Do not create a replacement letter to retry a submission.

For an approved but never-submitted letter that needs correction, open Recipients and acknowledgment coverage, choose Return to review, and confirm. Edit the saved recipient choices in the holding list, then prepare and approve a new document. The previous document remains in history but is not included in downloads.

If Return to review is absent, a member may have an attempted, uncertain, or confirmed update, or the letter may not be an approved postal document. The restriction is intentional. Use the existing reconciliation flow; do not remove NXT history merely to enable the button.

## Developer Notes

The shared eligibility rule is in [societyLetterRecovery.js](/Users/chelseasantoro/.codex/worktrees/1b6f/anything%202/apps/web/src/utils/societyLetterRecovery.js). The API action is `return_letter_to_review`, guarded by existing reviewer authorization, same-origin checks, explicit confirmation, and the current workspace revision. The [store operation](/Users/chelseasantoro/.codex/worktrees/1b6f/anything%202/apps/web/src/app/api/utils/societyLetterStore.js) uses one lease-guarded statement to release exactly one reservation and record the audit. No new schema is required; the audit uses the existing JSON payload and cancelled status.

The batch runner tracks changes in persisted receipts rather than component rerenders. It never turns a reload into approval. Individual and bulk remaining-appeal flows retain their existing safety checks. Downloads and mail confirmation use active batch members only, while history retains all entries.

## Verification

- Full release suite: 6,185 passed, 193 existing opt-in tests skipped. This includes all 17 society-letter database tests. Forty additional default-suite tests cover the recovery guards, API authorization/confirmation, stale client claims, explicit reload behavior, cooldowns, holding-list navigation, and remaining-batch controls.
- Typecheck, production build, release worktree check, and whitespace checks passed.
- All 17 PostgreSQL integration scenarios passed using in-memory PGlite 0.5.8, including the three new scenarios for document/review preservation and replacement reservation, stale receipt rejection after a submission checkpoint, and expired/replaced lease rejection. The same SQL assertions run through either the native socket or PGlite adapter; no database assertions were removed or weakened.
- Native PostgreSQL initialization failed with `shmget: No space left on device`, a host shared-memory limit rather than a disk-space error. No running database was changed or stopped. PGlite uses a separate in-memory database, never `DATABASE_URL`; multi-process/native-driver behavior was not exercised by this run.
- Browser smoke checks used fictional recipients and mocked responses: return confirmation, selected holding-list row with saved wording, editing and saving the greeting, preparation/reapproval of a replacement, and enabled print-ready download after simulated completion. No real PDF conversion or NXT write was performed by the browser fixture.
- No authenticated query refresh, live NXT requests, constituent changes, appeal assignments, letter approvals, or letter sends were performed during verification.

To repeat the database checks, use a fresh temporary PostgreSQL cluster with `STEWARDSHIP_TEST_PG_SOCKET=/tmp/stewardship-pg.<suffix>`, or set `STEWARDSHIP_PGLITE_MODULE` to a temporary installation's `node_modules/@electric-sql/pglite/dist/index.js`. The harness rejects simultaneous backends and never uses a production connection. No production dependency was added.

Logs: [database checks](/tmp/ju-letter-recovery-database.log), [full release tests](/tmp/ju-letter-recovery-release-tests.log), [typecheck](/tmp/ju-letter-recovery-release-typecheck.log), [build](/tmp/ju-letter-recovery-release-build.log).

## JU Production Release

- Application commit: `e87c78b0dc8cb56d25fac3f54204efe1b4058fce`.
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` (`mgo-gpt`), root `apps/web`.
- Deployment: `dpl_7PfJyKrSrXzjoMHhoEBBsTMaYTx2`.
- Candidate: `https://mgo-5j4zy1b8e-chelspers-projects.vercel.app`.
- Live: `https://www.jumgogpt.app`.
- Previous JU / rollback target: `dpl_C4J7rnmijkr2n6rW74FUdeyi4VTX`, commit `6faec69006e5b2de0edd3809e853d66ac102d10c`.
- Sandbox before and after: `dpl_BrAqKBRfj5ZTYBmDUJ22NeYKteiq`. All other project deployment identities, Git connections, cron definitions, and PDF setting metadata compared unchanged.
- The clean Git archive matched all 1,206 tracked web files against the tested workspace. All 18 changed application files were present in the 1,327-file dry-run upload. No real environment files or unrelated local edits were uploaded. No Git push was used.
- Candidate and live smoke checks verified the exact application/deployment identity, eight page shells, boot assets, recovery UI assets, and unauthenticated rejection on the letter/campaign APIs and PDF download. The repository's `verify:prod` check also passed on the live domain.
- The candidate was built without switching JU's public domain, checked, then explicitly promoted. No schema, dependency, environment-setting, schedule, or converter-service changes were required. Existing dependency and optional `canvas` warnings remain non-blocking; the hosting build succeeded.
- Evidence: `/tmp/ju-letter-recovery-` files `release.json`, `dry.json`, `deploy.log`, `candidate-smoke.log`, `promote.log`, `live-smoke.log`, `verify-prod.log`, `projects-before.json`, `projects-after.json`, and `projects-after-check.log`.

If rollback is necessary, pause active processing and retain documents, reservations, approvals, return audits, and member receipts. Code rollback does not undo staff-authorized NXT assignments or restore a returned letter's reservation. Reconcile uncertain submissions read-only instead of recreating letters.
