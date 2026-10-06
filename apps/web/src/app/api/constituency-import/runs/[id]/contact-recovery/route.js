import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { buildContactRecoveryPreview, contactRecoverySnapshot, getContactRecoveryRows } from "@/utils/importContactRecovery";

async function loadSource(request, params) {
  const session = await auth();
  if (!session?.user?.email) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const { sessionUser: user } = await getWorkspaceUser(session, request);
  if (!user || !isReviewerRole(user.role)) return { error: Response.json({ error: "Only Advancement Services users can recover import contacts." }, { status: 403 }) };
  if (!/^[1-9]\d*$/.test(String(params?.id || ""))) return { error: Response.json({ error: "Invalid import run ID." }, { status: 400 }) };
  await ensureAppSchema();
  const [run] = await sql`SELECT * FROM constituency_import_runs WHERE id = ${params.id} LIMIT 1`;
  if (!run) return { error: Response.json({ error: "Import run not found." }, { status: 404 }) };
  if (run.defaults?.contactRecoverySourceRunId) return { error: Response.json({ error: "Continue this saved correction instead of creating another recovery batch." }, { status: 409 }) };
  const rows = await sql`SELECT * FROM constituency_import_rows WHERE run_id = ${run.id} ORDER BY id ASC`;
  return { user, run, rows };
}

const json = (payload, status = 200) => Response.json(payload, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });

export async function GET(request, { params }) {
  try {
    const source = await loadSource(request, params);
    if (source.error) return source.error;
    return json({ sourceRunId: String(source.run.id), rows: getContactRecoveryRows(source.run, source.rows) });
  } catch {
    return json({ error: "Saved contacts could not be loaded. Retry without uploading the file again." }, 500);
  }
}

export async function POST(request, { params }) {
  try {
    const source = await loadSource(request, params);
    if (source.error) return source.error;
    const { user, run, rows } = source;
    const body = await request.json().catch(() => ({}));
    const rowIds = body.rowIds;
    if (body.confirmed !== true || !Array.isArray(rowIds) || !rowIds.length || rowIds.length > 100 ||
      rowIds.some((value) => typeof value !== "string" || !/^[1-9]\d*$/.test(value)) || new Set(rowIds).size !== rowIds.length) {
      return json({ error: "Select up to 100 saved records and confirm preparation of the contact correction." }, 400);
    }
    const defaults = {};
    for (const key of ["emailType", "phoneType"]) {
      if (body.defaults?.[key] != null && (typeof body.defaults[key] !== "string" || body.defaults[key].length > 100 || /[\r\n]/.test(body.defaults[key]))) {
        return json({ error: "Use a valid NXT contact type of 100 characters or fewer." }, 400);
      }
      defaults[key] = body.defaults?.[key]?.trim() || "";
    }
    const selected = getContactRecoveryRows(run, rows, defaults).filter((row) => rowIds.includes(row.sourceRowId));
    if (selected.length !== rowIds.length) return json({ error: "Choose records with a saved creation result from this import." }, 409);
    // Lost responses and repeated clicks reopen the same correction, never fork it.
    if (selected.every((row) => row.recoveryRunId && row.recoveryRunId === selected[0].recoveryRunId)) {
      return json({ runId: selected[0].recoveryRunId, reused: true });
    }
    if (selected.some((row) => !row.eligible)) return json({
      error: "Some records need attention or already have a correction. Check saved contacts again before continuing.",
      rows: selected,
    }, 409);
    if (new Set(selected.map((row) => row.targetId)).size !== selected.length) {
      return json({ error: "Several selected rows refer to the same created constituent. Select one source row per constituent." }, 409);
    }

    const now = new Date().toISOString();
    const sourceRows = rows.filter((row) => rowIds.includes(String(row.id)));
    const correctionRows = selected.map((entry) => {
      const original = sourceRows.find((row) => String(row.id) === entry.sourceRowId);
      const preview = buildContactRecoveryPreview(original, entry, { runId: run.id, userId: user.id, now });
      return { rowNumber: entry.rowNumber, name: entry.name, targetId: entry.targetId, lookupId: preview.input.lookupId,
        rawRow: original.raw_row, preview, writes: preview.writePlan };
    });
    const childDefaults = { importIntent: "updates", updateEmailFields: true, updatePhoneFields: true,
      contactRecoverySourceRunId: String(run.id), contactRecoveryPreparedAt: now, ...defaults };
    const summary = { total: selected.length, ready: 0, needsReview: selected.length, conflict: 0, skipped: 0, applied: 0, failed: 0 };
    // Claim, link, and insert in one atomic statement. A concurrent click or an
    // edited source cannot leave an unlinked draft or replace the original audit.
    const saved = await sql`
      WITH allocated AS (
        SELECT nextval(pg_get_serial_sequence('constituency_import_runs', 'id')) AS id
      ), locked_sources AS MATERIALIZED (
        SELECT s.* FROM constituency_import_rows s
        WHERE s.run_id = ${run.id} AND s.id::text IN (SELECT jsonb_array_elements_text(${JSON.stringify(rowIds)}::jsonb))
        ORDER BY s.id FOR UPDATE
      ), claimed AS (
        UPDATE constituency_import_runs r
        SET defaults = COALESCE(r.defaults, '{}'::jsonb) || jsonb_build_object(
          'contactRecoveryRuns', COALESCE(r.defaults->'contactRecoveryRuns', '{}'::jsonb) ||
            (SELECT jsonb_object_agg(value, allocated.id::text) FROM jsonb_array_elements_text(${JSON.stringify(rowIds)}::jsonb))
        ), updated_at = NOW()
        FROM allocated
        WHERE r.id = ${run.id}
          AND r.defaults IS NOT DISTINCT FROM ${JSON.stringify(run.defaults ?? null)}::jsonb
          AND r.mappings IS NOT DISTINCT FROM ${JSON.stringify(run.mappings ?? null)}::jsonb
          AND (
            SELECT jsonb_agg(jsonb_build_object(
              'id', s.id::text, 'status', s.status, 'createdId', s.created_blackbaud_constituent_id,
              'matchedId', s.matched_blackbaud_constituent_id, 'quickCreateStatus', s.quick_create_status,
              'preview', s.preview, 'rawRow', s.raw_row, 'writes', s.requested_writes, 'result', s.blackbaud_result
            ) ORDER BY s.id)
            FROM locked_sources s
          ) IS NOT DISTINCT FROM ${JSON.stringify(contactRecoverySnapshot(sourceRows))}::jsonb
        RETURNING allocated.id
      ), correction AS (
        INSERT INTO constituency_import_runs (
          id, created_by_user_id, workspace_user_id, status, source_filename, mappings, defaults,
          warnings, summary, row_count, ready_count, needs_review_count, conflict_count, skipped_count, created_at, updated_at
        ) SELECT claimed.id, ${user.id}, ${user.id}, 'previewed',
          ${`Contact correction for import #${run.id}`}, '{}'::jsonb, ${JSON.stringify(childDefaults)}::jsonb,
          '[]'::jsonb, ${JSON.stringify(summary)}::jsonb, ${selected.length}, 0, ${selected.length}, 0, 0, NOW(), NOW()
        FROM claimed RETURNING id
      ), inserted AS (
        INSERT INTO constituency_import_rows (
          run_id, row_number, status, match_status, match_method, confidence,
          matched_blackbaud_constituent_id, matched_lookup_id, constituent_name,
          raw_row, preview, requested_writes, created_at, updated_at
        ) SELECT correction.id, (entry->>'rowNumber')::integer, 'Needs Review', 'matched',
          'Created ID from original import', 100, entry->>'targetId', entry->>'lookupId', entry->>'name',
          entry->'rawRow', entry->'preview', entry->'writes', NOW(), NOW()
        FROM correction CROSS JOIN jsonb_array_elements(${JSON.stringify(correctionRows)}::jsonb) entry
        RETURNING id
      ) SELECT correction.id, (SELECT COUNT(*) FROM inserted) AS row_count FROM correction
    `;
    if (!saved.length) return json({ error: "This import changed while the correction was being prepared. Check saved contacts again; the original results were preserved." }, 409);
    return json({ runId: String(saved[0].id), rowCount: selected.length, reused: false,
      message: "Contact correction saved. Review the current NXT contacts before sending. No NXT records have changed." });
  } catch {
    return json({ error: "The correction could not be prepared. Check saved contacts again to find any saved correction. No NXT writes were made." }, 500);
  }
}
