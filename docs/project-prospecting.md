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
3. In Project settings / Configure, load returned output fields and select the **constituent system record ID** for project tags. Do not select Lookup ID, gift ID, fundraiser ID, or qrecid. Save the mapping; a second NXT refresh is not required.
4. Optionally enable **Add a constituent to this project** by setting both its existing NXT custom field category and exact description/value. These must match the saved query's membership filter. Leave both blank to disable additions. Configuration alone never writes to NXT, and enabling this setting preserves the existing query snapshot and tags.

All explicitly selected viewers see all returned query columns, regardless of their individual NXT access. Select the audience accordingly. Existing query limits are retained: 1,000 rows, 25 output columns, 512 KB. Oversized output is rejected rather than truncated; the prior complete snapshot remains available.

## Using tags

Search or filter the list, select individuals or up to 100 matching people, choose a tag, then apply or remove it. Create a new tag inline when needed. A project supports up to 100 distinct names, each 1-50 characters. Matching ignores case and normalizes whitespace. Tags are independent between projects.

Assignments use project key + tag ID + constituent system ID, never names or row positions. Duplicate rows for the same constituent share tags. Invalid ID rows remain visible but cannot be tagged. Refreshing a query does not delete tags: if someone leaves and later returns to its results, their tags return too.

Export filtered CSV includes the visible columns and project tag names, with spreadsheet formula neutralization. Export does not change NXT, query membership, or access. Tag names are separated by semicolons in a single CSV cell.

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
- Tables: `project_prospect_tags`, `project_prospect_tag_assignments`, `project_prospect_tag_events`. Schema creation has its own transaction advisory lock. The first-project seed never overwrites existing settings or access.
- Error recovery retains the visible saved list and offers **Reload project**, not a forced NXT query. A failed refresh never publishes partial output.
- Tag requests have a 30-second client deadline covering the response and body. A timed-out save may still have committed; users reload saved status before trying again. Writes are never replayed automatically. A confirmed save followed by a failed read is identified separately.
- Unexpected tag failures log only the operation and validated PostgreSQL error code, not tag names, constituents, SQL text or credentials.

## Verification

The required offline workflow gate includes tag validation, membership access boundaries and fixed-field enforcement, duplicate/uncertain NXT additions, endpoint error handling, UI tagging/filtering/recovery, membership timeout recovery and CSV safety. The disposable PostgreSQL suite additionally exercises concurrent tag edits, access revocation, snapshot changes, project isolation, tag persistence, audit rollback, tag limits and schema reruns.

The database fixture uses prepared bind parameters rather than inlining values, matching production's PostgreSQL type inference. This catches the audit-actor UNION regression that initially prevented tag saves; each audit actor is now explicitly typed as bigint. Tests cover both numeric and string user IDs and stalled-save recovery without duplicate submission.

To run the database suite, use a disposable PostgreSQL instance with fictional data only, no TCP listener, port 55449, and a Unix socket directory matching `/private/tmp/project-prospecting-pg.<suffix>`. Set `PROJECT_PROSPECTING_TEST_PG_SOCKET` and run `npm test -- projectProspectingTags.integration`. The suite never reads `DATABASE_URL`. Do not point it at a shared database; it creates and drops the isolated `project_prospecting_fixture` schema.
