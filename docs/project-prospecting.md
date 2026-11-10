# Project Prospecting

Project Prospecting is a separate reporting collection backed by the existing saved constituent-query list engine. It does not change the ordinary Lists workflow or write tags to NXT.

## First project and access

- The schema idempotently seeds `list-project-center`, titled **The Center Prospects - JUMGOGPT**, using saved query **31110**.
- This starts disabled with no viewers. In Project settings, an Admin or Advancement Services user selects active viewers and enables it. There is no implicit administrator bypass for viewing data or editing tags.
- Everyone explicitly selected for an enabled project can create tags and apply/remove them. Configuration and access remain managed by the existing report configuration permissions.
- Additional projects use **Add project**, a constituent query source, and their own explicit access list.

## Initial setup

1. Select viewers (including yourself if you will use the project) and enable the project.
2. Open it and use **Refresh list**. Only this explicit action runs the read-only NXT query. A complete empty result is valid.
3. In Project settings / Configure, load returned output fields and select the **constituent system record ID** for project tags. Do not select Lookup ID, gift ID, fundraiser ID, or qrecid. Save the mapping; a second NXT refresh is not required.

All explicitly selected viewers see all returned query columns, regardless of their individual NXT access. Select the audience accordingly. Existing query limits are retained: 1,000 rows, 25 output columns, 512 KB. Oversized output is rejected rather than truncated; the prior complete snapshot remains available.

## Using tags

Search or filter the list, select individuals or up to 100 matching people, choose a tag, then apply or remove it. Create a new tag inline when needed. A project supports up to 100 distinct names, each 1-50 characters. Matching ignores case and normalizes whitespace. Tags are independent between projects.

Assignments use project key + tag ID + constituent system ID, never names or row positions. Duplicate rows for the same constituent share tags. Invalid ID rows remain visible but cannot be tagged. Refreshing a query does not delete tags: if someone leaves and later returns to its results, their tags return too.

Export filtered CSV includes the visible columns and project tag names, with spreadsheet formula neutralization. Export does not change NXT, query membership, or access. Tag names are separated by semicolons in a single CSV cell.

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

The required offline workflow gate includes tag validation, access boundaries, endpoint error handling, UI tagging/filtering/recovery and CSV safety. The disposable PostgreSQL suite additionally exercises concurrent edits, access revocation, snapshot changes, project isolation, tag persistence, audit rollback, tag limits and schema reruns.

The database fixture uses prepared bind parameters rather than inlining values, matching production's PostgreSQL type inference. This catches the audit-actor UNION regression that initially prevented tag saves; each audit actor is now explicitly typed as bigint. Tests cover both numeric and string user IDs and stalled-save recovery without duplicate submission.

To run the database suite, use a disposable PostgreSQL instance with fictional data only, no TCP listener, port 55449, and a Unix socket directory matching `/private/tmp/project-prospecting-pg.<suffix>`. Set `PROJECT_PROSPECTING_TEST_PG_SOCKET` and run `npm test -- projectProspectingTags.integration`. The suite never reads `DATABASE_URL`. Do not point it at a shared database; it creates and drops the isolated `project_prospecting_fixture` schema.
