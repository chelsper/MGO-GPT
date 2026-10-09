# Society Letter Recovery

## Appeal Comment Length Follow-Up (Not Deployed)

The October 9, 11:24 AM report is a different failure from the state-name comparison. Read-only inspection of the active saved letter showed an HTTP 400 during the first member's appeal POST; the second member was not attempted. Both complete constituent appeal lists were read and neither contained the configured appeal. The approved letter remains saved. Runtime logs and the sanitized receipt did not retain the provider's raw validation text, so no exact provider message is claimed.

The generated appeal comment was 150 characters. Blackbaud's [Raiser's Edge Import Guide, Constituent Appeal Fields, printed page 134](https://help.blackbaud.com/docs/0/assets/guides/re/import.pdf#page=140) documents a 50-character limit for `CAPComment`. This is a concrete request incompatibility consistent with the HTTP 400. The [Data Integration create contract](https://developer.sky.blackbaud.com/api#api=nxt-data-integration&operation=CreateConstituentAppeal) was also checked; the date, integer constituent ID, and description field shapes remain unchanged.

- Newly approved letters store a 45-character `JUMGOGPT <full letter UUID>` NXT comment. The full audit note remains in the saved receipt, alongside the existing period, date, document, approval, and household metadata.
- Explicit continuation of an existing letter first reconciles NXT history. Only an untouched or definitively rejected pending member with the exact app-generated legacy note can receive the compact comment. The original shared note stays unchanged. The exact `submittedComments` is saved per member before POST and used for subsequent read-back/reconciliation.
- Confirmed or uncertain legacy assignments are checked against their original text. Ambiguous submissions are never retried, third-party assignments are not adopted, and arbitrary user comments are never silently truncated. Successful members are not resubmitted. The approved document is not regenerated or reapproved.
- Shared transport rejects comments longer than 50 before a request. New NXT-linked exclusions enforce the same limit in the server and dialog; app-only reasons keep their 500-character limit. An old overlong exclusion reason is retained and blocked before a new uncertain marker or POST, rather than truncated.
- Verification: adding the real comment limit to the fictional NXT client reproduced 17 failing finalization tests before the fix. All 161 focused tests and all 6,255 default tests passed afterward; 210 existing opt-in tests remained skipped in the default run. The 17 society-letter database checks separately passed with isolated in-memory PGlite, including per-member comment persistence across leases and unchanged frozen letter data. Native multi-process PostgreSQL behavior and live NXT writes were not exercised. Typecheck, production build, release check, and whitespace checks passed.
- No production data, letters, appeals, settings, or deployments were changed during this investigation. After deployment, reload and continue the existing approved batch; do not recreate or re-review it solely for this comment-length failure. Final acceptance still requires the user's explicit live continuation.

Evidence: `/tmp/ju-letter-comment-` logs `red.log`, `focused.log`, `full-tests.log`, `database.log`, `typecheck.log`, and `build.log`. Read-only diagnosis: `/tmp/ju-letter-appeal-readonly.log`. These local diagnostic files are not release inputs.

## State-Name Address Comparison Follow-Up (Deployed October 9, 2026)

The October 9, 10:59 AM failure for Allana Forte and Brian Branch was traced read-only to the saved query using `Florida` while NXT's preferred addresses use `FL`. Street, city, and ZIP matched; both preferred addresses belonged to the expected household members and were active, unrestricted, and current. No appeal had been attempted. Returning the letter to review could not resolve that equivalent-text mismatch.

- The address comparator now accepts the full name or two-letter abbreviation for the same US state (including DC), only when NXT explicitly identifies the country as the United States. It generates alternatives from NXT's structured state field, not a global replacement in the street, city, or saved letter. The mappings follow [USPS Publication 28, Appendix B](https://pe.usps.com/text/pub28/pub28apb.htm).
- Street, unit, city, ZIP/ZIP+4, and nonempty country text still must match. Foreign/unknown-country addresses keep the existing exact comparison. Ownership, inactive/invalid/do-not-mail flags, dates, seasonal restrictions, consent, household links, and prior appeals retain their existing checks.
- The saved document, recipient review, approval, date, and wording are never rewritten. After deployment, reload the page and continue the existing approved batch; do not choose Fix recipient details solely for the old Florida/FL warning. Continuing performs the normal fresh NXT checks and applies only missing appeals after explicit confirmation.
- Four new regression cases failed before the fix and passed afterward. All 218 focused comparison/readiness/finalization tests passed, including Word/PDF recovery that preserves the approval and stored document while submitting each household member exactly once in a mocked NXT client. The full default suite passed 6,232 tests; 210 existing opt-in tests remained skipped. Typecheck, production build, and whitespace checks passed.
- A second read-only comparison against the affected saved letter and current NXT profiles confirmed the new comparator matches both addresses. No constituent, appeal, approval, delivery, database setting, or deployment was changed. Evidence: `/tmp/ju-letter-state-address-` logs `red.log`, `tests.log`, `full-tests.log`, `typecheck.log`, and `build.log`; diagnostic summary `/tmp/ju-letter-address-diagnosis-verified.log` omits street addresses and credentials.

### Verified JU Release

- Application commit: `6253225fa6debfe284204afdd8eaf640f373f24e`; deployment: `dpl_AnFrXKBYQmhjCn4jSjjaUSYZfonQ`; live site: `https://www.jumgogpt.app`.
- Released from a clean Git archive pinned to JU project `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`, effective root `apps/web`. All tracked web files matched the tested worktree. The 218 targeted tests passed again from the clean archive. A fresh upload manifest contained all changed web files, no untracked extras, and no real environment files. No Git push was used.
- Hosted build, candidate smoke checks, promotion, live smoke checks, and `verify:prod` passed. Version identity, reporting/stewardship route shells, letter assets, and unauthenticated API/download protections were verified. This release has no schema change; existing opt-in database tests were not rerun. No authenticated letter processing, appeal submission, or email send was used as a smoke test.
- Before/after project checks confirmed only JU's production deployment identity changed. The conference sandbox remained on its pre-release deployment `dpl_7V2ov7148y67Fc6t7d6WS6rx3CHh`; project settings, cron definitions, PDF settings, and other projects were unchanged.
- Reload the browser page, then use **Create approved letters and apply appeals** for the existing approved batch. Do not return to review or recreate the letter solely for the old state-name mismatch. Genuine restriction or address changes still require correction.
- Previous JU deployment for rollback: `dpl_9civc1CHxJ9nWFxAaeTYMdWPW4TA` (application commit `d4eada41023703aa262ffdea6f4f268516670487`). Evidence: `/tmp/ju-letter-state-address-` files `release-tests.log`, `dry-final.json`, `candidate.json`, `deploy.log`, `candidate-smoke.log`, `live-smoke.log`, and `project-verification.log`.

## In-Progress Navigation Follow-Up (Deployed October 9, 2026)

The October 9 screenshot showed a pending bulk appeal confirmation. That intentionally disables other mutations, but the inline confirmation looked like ordinary page content, making the remaining controls appear broken. Saved address warnings are separate readiness failures; this change does not relax them or infer that the addresses are incorrect.

- Bulk confirmation now uses an accessible modal with a visible Back to selection action, initial focus on that action, and Escape support before processing. While a request runs, the existing Stop after this household action remains available instead of silently dismissing the request.
- A batch-level attention panel links to saved receipts. For an approved letter with no submission evidence, Fix recipient details confirms the existing safe return operation and opens the recipient editor with its saved wording. Other letters remain saved; attempted, uncertain, or confirmed submissions cannot use this shortcut.
- Unsuccessful bulk results link directly to the corresponding letter, expanding its details and moving keyboard focus. A stopped operation offers an app-side Reload saved status action that never resumes NXT writes automatically.
- Verification: 114 focused UI tests passed, the full default suite passed 6,196 tests with 210 existing opt-in tests skipped, and typecheck and production build passed. The full default suite, typecheck, and build also passed from a clean release archive. Desktop and 390px mobile browser checks used fictional recipients and mocked requests only. No live NXT, database, appeal, or letter changes were made during verification.

### Follow-Up Release

- Application commit: `d4eada41023703aa262ffdea6f4f268516670487`.
- JU deployment: `dpl_9civc1CHxJ9nWFxAaeTYMdWPW4TA`, candidate `https://mgo-eep5eovk3-chelspers-projects.vercel.app`, live `https://www.jumgogpt.app`.
- Previous JU / rollback target: `dpl_8k7bLMAe6zsvmtrtR5vLCYQmBLFi`, commit `621bb9fcc90accf0b10039305b2d056cd4a44bad`.
- The clean archive matched all 1,211 tracked web files. The 1,333-file upload contained all changed application files, no untracked files, and no real environment files. Unrelated local changes were excluded. No Git push was used.
- The candidate was built without changing the live domain, smoke-tested, then promoted. Candidate and live checks verified the exact version/deployment, page shells, boot assets, the new letter-recovery controls, and unauthenticated rejection of protected APIs and PDF downloads. The repository production verifier passed.
- Sandbox remained `dpl_BrAqKBRfj5ZTYBmDUJ22NeYKteiq`. All other project deployment identities, Git connections, cron definitions, and PDF-setting metadata were unchanged. No database, environment, dependency, or converter-service changes were required.
- Evidence: `/tmp/ju-letter-history-` files `release.json`, `release-tests.log`, `release-typecheck.log`, `release-build.log`, `dry-final.json`, `candidate.json`, `deploy.log`, `candidate-smoke.log`, `promote.log`, `live-smoke.log`, `verify-prod.log`, `projects-before.json`, `projects-after.json`, and `projects-after.log`.

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
