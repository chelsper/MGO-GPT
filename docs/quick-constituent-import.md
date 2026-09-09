# Quick New Constituent Creation

## Reviewer Workflow

1. Choose a New or Mixed import and map identity, matching fields, and any contacts to import. The existing 100-row file limit is unchanged.
2. Load NXT table formats and optionally select a default addressee and salutation for new records. Selections are saved with the preview. Do not also enable custom text for the same format.
3. Prepare and save the import, then approve **Create clear nonmatches**. Merely uploading or previewing does not write to NXT.
4. Keep the page open. Each request checks and creates at most one constituent. Pause after the current row, or reopen the saved run to resume unchecked rows.
5. Work held matches and incomplete checks through individual review. Review and send additional staged constituency, relationship, and other updates separately.

Quick creation includes identity and the selected single email, phone, and address with their selected NXT types. Multiple contacts of one kind, address valid-from dates, and saved contact-review choices remain for individual review. This deliberately does not silently discard fields or override review decisions.

## Comparing Suggested Matches

The review section displays saved **Suggested NXT matches** directly, including names, lookup IDs, available email/address details, and **Open NXT record**, **Use this match**, and **Not a match** controls. A selected record also appears beside the CSV identity. NXT links open the actual system record in a separate tab; no manual lookup is required.

Suggestions use evidence labels (**Strong match**, **Needs comparison**, **Possible household**), not percentage confidence. The strongest five appear first; **Show all qualifying matches** exposes the rest. First-name-only, last-name-only, ZIP-only, and house-number-only results are not suggestions. Older saved runs are rechecked once when their focused row opens; fresh checks supersede obsolete broad-search results without removing rejection history or silently changing a selected target.

Quick-import duplicate checks now retain the matching candidates instead of only a warning. Older held rows missing this information load suggestions automatically when opened in focused review, using the saved CSV identity checks. Results are persisted on that row. The all-records view does not start searches across the batch; an individual **Load suggested matches** button is available there. Failed lookups show an error and retry action, not a confirmed nonmatch.

For an unsent saved row, **Not a match** records the decision and removes that suggestion from the active list. Rejecting the selected target also clears its snapshots/write choices and holds the row for further review. Rejecting a different candidate preserves the selected target and its choices. Neither action deletes an NXT record nor authorizes creating a new one, even when every suggestion has been rejected. Select another verified record or use the separate checked creation workflow below. Rejected records remain in the review history across reloads. Save unsaved previews before rejecting a suggestion.

Proven pre-creation duplicate holds can be reviewed even when an older run left a creation-approval flag set. Unknown failure/approval states remain locked. Match saves compare the current row, approval checkpoint, preview, and write audit before committing, so concurrent imports or review changes are not overwritten.

Rows already created by the import, with uncertain creation attempts, or with attempted NXT writes cannot be rejected or retargeted here. Open NXT to verify those records. A row currently sending changes is protected from concurrent match changes; an interrupted send remains blocked rather than automatically replaying a write.

## Resolving Unmatched Rows

For a saved New or Mixed import, an unmatched row now has an **Is this a new constituent?** section. **Open required review** navigates to match resolution rather than an unrelated contact field.

1. Select the correct suggestion, or mark unrelated qualifying suggestions **Not a match**. Known matching evidence and incomplete saved suggestions must be resolved before new creation can be approved; demonstrably irrelevant legacy hits no longer require individual rejection.
2. Select **Check for duplicates**. This runs the complete ID, both-email, name, address/ZIP, and local-import checks. It creates nothing. Only individually audited rejected NXT IDs are exempted; checking continues through all remaining search channels.
3. If checks clear, acknowledge that this is a separate person and select **Confirm as new constituent**. After any rejected suggestions, a review note of at least 10 characters is required. The approval, reviewer, and rejected IDs are saved before the NXT POST.
4. The server rechecks duplicates under the shared creation lease. New candidates, failed/truncated lookups, changed source/review data, and checks older than 30 minutes block creation. Neither a browser-supplied ID exception nor a stale check token can authorize creation.
5. This manual path lets NXT assign fresh system and lookup IDs; original CSV IDs are audit-only. Identity and configured table-based name formats are created. All remaining source-driven updates are rebuilt for review, without carrying over replacement IDs or approvals from a rejected target.

Blocked checks explain the next action: retry NXT checks, **Choose corrected CSV** and prepare a new preview, review suggested matches, or **Review batch rows**. For duplicate unsent rows in the same upload, skip the extra row and retry the retained row. Skipping does not exempt a created record, started request, or durable prior creation attempt. Update-only imports explain that creation requires a New or Mixed import. Source conflicts must be corrected rather than overridden.

Local duplicate holds show a separate **Import history conflict** card, not a suggested live NXT match or an "NXT apply failed" error. The card identifies the import number, CSV row, saved name, matching field, and whether the other row is pending, already created, or has an uncertain creation. **Review blocking import row** opens that exact row, including older batches and completed/skipped rows. A known created system record has a separate NXT link. CSV identifiers are labeled as saved source values, not current NXT identity. Orphaned creation audits remain blocked without inventing a link to a deleted import row.

Older holds missing this context are checked again when opened for review. After correcting/skipping an extra unsent row, use **Check for duplicates** on the retained row; only a fresh complete check can clear the hold. Uncertain and created records remain protected, even if their saved row is skipped or an NXT search returns no results. These safeguards are not bypassed by rejecting suggestions.

These review fields use existing preview/audit JSON; no additional schema migration is required for the manual resolution workflow. The quick batch path does not inherit reviewer exceptions and continues to hold all possible matches.

## Duplicate Rules

- System IDs match only system IDs; Lookup IDs match only Lookup IDs. Numeric Lookup IDs are no longer retried as system IDs. Conflicting supplied identifiers or names require comparison rather than automatic matching. External source IDs remain audit-only.
- Exact full email is strong evidence but does not automatically select an update target: family members may share it. Email punctuation is preserved. Both mapped email fields are checked before creation.
- Exact normalized first AND last name qualifies for comparison, ignoring middle names in display names. A nickname or one-character first-name variation requires the same last name plus an exact phone or matching full address/ZIP. Initials and weak partial-name hits do not qualify on their own.
- Household evidence requires the same house number, normalized street, and ZIP first five. Conflicting apartment/unit numbers rule out address-only evidence. A missing unit does not prove two people are the same; even a matching household always requires review.
- Full-street general searches use `strict_search: true`, replacing house-number-only queries. Candidates are validated against returned fields, not provider search rank. When email or address search returns only a nonmatching preferred contact, complete per-constituent contact lists are checked before dismissing the result. Detail reads are serial, reused within the check, and bounded at 20; missing, malformed, truncated, or over-budget comparisons block creation rather than being treated as nonmatches.
- The same classifier is used in preview, local-file matching, saved suggestions, checked manual creation, and every final creation check. Genuine saved matches remain held until reviewed even if a later search omits them. Criteria-versioned checks invalidate older approval tokens.
- Search errors, incomplete results, truncation, unsupported addresses, and missing ZIP data never mean 'no duplicate'. Quota/authentication pauses stop the batch.
- Other uploaded rows and prior creation attempts are also checked, protecting against duplicates before NXT search indexing catches up. There is no automatic merge or change to an existing constituent.

## Existing-Record Identity Safety

Preview no longer reads or writes the 30-day import identity cache. Every new preview resolves identifiers live; identical inputs may share a lookup only within that one request. Lookup IDs are never interpreted as system IDs.

Before any staged update, the server claims the saved row and reads its exact system record from NXT. The current Lookup ID and identity must agree with the saved review. Automatic matches additionally require exact source identifiers without conflicting names. Legacy name/email-only targets require explicit selection. A deliberate reviewer selection or an audited new creation may override original CSV identifiers, but cannot override later changes to the selected identity.

Changed IDs, missing/malformed identity responses, and failed/throttled reads hold the row in **Needs Review** without sending any writes for that attempt. The UI explains how to open the record and reject/reselect it. Earlier write audits remain intact; partially written rows cannot be silently retargeted. A rebuilt preview cannot transfer prior contact selections to a different identity, and one-click send asks for review again if saving changed the target.

These checks protect older saved import runs as well as new previews. They do not reverse earlier incorrect writes. Investigate an affected run/row and compare its audit with NXT before making a separate correction. As with other NXT writes, a remote change between the final read and the write cannot be made atomic by the app.

## Creation Safety

A shared short lease serializes import creation. Before a non-idempotent NXT POST, an atomic database statement records both the row checkpoint and an independent creation-attempt ledger. The ledger preserves the original input even if a preview is later replaced or corrected. No automatic POST retries are permitted. Uncertain outcomes must be reconciled in NXT before any new creation; they are not described as confirmed failures. Confirmed HTTP 400/401/403/409/422/429 rejections stay in review but permit correction and manual retry. Their rejected ledger entries do not permanently block a future confirmed-safe creation.

New schema is additive through `ensureAppSchema`: two row checkpoint columns, `constituency_import_create_lock`, and `constituency_import_create_attempts`. The attempt ledger intentionally has no cascading row foreign key. It contains import identity/contact data and must follow the same access and retention controls as import audits; do not put it in public diagnostics or routine logs.

NXT configured name formats use `primary_addressee` / `primary_salutation` with `custom_format: false` and the selected `configuration_id`. No `formatted_name` is sent. References: [Blackbaud's certified connector schema](https://github.com/microsoft/PowerPlatformConnectors/blob/dev/certified-connectors/Blackbaud%20Raiser%27s%20Edge%20NXT%20Constituents/apiDefinition.swagger.json), [Blackbaud's explanation of address search](https://community.blackbaud.com/discussion/50765/constituent-search-not-updating-addresses).

## Release Validation

Automated tests mock NXT; they do not prove the current tenant's search indexing, permissions, or format behavior. Before a broad live import, validate a small controlled batch containing known ID, secondary-email, name-only, same-address/ZIP+4, and within-file duplicates, plus one explicitly approved new record. Verify the created contacts and table-based format in NXT. Reopen the run and ensure that record is not recreated. No live writes are performed by the tests.
