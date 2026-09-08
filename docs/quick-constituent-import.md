# Quick New Constituent Creation

## Reviewer Workflow

1. Choose a New or Mixed import and map identity, matching fields, and any contacts to import. The existing 100-row file limit is unchanged.
2. Load NXT table formats and optionally select a default addressee and salutation for new records. Selections are saved with the preview. Do not also enable custom text for the same format.
3. Prepare and save the import, then approve **Create clear nonmatches**. Merely uploading or previewing does not write to NXT.
4. Keep the page open. Each request checks and creates at most one constituent. Pause after the current row, or reopen the saved run to resume unchecked rows.
5. Work held matches and incomplete checks through individual review. Review and send additional staged constituency, relationship, and other updates separately.

Quick creation includes identity and the selected single email, phone, and address with their selected NXT types. Multiple contacts of one kind, address valid-from dates, and saved contact-review choices remain for individual review. This deliberately does not silently discard fields or override review decisions.

## Comparing Suggested Matches

Each selected match has a CSV/NXT comparison section and an **Open NXT record** link. Manual search results also link directly to their NXT system record, in a separate tab, before a match is selected.

For an unsent saved row, **Not a match** records the review decision, clears the target and target-specific snapshots/write choices, and holds the row for further review. It does not delete an NXT record or authorize creating a new one. Select another verified record or leave the row for review. Rejected records remain in the review history. Save unsaved previews before rejecting a suggestion.

Rows already created by the import, with uncertain creation attempts, or with attempted NXT writes cannot be rejected or retargeted here. Open NXT to verify those records. A row currently sending changes is protected from concurrent match changes; an interrupted send remains blocked rather than automatically replaying a write.

## Duplicate Rules

- Any possible NXT ID, either email, first/last name, or similar address plus ZIP first five holds the row. The original preview's matches also remain held.
- Name and address punctuation/abbreviations are normalized for local comparisons; email punctuation is preserved. External source IDs are audit-only, not NXT IDs.
- Address candidate retrieval is broader than exact full-address matching. Enhanced and general NXT searches are both checked. Possible matches with incomplete/ambiguous address information are held, not cleared using their preferred address alone.
- Search errors, incomplete results, truncation, unsupported addresses, and missing ZIP data never mean 'no duplicate'. Quota/authentication pauses stop the batch.
- Other uploaded rows and prior creation attempts are also checked, protecting against duplicates before NXT search indexing catches up. There is no automatic merge or change to an existing constituent.

## Creation Safety

A shared short lease serializes import creation. Before a non-idempotent NXT POST, an atomic database statement records both the row checkpoint and an independent creation-attempt ledger. The ledger preserves the original input even if a preview is later replaced or corrected. No automatic POST retries are permitted. Uncertain outcomes must be reconciled in NXT before any new creation; they are not described as confirmed failures. Confirmed HTTP 400/401/403/409/422/429 rejections stay in review but permit correction and manual retry. Their rejected ledger entries do not permanently block a future confirmed-safe creation.

New schema is additive through `ensureAppSchema`: two row checkpoint columns, `constituency_import_create_lock`, and `constituency_import_create_attempts`. The attempt ledger intentionally has no cascading row foreign key. It contains import identity/contact data and must follow the same access and retention controls as import audits; do not put it in public diagnostics or routine logs.

NXT configured name formats use `primary_addressee` / `primary_salutation` with `custom_format: false` and the selected `configuration_id`. No `formatted_name` is sent. References: [Blackbaud's certified connector schema](https://github.com/microsoft/PowerPlatformConnectors/blob/dev/certified-connectors/Blackbaud%20Raiser%27s%20Edge%20NXT%20Constituents/apiDefinition.swagger.json), [Blackbaud's explanation of address search](https://community.blackbaud.com/discussion/50765/constituent-search-not-updating-addresses).

## Release Validation

Automated tests mock NXT; they do not prove the current tenant's search indexing, permissions, or format behavior. Before a broad live import, validate a small controlled batch containing known ID, secondary-email, name-only, same-address/ZIP+4, and within-file duplicates, plus one explicitly approved new record. Verify the created contacts and table-based format in NXT. Reopen the run and ensure that record is not recreated. No live writes are performed by the tests.
