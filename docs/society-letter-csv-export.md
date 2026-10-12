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
