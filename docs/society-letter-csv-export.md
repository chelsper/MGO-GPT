# Society Letter Mail Merge CSV

## Staff Workflow

The postal Letter workspace has a separate **Prefer to merge and print in Word?** panel. Select a society, choose a letter date (defaults to the workspace's current organization date), and download one CSV containing all eligible reviewed households for that society and recognition period. Search filters, table checkboxes, and the 10-document batch limit do not constrain this export. The saved membership source supports up to 5,000 households.

Review names and addresses in the existing recipient editor first. The export reuses saved recipient choices, preferred-name greetings, selected organization contacts, name overrides, and address values. The selected letter date uses the saved template's date format without changing reviewed status or stored dates. Reviews remain valid for 15 days.

The panel reports the eligible count and omitted recipients with reasons. Excluded, already-covered, held, expired/unreviewed, and current document-draft recipients are not exported. Conflicting household/member IDs and incomplete required merge fields are also omitted. One household gets one row at its highest qualifying society, as determined by the existing membership workflow.

Connect the CSV to Word through Mailings, then use native Word merge fields. Export headers include original saved Word field names with their saved bindings as well as canonical application merge fields. Literal typed placeholders are not native Word merge fields. Word controls letterhead, page breaks, and suppression of blank address lines. Preview the merged results before printing.

CSV values preserve quotes, commas, Unicode, line breaks, and leading-zero ZIP codes. Files use UTF-8 with a BOM and quoted RFC 4180 fields. Import ZIP codes and system IDs as text if opening in Excel first. Full reviewed address blocks are preserved; missing component fields are never inferred from manual free-form addresses. If the original template requires individual address components, complete those fields in recipient review before exporting.

## Boundaries

- This is a saved-data export, not a live NXT communication or delivery check. The panel shows the last membership refresh time.
- Export does not create a reservation, letter batch, appeal assignment, delivery receipt, or mailed status. It does not call NXT or the PDF converter.
- Repeated downloads can include the same households. There is no external Word-merge completion tracking yet. Staff must avoid mixing CSV printing and in-app document creation for the same recipients.
- Existing PDF/Word approval, appeal reconciliation, and downloads are unchanged. Their existing limits still apply.
- A separate tracked confirmation for externally created letters and explicit, duplicate-safe appeal updates is a future step, not part of this export.

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
