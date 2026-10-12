# Society Letter Mail Merge CSV

## Staff Workflow

The postal Letter workspace has a separate **Prefer to merge and print in Word?** panel. Select a society, choose a letter date (defaults to the workspace's current organization date), and download one CSV containing all eligible reviewed households for that society and recognition period. Search filters, table checkboxes, and the 10-document batch limit do not constrain this export. The saved membership source supports up to 5,000 households.

Review names and addresses in the existing recipient editor first. The export reuses saved recipient choices, preferred-name greetings, selected organization contacts, name overrides, and address values. The selected letter date uses the saved template's date format without changing reviewed status or stored dates. Reviews remain valid for 15 days.

The panel reports the eligible count and omitted recipients with reasons. Excluded, already-covered, held, expired/unreviewed, and current document-draft recipients are not exported. Conflicting household/member IDs and incomplete required merge fields are also omitted. One household gets one row at its highest qualifying society, as determined by the existing membership workflow.

Connect the CSV to Word through Mailings, then use native Word merge fields. Export headers include original saved Word field names with their saved bindings as well as canonical application merge fields. Literal typed placeholders are not native Word merge fields. Word controls letterhead, page breaks, and suppression of blank address lines. Preview the merged results before printing.

CSV values preserve quotes, commas, Unicode, line breaks, and leading-zero ZIP codes. Files use UTF-8 with a BOM and quoted RFC 4180 fields. Import ZIP codes and system IDs as text if opening in Excel first. Full reviewed address blocks are preserved; missing component fields are never inferred from manual free-form addresses. If the original template requires individual address components, complete those fields in recipient review before exporting.

## CSV Formatting Choices

The CSV panel supports a letter date plus independent salutation, addressee, date-display, and organization-placement choices. The default greeting is household preferred names, falling back to first names for each person. A single constituent is a one-person household. The default addressee retains reviewed wording. Staff can instead choose household or individual first/preferred names with last names, the selected record's original addressee/salutation, or reviewed wording. Shared last names can appear once or on both names; different last names are never combined. Explicit individual formats use the selected recipient, not the household grouping ID. Missing names do not silently remove a spouse. Organization formats use the already-selected contact; the export never chooses between contacts or adds contacts as appeal targets.

The preview shows exact CSV date, addressee, full address and greeting values for any eligible recipient. Selecting **Save CSV format for this society** saves organization-wide defaults separately from source settings, templates and recipient reviews. The specific date is chosen for each export and is not saved as a permanent default. Format selection changes CSV output only. To preserve individually edited addressees/salutations, choose **Use reviewed wording**. Name-field overrides remain available in preferred-name formats.

For the updated Dolphin Word copy, keep **First_Name (updated Dolphin letter)** as the Word greeting field. That CSV alias now follows the selected salutation format, while canonical individual and household name columns remain available separately. The native Word fields are `letter_date`, `Addressee`, `address`, and `First_Name`. President's Society can use `salutation`, or other templates can keep their saved Word field mappings. No DOCX is silently replaced or uploaded by selecting CSV options.

Organization placement can retain reviewed placement, move the organization to the first line of the full `address` field, or omit it for a contact-only letter. Only exact whole organization lines are moved/removed. Street component columns remain street-only, and NXT address checks continue to use the reviewed physical address. Use the full address merge field for organization placement. If moving/removing the organization would leave no addressee, choose a contact or reviewed placement instead.

Tracked exports freeze the normalized format with their original CSV bytes. Confirmation and read-only manifests recompute with that export's format, never newer defaults. Reserved receipts retain the exported addressee/salutation and CSV-specific full address alongside the unchanged physical mailing address. Older exports with no format keep the original behavior. Existing hierarchy, review age, exclusions, duplicate prevention, live appeal checks, and mailing confirmation are unchanged.

Implementation adds `csv_formats JSONB NOT NULL DEFAULT '{}'` to `stewardship_letters` through the existing additive initializer. `save_csv_format` uses existing staff authorization, same-origin protection and revision/lease checks; it never contacts NXT. Changing defaults does not alter the source signature or invalidate recipient reviews. No new service, converter setting or environment variable is needed. On rollback, leave the additive column and saved CSV records intact.

Local validation on October 12: 6,585 tests passed, including 31 isolated PGlite database tests; the existing 193 opt-in tests remained skipped. Typecheck, production build, and whitespace checks passed. The focused CSV suite passed 260 tests, covering old exports, format persistence, mixed surnames, preferred-name fallback, organization placement, exact updated Word field names, changed-value rejection and both household appeal targets using simulated NXT. A localhost-only component preview with fictional records was inspected at desktop and 390-pixel phone widths; no horizontal overflow was found. The local preview did not call app APIs. Evidence: `/tmp/ju-csv-format-final-tests.log`, `/tmp/ju-csv-format-final-focused.log`, `/tmp/ju-csv-format-final-typecheck.log`, and `/tmp/ju-csv-format-final-build.log`. These changes are not yet deployed. The user-supplied updated Dolphin DOCX was inspected read-only; neither it nor the live stored template was replaced. Native Word merging and live NXT writes were not executed.

## CSV Formatting Deployment, October 12

Deployed commit `ce3506bf2502de7b7c8029fb73a6d7c82e1cdc64` to JU project `mgo-gpt` only. Production deployment `dpl_ERS6Kv9pmmGd2wdGu5UWbUYs9SLf` (`https://mgo-9yqclwhs2-chelspers-projects.vercel.app`) was promoted to `https://www.jumgogpt.app` after candidate checks passed. Rollback: `dpl_5RftrEt5MMXBWi4tA14vuQaN4Heb`, commit `a7313f8e0adbd18684e08fb758f569504d3e133a`. Leave the additive `csv_formats` column and saved CSV records intact if rolling back.

Fresh release validation passed 6,585 tests, with 193 existing opt-in skips, including the isolated PGlite database suite. Typecheck, production build, release-worktree and whitespace checks passed. An isolated Git archive matched all 1,251 tracked web files; the 1,382-file upload manifest contained all 17 intended changed files and no real environment files, services, build output or dependencies. No Git push was performed.

Candidate and live checks verified the exact SHA/deployment, eight page shells, client assets, new format controls and preserved CSV/PDF features. Unauthenticated reads/writes remained 401; cross-site mutations, including `save_csv_format`, remained 403. The version-reload endpoint passed valid, invalid-version and cross-site checks. A cookie-free production verifier passed. The separate synthetic old-version-pin check correctly detected that Vercel still serves the previous deployment when explicitly pinned; explicit latest routing worked. Do not describe pinned sessions as automatically current.

An authenticated browser tab loaded the saved workspace before promotion. After promotion it showed the existing **Load latest version** banner. Browser automation stalled at the reload confirmation and later timed out on state/cleanup calls, so a signed-in post-release check of the new controls could not be completed. Browser verification did not save formatting defaults, refresh membership, export real donor data, change templates/reviews/statuses, submit appeals or send letters. Native Word merging and live NXT writes remain outside this deployment verification.

The all-project comparison found the intended JU deployment change and a concurrent, separate CLI deployment of project `prj` (`prj_CzI0O8pL2H0OVD9XdWyvDm9cq6xn`, `dpl_ACcs8tzwP12sURfuZE5gjnmMi3fm`). That project was not modified by this release. Sandbox stayed at `dpl_GZ5Xb6o8Fo7NkhqkrkRXBFhZNSMW`; other project identities and recorded configuration/Git links/cron/PDF settings were unchanged. The strict all-project assertion reported the independent PRJ change rather than being bypassed.

Evidence: `/tmp/ju-csv-format-deploy-` files `release.json`, `dry.json`, `tests.log`, `typecheck.log`, `build.log`, `candidate.log`, `candidate-smoke.log`, `promote.log`, `live-smoke.log`, `current-verification.log`, `production-verification.log`, `projects-before.json`, `projects-after.json`, and `concurrent-project.log`.

## Export Boundaries

- This is a saved-data export, not a live NXT communication or delivery check. The panel shows the last membership refresh time.
- Export does not create a reservation, letter batch, appeal assignment, delivery receipt, or mailed status. It does not call NXT or the PDF converter.
- Repeated downloads can include the same households. Use the tracked workflow below when recording externally created letters; a read-only download cannot retrospectively identify what was printed.
- Existing PDF/Word approval, appeal reconciliation, and downloads are unchanged. Their existing limits still apply.
- A tracked CSV is an additional opt-in workflow. The original read-only export retains its no-write behavior.

## Tracked CSV Workflow

1. Choose **Save tracked CSV & download**. This saves the exact CSV, its digest, recipient manifest, society, template version, and letter date. It does not reserve recipients or change NXT.
2. Merge in Word and check the results. In **Saved CSV exports** (available in Letter workspace and Letter history), open that export and select only the households whose letters were actually created. Selection is limited to 50 at a time for safe appeal processing; the CSV itself still exports all eligible households, up to 5,000.
3. Check the creation confirmation and select **Confirm letters created & apply appeals**. The app checks that the saved merge data is still valid, reserves the selected letters atomically, and uses the existing NXT reconciliation worker to apply missing society appeals to each applicable household constituent. A relationship-only spouse that is not a constituent retains the existing not-applicable receipt handling. Only the highest qualifying society's appeal is assigned; lower-tier coverage stays in the existing letter history.
4. After physical dispatch, open **Letter history**, select completed CSV letters, and confirm **Mark selected letters mailed**. No recipients are selected for mailing by default. Partial completion is supported: unresolved letters stay prepared while selected completed letters are marked mailed with user/time audit.

The app cannot verify an external Word document's contents. Staff explicitly attest that they created and checked the selected letters using this saved CSV. The merged Word/PDF file remains outside the app; CSV history never offers a newly rendered replacement document or claims to store that external file. Re-downloads return the original CSV, including any recipients already created or mailed, with a duplicate-mailing warning.

Changed merge fields, names, addresses, membership, template, exclusions, periods, or expired reviews block new confirmation rather than silently applying appeals to a different letter. An unchanged membership timestamp refresh does not invalidate the export. Existing membership freshness, appeal configuration, live NXT checks and uncertain-submission protections remain in force. An interrupted confirmation reuses its saved reservations. Resume unfinished updates in Letter history; nothing resumes on page load without confirmation.

Before any NXT submission attempt, a CSV letter can return to review. Its old tracked export cannot confirm that recipient again; correct the details and download a new tracked CSV. Any attempted or uncertain write remains protected against automatic cancellation and duplicate submission.

### Implementation

- Additive table `stewardship_letter_csv_runs` stores immutable JSON payloads and lightweight summaries. Existing schema initialization creates it without changing existing tables or records. No new environment variables, converter deployment, or NXT permissions are required beyond existing appeal access.
- `create_csv_run` and `confirm_csv_letters` require the existing staff role, same-origin validation, revision/lease protection, and explicit confirmation for creation. `GET ?csvRun=<id>` returns the authorized recipient manifest; `&format=csv` downloads verified saved bytes using private/no-store headers.
- `csvMailMerge` on existing delivery receipts records the export ID/digest and creation attestation (user/time). `finish_selected_letter_appeals` handles member checks/writes and recovery without new transport code. `mail_selected_csv_letters` uses exact receipt/manifest comparisons and atomic selected-only dispatch updates.
- Document download and completion validators remain separate: a CSV receipt is not proof of an app-generated PDF. Existing PDF/Word documents continue to require their saved bytes and original approval safeguards.
- Local tests cover real workspace export/confirmation, stale values and membership, exact selection, lost-response retries, both household appeals, role/CSRF boundaries, no document fallback, UI confirmation/pagination/stop behavior, and isolated PGlite storage/mailing/correction races. No live donor changes are made by these tests.

Local verification on October 12: 6,542 tests passed, including all 30 isolated PGlite letter-store tests and the full screen-level tracked export/creation/appeal/mailing sequence. The existing 193 opt-in tests remain skipped; no live-service tests were enabled. Typecheck, production build, and whitespace checks passed. Evidence is in `/tmp/ju-tracked-csv-tests.log`, `/tmp/ju-tracked-csv-typecheck.log`, and `/tmp/ju-tracked-csv-build.log`. Deployment verification is recorded below; no live appeals, letters, or mailing statuses were changed during verification.

## Developer Notes

`POST /api/stewardship/society-letters` accepts `action: export_merge_csv` in the read-only branch before workflow lease acquisition. The existing staff authorization, same-origin checks, body-size limit, private/no-store headers, and nosniff response handling apply.

The request contains the displayed workspace revision, period key, society key, ISO letter date, and full eligible household ID set. The server reloads the saved workspace and recomputes eligibility. Stale revisions, changed periods or eligible sets, duplicate IDs, and excess source capacity fail without producing a partial CSV. The operation does not acquire a workflow lease or write application state.

`src/utils/societyLetterCsvExport.js` provides the shared eligibility/column plan. `src/app/api/utils/societyLetterCsvExport.js` serializes that plan. The plan reuses `letterMergeData` and `letterMergeBlockers` to keep saved merges consistent with document rendering. Date formatting is computed once per export rather than per recipient.

Original Word field aliases take precedence. Canonical or metadata column collisions receive an `app_` prefix; conflicting case-insensitive aliases fail setup validation. Metadata includes household/member IDs, selected constituent/address-source IDs, society, recognition period, template version, and membership refresh timestamp.

Formula-like values and disallowed control characters are omitted with an explicit reason. The export never adds hidden apostrophes or silently rewrites approved wording to escape spreadsheet formulas.

Tests cover 5,000-household exports, saved-value/rendering parity, joint and organization addressing, omissions, field aliases/collisions, CSV round trips, stale requests, authorization, UI single-flight behavior, unchanged PDF controls, and real-workspace review expiry. Tests use fictional data only.

## October 12 JU Release

- Application SHA: `563d2c393af28ce33a555360064f8b8e64d7cbed`.
- JU deployment: `dpl_BNZNaFcH8jMgGPDBWrDMMzqapiJT`, candidate `https://mgo-ic77mu4m3-chelspers-projects.vercel.app`, live `https://www.jumgogpt.app`.
- Rollback: `dpl_6AdSzTU3PovRpvJog78s9YBsbHVp`, application SHA `78e188f8b7e17915dcd369354d4349cfb8681e0e`.
- Release verification: 6,483 tests passed, including 26 isolated PGlite database tests; 193 opt-in tests skipped. Typecheck, release-worktree guard, whitespace check, hosted production build, and the repository's production verifier passed. Existing dependency deprecation, install-script policy, and optional `canvas` resolution warnings remained non-blocking.
- An isolated Git archive matched all 1,241 tracked web files. Dry upload verified all 13 intended release files among 1,372 total files, with no real environment files. No Git push was used and unrelated worktree changes were not packaged.
- Candidate and live smoke checks confirmed the exact SHA/deployment, eight page shells, referenced JavaScript assets containing both CSV and existing PDF controls, unauthenticated API rejection, CSV cross-site rejection, and synthetic old-version recovery. No authenticated exports, NXT queries/writes, letter approvals, downloads of real letters, sends, or mailing-status changes were performed.
- The sandbox remained `dpl_2L2K7Y8vFuJPw87orsVjdjCoVii8`. No project settings, Git connections, schedules, or PDF settings changed. The strict all-project identity comparison flagged an independent concurrent CLI deployment on `lotura-ju-pilot`: `dpl_8r5rnPgjXSmrsZKev9LNSX2uUj4X`, commit `ca1282e597e2e0b300997d1bcd78dffe8ffc0682`, project `prj_DdASIYnIZWIqlayZTgH29A4TRVCJ`. It was inspected read-only and left untouched; all remaining non-JU project identities were unchanged.
- This release requires no schema migration, new environment variables, or converter deployment. CSV export is read-only; external merge-completion tracking and appeal confirmation remain future work.

Release evidence uses the `/tmp/ju-letter-csv-deploy-` prefix: `tests.log`, `typecheck.log`, `release.json`, `dry.json`, `candidate.log`, `candidate-smoke.log`, `promote.log`, `live-smoke.log`, `production-verification.log`, and the before/after project snapshots. The strict comparison exception is retained in `after.log` rather than overwritten as a pass.

## October 12 JU Tracked CSV Release

- Application SHA: `179eb5e23e2be6b6978a5cdf53f4cb0293557f0b`.
- JU deployment: `dpl_m5NCNEksqyYvWcEYfD1fYEZJJ5cn`, candidate `https://mgo-5my0qbip4-chelspers-projects.vercel.app`, live `https://www.jumgogpt.app`.
- Rollback: `dpl_BNZNaFcH8jMgGPDBWrDMMzqapiJT`, application SHA `563d2c393af28ce33a555360064f8b8e64d7cbed`. The additive CSV-run table can remain if application rollback is needed; do not delete saved exports or receipts.
- Fresh release checks passed: 6,542 tests, including 30 isolated PGlite storage tests; 193 opt-in tests skipped. Typecheck, release-worktree guard, whitespace check, hosted production build, and production identity/assets verifier passed. Existing dependency deprecation, install-script policy, and optional `canvas` warnings remained non-blocking.
- The isolated archive matched all 1,248 tracked web files. Dry upload verified all 25 intended release files among 1,379 uploaded files, without real environment files. No Git push was used and unrelated working-tree changes were excluded.
- Candidate and live checks verified the exact release identity, eight page shells, published assets with old and new letter controls, unauthorized GET/POST rejection, cross-site rejection for all three new mutations, and synthetic old-version recovery. These checks made no authenticated writes.
- An authenticated, read-only browser check loaded the saved production workspace successfully with the new schema-backed state. Selecting Order of the Dolphin enabled **Save tracked CSV & download** for the eligible reviewed recipient. No export was created or downloaded and no recipient data, appeals, or mailing statuses were changed. Saved CSV confirmation and dispatch were exercised with fictional data in automated tests, not live donors.
- The strict before/after project comparison passed: only JU's production identity changed. Sandbox remained `dpl_2L2K7Y8vFuJPw87orsVjdjCoVii8`; other projects, Git connections, project settings, cron schedules, and PDF settings were unchanged.
- The existing schema initializer adds `stewardship_letter_csv_runs`. No destructive migration, new environment variables, additional NXT permissions, or converter deployment was needed.

Tracked-release evidence uses the `/tmp/ju-tracked-csv-deploy-` prefix: `tests.log`, `typecheck.log`, `release.json`, `dry.json`, `candidate.log`, `candidate-smoke.log`, `promote.log`, `live-smoke.log`, `production-verification.log`, `after.log`, and the before/after project snapshots.

## October 12 CSV Workflow Audit

The following usability fixes were deployed to JU as `a7313f8e0adbd18684e08fb758f569504d3e133a`. Release evidence and remaining verification limits are recorded below.

### Step By Step

1. Review and save recipient choices in the holding list. CSV includes only eligible reviewed households for the selected society, not every query result. Exclusions, higher-tier coverage, existing reservations, expired reviews, and missing required fields remain protected.
2. Select the society and letter date, then use **Save tracked CSV & download** if appeals and mailing will be recorded later. The plain download remains read-only and cannot establish an immutable list for later creation confirmation. Export itself does not contact NXT, reserve letters, or mark anything mailed.
3. Merge in a local Word copy using native Word merge fields that match the CSV headers. This is a separate engine from the app's renderer: app tags, a plain Date label, and typed guillemets do not become native Word fields just by attaching the CSV. Use the reviewed full `address` value when preserving manually edited address blocks. Prepare the reusable Word copy before the main production run. Do not replace the app's saved template after exporting without obtaining a new tracked CSV.
4. Open the saved export and select only the letters actually created and checked. Confirm up to 50 at a time; this is an appeal-processing limit, not a CSV export limit. The app checks the immutable export against current saved data and reserves the complete selected set before any NXT writes.
5. Missing appeals are applied to each applicable household constituent through the existing worker. Both members are retained for joint letters. An uncertain submission is read back before any continuation; it is never blindly sent twice. Record-specific conflicts do not prevent other households finishing. NXT throttling pauses the selection rather than moving on with additional requests.
6. After physical dispatch, select completed CSV-created letters in **Letter history** and confirm **Mark selected letters mailed**. Incomplete letters remain prepared. No app-generated PDF/Word document is claimed for an external Word merge.

### Findings And Fixes

- Reproduced three missing early-feedback cases: expired recipient review, changed saved merge fields, and missing appeal setup. The saved-export picker previously checked only the broad row status, so it could offer these recipients and leave the rejection until confirmation. A read-only manifest now reports changed-export reasons; the picker also checks current CSV eligibility, explains blocked rows, and offers the existing setup/refresh action where appropriate. Server confirmation still revalidates under the lease.
- Added **Refresh saved CSV status** to reload current saved records and the manifest without NXT writes. Existing reservations remain resumable rather than being rejected simply because the original export's recipients are now held.
- Preserved specific server errors inside the CSV controls instead of replacing them with generic confirmation/save failures. Tested successful save plus failed download, lost save response, and stale-revision rejection. Recovery reloads the saved export and downloads the original without creating a second export.
- Clarified the Word date-field requirement and singular household counts. The original supplied OOD DOCX structurally contains native addressee/address fields but a plain Date label and a typed `First_Name` greeting placeholder. Those require native fields in the external Word copy. No Word template or letter wording was changed by this audit.

### Evidence And Limits

- Live, read-only downloads passed for both societies: one OOD row and three President's Society rows were eligible at audit time. CSV parsing found no errors; rows were unique by household, all required name/date/address values were populated, the full address retained the city/state comma, and both single-record and joint households were represented. No tracked export, letter reservation, appeal assignment, or mailing change was created during live checking.
- New tests use the actual CSV reservation, finalization/reconciliation, and selected-dispatch validation functions with a simulated NXT transport. They cover both spouses, compact appeal comments, duplicate prevention, lost write responses both with and without a saved NXT assignment, throttling, a conflicting prior appeal, and independent completion of another household. UI tests cover failed downloads, lost save responses, stale exports, early blockers, and read-only refresh.
- Full local verification: 6,554 tests passed, including all 30 isolated PGlite letter-store tests; 193 existing opt-in tests remained skipped. Typecheck, production build, and whitespace checks passed. Logs: `/tmp/ju-csv-audit-tests.log`, `/tmp/ju-csv-audit-typecheck.log`, `/tmp/ju-csv-audit-build.log`; reproduced failures before fixes: `/tmp/ju-csv-audit-repro.log`.
- A native Word merge/print was not executed, and live NXT write permissions or end-to-end appeal writes were not exercised on donors. The full saved-template browser download was not verified. These are verification limits, not claims that external Word or NXT can never fail. The recommended next step is to prepare and verify CSV-ready Word copies for both societies, then conduct one explicitly authorized tracked pilot before a large mailing.

## October 12 JU CSV Usability Release

- Application SHA: `a7313f8e0adbd18684e08fb758f569504d3e133a`.
- JU deployment: `dpl_5RftrEt5MMXBWi4tA14vuQaN4Heb`, candidate `https://mgo-aji3bvecp-chelspers-projects.vercel.app`, live `https://www.jumgogpt.app`.
- Rollback: `dpl_m5NCNEksqyYvWcEYfD1fYEZJJ5cn`, application SHA `179eb5e23e2be6b6978a5cdf53f4cb0293557f0b`. This release adds no schema or environment changes.
- Fresh verification passed: 6,554 tests, including all 30 isolated PGlite letter-store tests; 193 existing opt-in tests skipped. Typecheck, local and hosted production builds, release-worktree guard, and whitespace checks passed. Existing dependency deprecation, install-script policy, and optional `canvas` warnings remained non-blocking.
- The isolated archive matched all 1,248 tracked web files. Dry upload verified all 10 intended changed files among 1,379 uploaded files, without real environment files. No Git push was used; unrelated working-tree changes were excluded.
- Candidate and live checks verified exact release identity, eight page shells, valid JavaScript assets containing the new saved-status refresh and existing CSV/PDF controls, unauthenticated rejection, cross-site mutation rejection, and synthetic old-version recovery. The repository's production identity/assets verifier also passed.
- The authenticated browser loaded saved records read-only and offered the new-version banner after promotion. Its safe reload confirmation could not be completed reliably through browser automation; Chrome use interrupted the final check. No browser bypass or credential change was used. A final authenticated view of the new controls remains unverified; the deployed asset markers and automated UI tests passed. Use **Load latest version** before working from an already-open older tab.
- No live tracked exports, reservations, appeals, sends, or mailing-status changes were made by release verification. Native Word merging and live appeal writes remain outside these checks.
- The strict project comparison flagged a concurrent CLI deployment on `lotura-ju-pilot`: `dpl_FXyMdrWyFeJHtFWYQHiHzAPfoAEs`, project `prj_DdASIYnIZWIqlayZTgH29A4TRVCJ`. Safe metadata was inspected read-only and that project was left untouched. Only JU and that separate project's production identities differed; all project settings, Git connections, schedules, and PDF settings were unchanged. Sandbox remained `dpl_2L2K7Y8vFuJPw87orsVjdjCoVii8`.

Local test evidence: `/tmp/ju-csv-usability-tests.log`, `/tmp/ju-csv-usability-typecheck.log`, and `/tmp/ju-csv-usability-build.log`. Deployment evidence uses `/tmp/ju-csv-usability-deploy-`: `release.json`, `dry.json`, `candidate.log`, `candidate-smoke.log`, `promote.log`, `live-smoke.log`, `production-verification.log`, and project snapshots. The strict comparison exception remains in `after.log`; independent deployment metadata is in `concurrent-project.log`.
