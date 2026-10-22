# Bulk completion of saved society-letter appeals

Status: deployed to JU and verified on 2026-10-08. Sandbox unchanged.

## Staff workflow

In Stewardship > Society Letter Creation > Letter history, use **Finish saved letters**. Search or filter history, select individual unfinished letters or up to 50 matching letters, then choose **Finish updates for selected letters** and confirm once.

The app checks NXT and applies only remaining member updates using each saved letter's appeal, date, and comments. It does not create another letter, change its approval, email it, or mark it mailed. Existing PDF batch downloads become available when every required appeal in that batch is confirmed. A partly completed batch remains protected; individual completed letters retain their existing download options.

Record-specific conflicts appear under **Needs attention**, while other selected letters can finish. Connection failures and Blackbaud cooldowns pause the selection without automatic retry. Staff can stop after the current household. Closing or leaving the page stops further households, but an in-flight household may finish. Reopening history never resumes writes without another confirmation.

## Implementation and safeguards

- `BulkLetterAppealUpdates.jsx` runs sequential requests, with a 50-letter selection bound. Selection applies to matching individual letters, not hidden recipients from another matching batch. Other workspace mutations and automatic verification pause during confirmation and execution.
- POST action `finish_selected_letter_appeals` uses existing reviewer-only authorization, same-origin checks, revision guards, and the stewardship lease. Automatic write requests are rejected. Each request checks the full selection and processes one selected saved delivery ID.
- `societyLetterBulkAppeals.js` loads saved delivery records; browser-supplied appeals and member details are never used. Complete receipts are skipped only when the underlying required members are settled. Frozen documents are hash/size checked through `savedPostalDocument` before further updates.
- `syncLetterAppeals` retains current period, hierarchy, policy, household, communication restriction, and duplicate-appeal checks. Exact saved submissions are reconciled from NXT before pending members are posted. Unconfirmed earlier submissions are not replayed. Relationship-only spouses retain existing handling.
- Per-member intent is durably saved before each NXT write, followed by assignment-ID and read-back checkpoints. Recovery never reserves another delivery or regenerates a document. No schema migration or new external service is needed.
- API responses include a structured `bulkAppealUpdate` outcome. Missing, mismatched, or failed responses stop the client. Transport/authentication/service/quota failures stop the selection; record-specific validation conflicts can be left for staff while the remaining selection proceeds.

## Verification

- Full suite: 6,128 passed; 207 existing opt-in/database/service tests skipped.
- Typecheck, production build, and `git diff --check` passed.
- Regression coverage includes accepted-but-timeout reconciliation, remaining spouse only, current revisions across batches, preserved approved documents, invalid selections, authorization, automatic-write rejection, damaged documents, service pauses, stop/unmount, and PDF download unlocking.
- Desktop and 390px mobile verified using a local fictional fixture, including confirmation and completed PDF availability. No horizontal overflow at 390px.
- No production constituent records, appeals, letters, email, settings, or sandbox deployments were changed during testing.

This extends recovery for existing letters only. The document-generation batch limit and combined-PDF batch scope are unchanged.

## JU production release

- App commit: `6faec69006e5b2de0edd3809e853d66ac102d10c`.
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` (`mgo-gpt`), root `apps/web`.
- Deployment: `dpl_C4J7rnmijkr2n6rW74FUdeyi4VTX`.
- Candidate: `https://mgo-qxxan75v9-chelspers-projects.vercel.app`.
- Live: `https://www.jumgogpt.app`.
- Rollback deployment: `dpl_BHQ1AB7TteurAkeY2YQs49v7i1Ln`, app commit `369ad8eff2e6e12def61fc3e626f18984cc79b26`.
- Sandbox before and after: `dpl_8AEQhpBHwgFJvQ7zaeYd9qcATSff`. All other project deployment identities, Git links, cron definitions, and PDF setting metadata compared unchanged.
- Fresh release checks: 6,128 tests passed, 207 existing tests skipped; typecheck, build, release-worktree check, and whitespace checks passed.
- Deployment used a clean Git archive with all 1,201 tracked web files byte-compared to the tested workspace. Unrelated local edits and untracked files were excluded. No Git push was used.
- The candidate was built without assigning the JU public domain, smoke-tested, and explicitly promoted. Both candidate and live checks verified the exact app SHA/deployment identity, eight page shells, boot/letter assets containing the new bulk action and existing print-ready PDF action, and authentication rejection for letter/campaign APIs and PDF downloads.
- No authenticated query refresh, letter approval, send, or NXT write was performed by release verification. No data migration, new hosting service, or environment-setting change was required.
- The existing optional `canvas` dependency warning remains non-blocking; the Vercel build completed successfully.

Local release evidence is saved under `/tmp/ju-bulk-appeals-*`, including test/build logs, package inventory, dry-run inventory, candidate/live smoke results, promotion output, and project comparisons.
