# Project Prospecting

Project Prospecting is a separate reporting collection backed by the existing saved constituent-query list engine. It does not change the ordinary Lists workflow or write tags to NXT.

## First project and access

- The schema idempotently seeds `list-project-center`, titled **The Center Prospects - JUMGOGPT**, using saved query **31110**.
- This starts disabled with no viewers. In Project settings, an Admin or Advancement Services user selects active viewers and enables it. There is no implicit administrator bypass for viewing data or editing tags.
- Everyone explicitly selected for an enabled project can create tags and apply/remove them. Configuration and access remain managed by the existing report configuration permissions.
- Once the project's NXT membership field is configured, all those same selected users can add existing constituents through it, including MGOs. Regular Lists retain their Admin/Advancement Services/Executive membership restrictions.
- Additional projects use **Add project**, a constituent query source, and their own explicit access list.

## Initial setup

1. Select viewers (including yourself if you will use the project) and enable the project.
2. Open it and use **Refresh list**. Only this explicit action runs the read-only NXT query. A complete empty result is valid.
   Saved query IDs may be positive or negative; retain the exact NXT ID, including
   its sign. This does not change the positive constituent system-ID rules.
3. In Project settings / Configure, load returned output fields and select the **constituent system record ID** for project tags. Do not select Lookup ID, gift ID, fundraiser ID, or qrecid. Save the mapping; a second NXT refresh is not required.
4. Optionally enable **Add a constituent to this project** by setting both its existing NXT custom field category and exact description/value. These must match the saved query's membership filter. Leave both blank to disable additions. Configuration alone never writes to NXT, and enabling this setting preserves the existing query snapshot and tags.

All explicitly selected viewers see all returned query columns, regardless of their individual NXT access. Select the audience accordingly. List query limits are 5,000 raw rows, 100 output columns (including technical output), 2 MiB CSV and 4 MiB serialized table. This accommodates repeated constituency/fundraiser outputs and wider installment queries without truncation. These limits apply consistently to download, parsing, pending output, snapshot publication and paginated display. Ordinary dashboard tables retain their 1,000-row, 25-column and 512 KiB CSV limits; pasted ad-hoc query definitions retain their existing field limits. Oversized output gets a specific restart-required message, rather than an NXT connection warning; the prior complete snapshot remains available.

## Using tags

Search or filter the list, select individuals or up to 100 matching people, choose a tag, then apply or remove it. Create a new tag inline when needed. A project supports up to 100 distinct names, each 1-50 characters. Matching ignores case and normalizes whitespace. Tags are independent between projects.

Assignments use project key + tag ID + constituent system ID, never names or row positions. The table shows one row per mapped constituent system ID, even when the saved query repeats that constituent. Distinct nonblank field values remain available under **+N more** in the cell and remain searchable. Values are not summed or treated as separate gifts. Same-name constituents with different system IDs remain separate. Invalid ID rows remain visible individually but cannot be tagged; an absent mapping does not guess identity from names, Lookup IDs, or row IDs. Refreshing a query does not delete tags: if someone leaves and later returns to its results, their tags return too.

Tags appear beside each person's name, with direct removal requiring confirmation. Bulk Apply skips people who already have the tag. Removing a tag never removes other tags or changes a spouse's tags.

## Households, Archives and Exports

- **Archive** hides selected constituents from the active project view, preserving tags. **Project status > Archived** offers restoration. These actions are project-only, available to explicitly authorized project viewers, and never affect NXT membership, portfolio ownership or outreach assignments. Returning query members retain their archive state.
- **Married households** groups only isolated, unambiguous spouse pairs already in the saved list. Query outputs should include Constituent ID, Spouse ID and the constituent's own Marital Status. Married and Alum married to alum qualify. Missing, conflicting, divorced or separated relationships remain individual. Lookup and system ID namespaces are explicitly distinct. Names and shared gifts do not establish a household.
- Automatic column recognition accepts unique exact semantic headers. **Project settings > Household and solicitor display fields** can explicitly select or disable mappings; this reuses the existing snapshot. No per-person NXT calls run on page load.
- Each household member retains their own system ID, tags, solicitor and field values. Nothing is summed. Search/tag filters select and export only matching people; an unmatched spouse is context-only with disabled edit controls. Active views do not hide an active spouse when their partner is archived.
- Solicitor display uses each original query row's name/type/start/end association. Valid date ranges distinguish current, ended and future assignments; missing or malformed dates are labeled unverified. Spouse fundraiser columns are never mistaken for the constituent's assignments. All information is saved query data, not a live ownership check.
- **Export filtered CSV** respects search, tag and archive filters. **Export everyone CSV** ignores search/tag filters and excludes archived people unless explicitly included. Each export has one row per constituent, visible source columns, household context, archive status, a combined tag list and a separate `Tag: <name>` Yes/blank column for every project tag. Spouses never inherit each other's tags. There is no 100-selection limit on these exports; the saved-query limits still apply.
- Multiple distinct source values are separated by line breaks inside quoted CSV cells. Spreadsheet formulas are neutralized in both headers and values. Downloads never change NXT, query membership, access, tags or archive state.

## Adding People

Open **Add a constituent to this project** above the saved list, search for an existing NXT constituent, and select **Add to project**. Confirm the person, configured category, and description/value. This adds the custom field on that constituent, not a new constituent, not a new NXT category or code-table value, and not an app-only tag. Existing fields are never replaced. Text and existing Code Table values are supported.

The membership endpoint checks active, explicit project access and the current configuration revision, then rechecks access/settings before writing. Clients cannot choose a different category or override a project's configured value. NXT calls use the existing user's connection and permissions. A durable pre-write receipt protects against concurrent and repeated submissions across overlapping lists; duplicate checks and verification reads must complete before a new write is allowed.

Confirmed additions may not appear immediately in saved query output. NXT indexing can take about 30 minutes; use **Refresh list** afterward. Other saved-query filters still apply. The app does not invent query rows or bypass the query's eligibility criteria. Confirmation remains visible in the add-person panel while it is open.

A request/body deadline returns control after 30 seconds. Uncertain results offer **Check status**, which performs verification without resubmitting the addition. If no submission receipt exists and a fresh NXT read finds no matching field, an explicit **Add** is offered again with all normal checks; this recovers from connection failures before submission. Any recorded but unverified submission stays protected, even after a page reload. App tags remain separate and are never synced to NXT by this workflow.

## Integrity and recovery

- Local API: `GET/POST /api/reports/lists/[listKey]/tags` uses existing authenticated list access, same-origin write checks, payload bounds and private/no-store responses.
- Apply/remove revalidates the list revision, saved snapshot timestamp, mapped membership, and project ownership of the tag.
- Database row locks serialize edits within a project and protect access/snapshot rows through commit. Access and freshness predicates are repeated inside the mutation.
- Create/apply/remove and their audit events are atomic. Repeated creates or assignments do not duplicate tags or audit entries.
- Archive/restore uses the same revision, membership, snapshot and access protections. `project_prospect_archives` and `project_prospect_archive_events` are additive tables; archive state and audit events commit atomically. Repeated requests are idempotent. Failed or timed-out saves require a saved-state reload rather than automatic replay.
- Tables: `project_prospect_tags`, `project_prospect_tag_assignments`, `project_prospect_tag_events`. Schema creation has its own transaction advisory lock. The first-project seed never overwrites existing settings or access.
- Error recovery retains the visible saved list and offers **Reload project**, not a forced NXT query. A failed refresh never publishes partial output.
- Tag requests have a 30-second client deadline covering the response and body. A timed-out save may still have committed; users reload saved status before trying again. Writes are never replayed automatically. A confirmed save followed by a failed read is identified separately.
- Unexpected tag failures log only the operation and validated PostgreSQL error code, not tag names, constituents, SQL text or credentials.

## Verification

The required offline workflow gate includes tag validation, membership access boundaries and fixed-field enforcement, duplicate/uncertain NXT additions, endpoint error handling, UI tagging/filtering/recovery, membership timeout recovery and CSV safety. The disposable PostgreSQL suite additionally exercises concurrent tag edits, access revocation, snapshot changes, project isolation, tag persistence, audit rollback, tag limits and schema reruns.

The database fixture uses prepared bind parameters rather than inlining values, matching production's PostgreSQL type inference. This catches the audit-actor UNION regression that initially prevented tag saves; each audit actor is now explicitly typed as bigint. Tests cover both numeric and string user IDs and stalled-save recovery without duplicate submission.

To run the database suite, use a disposable PostgreSQL instance with fictional data only, no TCP listener, port 55449, and a Unix socket directory matching `/private/tmp/project-prospecting-pg.<suffix>`. Set `PROJECT_PROSPECTING_TEST_PG_SOCKET` and run `npm test -- projectProspectingTags.integration`. The suite never reads `DATABASE_URL`. Do not point it at a shared database; it creates and drops the isolated `project_prospecting_fixture` schema.
