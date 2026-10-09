# Society Letter Workflow Audit

## Findings and Suggested Fixes

The core protections work in the tested scenarios: households are grouped by system IDs, the highest qualifying society wins, saved reviews survive unchanged refreshes, and uncertain NXT submissions are not blindly retried. The main problems are recovery and guidance between stages. This audit concerns the current query-based postal workflow, including saved templates, bulk appeal completion, and the combined print-ready PDF.

Audited application source: `6faec69006e5b2de0edd3809e853d66ac102d10c`, with documentation-only HEAD `3052ffe`. No production settings, constituent records, appeals, or letters were changed. No fixes were deployed.

### 1. Approved Letters Can Become Stuck Without a Safe Return Path

**Priority: P2.** Approval reserves each letter before the automatic NXT checks run. If a genuine communication restriction or an existing appeal then blocks processing, the reservation remains. The interface hides cancellation whenever an appeal receipt exists, even when every member is still pending and no submission has ever been attempted. The server also rejects cancellation for any such receipt. Reserved recipients cannot be edited or excluded from the holding list.

**Reproduction:** Prepare and approve a fictional batch. Keep all member receipts pending, without `attemptedAt`. The batch has neither a cancel action nor an enabled download. Existing backend tests also demonstrate that a restriction discovered after approval stops all writes and leaves the letter reserved. This is a safe stop but an incomplete recovery workflow.

**Suggested fix:** Add a per-letter, permission-checked "Return to review" action only when durable records prove no submission was attempted. Recheck the current record under the existing concurrency lock, preserve the old document and audit history, release only that reservation, and retain the reviewed wording. For uncertain, submitted, or confirmed appeals, require a separate reconciliation path; never silently delete appeals or reset the letter to sendable. Allow an unresolved recipient to be separated from the rest of a batch without losing completed letters.

**Acceptance tests:** A genuinely unattempted letter can return to review. Any member with an attempted, uncertain, or confirmed submission prevents that shortcut. A prior externally recorded acknowledgment becomes an explicit resolved outcome, not permission to create another letter. Household and lower-tier suppression remain intact.

Sources: [cancellation rule](/Users/chelseasantoro/.codex/worktrees/1b6f/anything%202/apps/web/src/app/api/stewardship/society-letters/route.js:714), [hidden cancellation control](/Users/chelseasantoro/.codex/worktrees/1b6f/anything%202/apps/web/src/app/stewardship/society-letters/LetterBatchCard.jsx:141), [reserved recipient exclusion guard](/Users/chelseasantoro/.codex/worktrees/1b6f/anything%202/apps/web/src/app/api/utils/societyLetterWorkflow.js:387).

### 2. Continue Can Stay Disabled After the Problem Is Resolved

**Priority: P2.** The batch runner sets a local `stopped` flag after a failed request or a receipt needing attention. It clears that flag automatically only when an *uncertain* submission becomes resolved. A definite rejection or preflight failure can therefore leave Continue disabled after refreshed saved data shows that the first letter is complete and another letter remains pending.

**Reproduction:** Start a two-letter batch, return a definite `needs_review` result with pending members, then rerender with that letter complete and the second pending. The Continue button remains disabled. No further NXT call is made.

**Suggested fix:** Reconcile the stopped state with newly loaded server receipts and expose "Reload status and continue" for a recoverable stop. Enabling a button must not itself perform writes. Keep uncertain submissions and active rate-limit cooldowns blocked. Reuse the same explicit continuation path for guided batches and bulk recovery.

**Acceptance tests:** A fresh safe receipt state enables an explicit continuation click without remounting the page. A reload alone never writes to NXT. An uncertain submission still cannot be resubmitted.

Source: [runner recovery and stop state](/Users/chelseasantoro/.codex/worktrees/1b6f/anything%202/apps/web/src/app/stewardship/society-letters/PostalBatchApproval.jsx:395).

### 3. Reviewed Does Not Necessarily Mean Ready to Create

**Priority: P2.** Saving recipient review intentionally permits a blank address so staff can return later. However, "Select reviewed households" treats every saved review as ready for document approval. A template that needs that missing address then fails during server-side rendering. The existing missing-address badge helps, but selection and the main action do not use the same rule.

**Reproduction:** Save a fictional reviewed recipient with a blank mailing address. The page selects that recipient and enables "Start document approval." The real Word renderer rejects an address-dependent template with "Add a mailing address in recipient review before previewing this letter."

**Suggested fix:** Keep "Reviewed" as an editorial status and add a distinct, template-aware "Ready to create" state. Check required name and address merge values before selection, using the same rules as the server. Return structured blockers identifying the recipient and exact field. Preserve manual selection, explain any blocked rows, and never silently omit someone from an explicitly approved selection. Do not require blank optional fields such as street line 2.

**Acceptance tests:** Reviewed recipients with missing required fields remain editable and clearly identified, but cannot enter a supposedly ready batch. A template that does not use an optional name field must not be blocked by that field.

Sources: [selection rule](/Users/chelseasantoro/.codex/worktrees/1b6f/anything%202/apps/web/src/app/stewardship/society-letters/page.jsx:760), [actual renderer validation](/Users/chelseasantoro/.codex/worktrees/1b6f/anything%202/apps/web/src/app/api/utils/societyLetterDocuments.js:209).

### 4. Expired Membership Points Staff to the Wrong Screen

**Priority: P2.** The page uses a single readiness error string for source, membership, hierarchy, and appeal-setting problems, then displays "Open appeal settings" for all of them. When membership is more than 24 hours old, changing appeal settings does not solve the problem.

**Reproduction:** Return an expired-membership blocker to the actual page component. The offered appeal-settings action navigates to `?view=appeals`; it does not refresh membership.

**Suggested fix:** Return a structured blocker such as `membership_stale`, `refresh_incomplete`, `appeals_unconfigured`, or `hierarchy_incomplete`. Display one matching next action: "Refresh membership and keep my reviews," "Resume refresh," or "Set up appeals." Preserve unchanged recipient reviews and the user's selection when refreshing. Do not remove the freshness check or start repeated query runs on every page visit.

**Acceptance tests:** Each blocker leads to its own repair action. A membership refresh preserves unchanged reviews and does not apply appeals or send letters.

Sources: [source and policy blockers](/Users/chelseasantoro/.codex/worktrees/1b6f/anything%202/apps/web/src/app/api/utils/societyLetterReadiness.js:32), [generic repair button](/Users/chelseasantoro/.codex/worktrees/1b6f/anything%202/apps/web/src/app/stewardship/society-letters/page.jsx:1488).

### 5. Setup Can Look Complete Before Appeals Are Configured

**Priority: P2, lower urgency.** The checklist counts source, query mappings, saved letters, and sample previews. It does not include the period's letter-sent appeal policy. All four steps can show complete while document creation remains blocked by missing appeal settings.

**Reproduction:** Supply completed source/mapping flags, saved templates, and viewed samples, but no appeal policy. `letterSetupProgress` returns four completed steps and no next step.

**Suggested fix:** Add required letter-sent appeals to setup progress. Show exclusion appeal setup separately when that capability is needed. Label fictional sample previews as layout checks, not delivery authorization. Replace outdated helper text referring to mandatory individual preview or separate per-household approval, since the current workflow supports one batch approval.

**Acceptance tests:** "Setup complete" requires a current period/hierarchy appeal policy for each selected society. A new period clearly requests new appeal verification without forcing template reupload.

Source: [setup progress calculation](/Users/chelseasantoro/.codex/worktrees/1b6f/anything%202/apps/web/src/app/stewardship/society-letters/LetterSetupChecklist.jsx:7).

## How Each Step Should Work Today

| Step | Staff action and expected result | What changes in NXT |
| --- | --- | --- |
| 1. Set up societies and period | Choose the annual societies, their hierarchy, each saved query, and the recognition period. Include every active annual society so the app can choose the highest qualifying letter. | Nothing. Query configuration in the app is not an edit to constituent records. |
| 2. Map query outputs | Load returned field names and map constituent/spouse system record IDs, names, preferred names, separate preferred address fields, and optional organization contacts. Household labels are calculated in the app; a separate household ID column is not required for constituent-query sources. | Nothing. No constituent writes. |
| 3. Save reusable letters and appeals | Upload each society's Word template once, save its merge-field bindings, and preview a fictional sample. Save the period-specific letter-sent appeals; configure exclusion appeals separately. Later replacements create new template versions. | Appeal settings are read and verified; saving configuration does not assign them. |
| 4. Refresh membership | Run all configured society queries and finish the refresh. The app collapses repeated constituent rows, groups spouses by IDs, keeps single individuals, and chooses the highest qualifying society. Incomplete/invalid refreshes must not replace the last complete results. | Read-only query work. No appeals or letters. |
| 5. Use the holding list | Search/filter recipients, leave people waiting, and select up to 50 for recipient review. Nothing is sent by selecting a checkbox. A reviewed person can still need a required merge value; see finding 3. | Nothing. |
| 6. Review recipients | Check addressee, salutation, preferred-name fallback, address, and any organization contact choice. Optionally include the organization in the address block. A single returned candidate is preselected; genuine alternatives remain a staff choice. Use Save & next for bulk review. | Only app-side letter wording is saved. The selected addressee/address owner does not reduce the household's appeal-member list. |
| 7. Exclude someone if needed | From the list or review screen, provide the reason/date and explicitly confirm the exclusion appeal. The person/household stays excluded for the overlapping period, including later higher-tier qualification. The review queue should continue where it left off. | This is an explicit write: the appropriate exclusion appeal/date/reason is applied and verified for the listed members. It is not a letter-sent acknowledgment. Restoration currently requires NXT removal and read-only verification. |
| 8. Choose reviewed recipients for documents | Select up to 10 households for document approval, or a lower configured PDF limit. Choose PDF or Word. New drafts use the current date. Refresh stale membership if requested; unchanged recipient reviews remain valid for up to 15 days. | Nothing. |
| 9. Prepare documents | Click Start document approval, then Prepare documents. Generation proceeds one document at a time, with saved progress. Review previews if desired; opening every document is not mandatory. An unapproved draft can be discarded without losing recipient reviews. | Nothing. Draft preparation does not apply appeals. |
| 10. Approve once | Confirm the prepared documents and their stated appeal updates, then choose Approve letters and continue. The exact documents, template versions, recipients, and dates are saved. This explicit approval starts processing in the current page session. | Approval reserves the letters in the app; the following processing step performs authorized NXT writes. Reopening the page does not silently start writes. |
| 11. Apply and confirm appeals | The app checks the selected households' current records, restrictions, prior appeals, and relationships automatically. It submits the selected society's appeal to each eligible full constituent and verifies each result. A relationship-only spouse can remain in the letter without a nonexistent separate constituent assignment. | Letter-sent appeals are created and read back. Only the appropriate society appeal is assigned; lower-tier coverage is retained in the app without another letter. |
| 12. Resume interrupted work | Keep the page open while processing. If interrupted, use the saved batch or Letter history > Finish saved letters. Bulk recovery can select up to 50 existing unfinished letters, confirms existing submissions, and applies only remaining safe updates. It does not generate another letter. | Read-only verification is automatic. Continuing remaining writes requires explicit authorization; uncertain submissions are never blindly resent. Findings 1 and 2 describe current recovery gaps. |
| 13. Download and print | Once appeal completion is confirmed, download the batch's one print-ready PDF, individual PDFs, or a ZIP. The combined PDF uses the approved order and original saved pages. Print single-sided at actual size. | Nothing. Downloading is not a mail-status update. |
| 14. Mark mailed | After physical mailing, explicitly mark the batch mailed. Keep letter history for re-downloads, household coverage, and audit. New non-overlapping periods may qualify again; higher-tier upgrades follow the society hierarchy. | No additional appeal is created by downloading or marking mailed. Mailing status is recorded in the app. |

### Status Meanings

| Status | Meaning |
| --- | --- |
| In holding | Qualified from the saved membership source, but no new letter is authorized. |
| Reviewed | Recipient choices are saved. This is not document approval or an NXT update. |
| Draft prepared | A private document exists, but the batch is not yet authorized for appeal updates. |
| Approved and reserved | The exact letter is approved and protected against duplicate creation. Appeal work may still be pending. |
| Appeals confirmed | Every applicable member's assignment is verified. The approved letter can be downloaded. This does not prove physical mailing. |
| Mailed | Staff explicitly recorded that the prepared postal batch was mailed. |
| Needs attention | A specific validation, communication, or submission issue prevents further work; it should not require re-reviewing unchanged letters. |

### Important Boundaries

- The 15-day recipient-review window and the 24-hour membership window serve different purposes. A recent review can remain saved while membership still needs a fresh read.
- "Use today's date for all letters" applies to uncreated drafts, preserves recipient reviews, and regenerates date-dependent draft documents. It does not alter approved historical letters or their existing NXT appeal dates.
- The current per-society-query workflow is postal-only. Existing email infrastructure is not the same as supported email delivery for these query lists. Adding query-based email requires a separate reviewed design and tests.
- Review can handle 50 recipients, document approval is capped at 10, and recovery can handle 50 already-created letters. These are different limits, not one shared batch setting.
- One print-ready PDF currently combines a single approved PDF batch, not every batch in history. It is limited to 100 pages and 4 MiB of total source/output bytes. Oversized documents remain available individually; increasing limits safely requires durable background processing/storage rather than simply raising the synchronous limit.
- A failed record can block that batch's combined download. Completed individual letters can still be downloaded separately. A future "Download completed letters" action should list exactly what was omitted instead of silently returning a partial batch.

## Verification and Implementation Order

The focused suite passed **981 existing tests**, with **16 skipped checks**. Five additional temporary audit probes reproduced the five findings above against real React components and the actual Word renderer. These probes assert the current problematic behavior; they are not fixes or proof that the behavior is desirable.

| Area tested | Result |
| --- | --- |
| Query metadata, duplicate rows, reciprocal spouses, individuals, stable grouping | Passed existing tests. No identity inferred from matching names or addresses. |
| Highest society, lower-tier coverage, upgrades, period boundaries, exclusions | Passed existing tests. |
| Preferred names, organization contacts, organization address line, merge mappings, city/state comma | Passed existing renderer and component tests using fictional recipients. |
| Saved review persistence, 15-day expiry, unchanged refreshes, date-only draft updates | Passed existing tests. |
| Bulk review, selection caps, one batch approval, sequential preparation | Passed existing tests; missing-address selection gap separately reproduced. |
| NXT restrictions, uncertain responses, both household members, read-only reconciliation, remaining-member writes | Passed mocked service tests; no live NXT write was attempted. |
| Stored document integrity, combined PDF page ordering, size limits, corrupt input rejection | Passed local tests. |
| Navigation and return from exclusion/review | Passed existing component tests; wrong stale-membership repair action separately reproduced. |
| Recovery after definite failure and return of an approved unattempted letter | Gaps reproduced and documented above. |

Skipped checks were 14 database integration cases, one hosted converter case, and one optional supplied-template sample export. Production database locking, live NXT permissions/response shapes, current saved production mappings/templates, and current hosted PDF font/layout output were not independently revalidated in this audit. The component tests simulate interactions; they are not a live-browser production walkthrough.

Suggested implementation order:

1. Repair the Continue state and add the narrowly scoped, audited return-to-review path. Do not release uncertain or confirmed submissions.
2. Add structured blocker codes, the correct next-action buttons, template-aware readiness, and complete appeal setup progress. Keep review wording and selection through recoverable refreshes.
3. Combine Start document approval and Prepare documents into one user action. Leave the final document/NXT authorization explicit and retain optional previews.
4. Add a durable background queue for larger selections, with per-household checkpoints and clearly identified exceptions. Keep current limits until timeout, concurrency, duplicate-prevention, and PDF-size tests pass.
5. Add a small operational test against explicitly approved fictional NXT sandbox records, plus hosted PDF visual verification, before declaring the revised workflow production-verified.

Local evidence: [existing test log](/tmp/ju-letter-workflow-audit-tests.log), [reproduction log](/tmp/ju-letter-workflow-audit-reproductions.log), [temporary reproduction source](/tmp/ju-letter-workflow-audit-reproductions.test.jsx). To rerun the reproduction source, place it at its original location, `apps/web/src/app/stewardship/society-letters/workflowAudit.test.jsx`, in an isolated checkout; its relative imports expect that location. Remove it afterward because its assertions intentionally describe bugs.

Focused suite command, run from `apps/web`:

```sh
./node_modules/.bin/vitest run societyLetter society-letters societyQuery letterWorkspaceView letterReviewRecovery
```
