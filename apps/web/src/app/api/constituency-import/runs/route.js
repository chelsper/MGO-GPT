import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { getBlackbaudQuotaStatus } from "@/app/api/utils/blackbaud";
import {
  normalizeQuotaPausedImportRow,
  sanitizeQuotaPauseWarnings,
} from "@/app/api/constituency-import/quotaPause";
import { isReviewerRole } from "@/utils/workspaceRoles";

function cleanText(value) {
  return String(value || "").trim();
}

function serializeRun(row, { quotaPaused = false } = {}) {
  if (!row) return null;
  const warnings = sanitizeQuotaPauseWarnings(row.warnings, { quotaPaused });
  return {
    id: String(row.id),
    status: row.status,
    sourceFilename: row.source_filename || "",
    rowCount: Number(row.row_count || 0),
    readyCount: Number(row.ready_count || 0),
    needsReviewCount: Number(row.needs_review_count || 0),
    conflictCount: Number(row.conflict_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    appliedCount: Number(row.applied_count || 0),
    failedCount: Number(row.failed_count || 0),
    summary: row.summary || {},
    warnings,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    appliedAt: row.applied_at || null,
    createdByName: row.created_by_name || row.created_by_email || "",
    createdByEmail: row.created_by_email || "",
    workspaceUserName: row.workspace_user_name || row.workspace_user_email || "",
    workspaceUserEmail: row.workspace_user_email || "",
  };
}

function serializeImportRow(row, { quotaPaused: blackbaudQuotaPaused = false } = {}) {
  const { quotaPaused, quotaRecoveryRequired, preview } = normalizeQuotaPausedImportRow(row, {
    quotaPaused: blackbaudQuotaPaused,
  });
  const storedMatchMethod = row.match_method || preview.matchMethod || "";
  const requestedWrites = Array.isArray(row.requested_writes) ? row.requested_writes : [];
  return {
    ...preview,
    id: String(row.id),
    runId: String(row.run_id),
    rowNumber: Number(row.row_number || preview.rowNumber || 0),
    status:
      quotaPaused || quotaRecoveryRequired
        ? preview.status
        : row.status || preview.status || "Needs Review",
    matchStatus:
      quotaPaused || quotaRecoveryRequired
        ? preview.matchStatus
        : preview.matchStatus || row.match_status || "",
    matchMethod:
      quotaPaused || quotaRecoveryRequired
        ? preview.matchMethod
        : preview.matchMethod || storedMatchMethod,
    confidence:
      quotaPaused ? 0 : Number(preview.confidence || row.confidence || 0),
    // Older paused rows can contain the raw provider response alongside a
    // partial review. Do not return either field once the row is normalized.
    blackbaudResult: quotaPaused || quotaRecoveryRequired ? null : row.blackbaud_result || null,
    blackbaudError: quotaPaused || quotaRecoveryRequired ? "" : row.blackbaud_error || "",
    writePlan: Array.isArray(preview.writePlan) ? preview.writePlan : requestedWrites,
    appliedAt: row.applied_at || null,
    createApprovedAt: row.create_approved_at || null,
    createApprovedByUserId: row.create_approved_by_user_id
      ? String(row.create_approved_by_user_id)
      : null,
    createdBlackbaudConstituentId: row.created_blackbaud_constituent_id || null,
    createdBlackbaudLookupId: row.created_blackbaud_lookup_id || null,
  };
}

async function requireReviewer(request) {
  const session = await auth();
  if (!session || !session.user?.email) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { sessionUser: user } = await getWorkspaceUser(session, request);
  if (!user) {
    return { error: Response.json({ error: "User not found" }, { status: 404 }) };
  }
  if (!isReviewerRole(user.role)) {
    return {
      error: Response.json(
        { error: "Only Advancement Services users can view import runs." },
        { status: 403 },
      ),
    };
  }

  return { user };
}

export async function GET(request) {
  try {
    await ensureAppSchema();

    const authResult = await requireReviewer(request);
    if (authResult.error) return authResult.error;

    const { searchParams } = new URL(request.url);
    const requestedId = cleanText(searchParams.get("id"));
    const status = cleanText(searchParams.get("status"));
    // This is a database-backed circuit-breaker read, not a Blackbaud API request.
    // Saved rows must use the current state rather than a quota error persisted hours ago.
    const blackbaudQuota = await getBlackbaudQuotaStatus();

    if (requestedId) {
      if (!/^\d+$/.test(requestedId)) {
        return Response.json({ error: "Invalid import run ID" }, { status: 400 });
      }

      const runs = await sql`
        SELECT
          r.*,
          creator.name AS created_by_name,
          creator.email AS created_by_email,
          workspace_user.name AS workspace_user_name,
          workspace_user.email AS workspace_user_email
        FROM constituency_import_runs r
        LEFT JOIN users creator ON creator.id = r.created_by_user_id
        LEFT JOIN users workspace_user ON workspace_user.id = r.workspace_user_id
        WHERE r.id = ${requestedId}
        LIMIT 1
      `;
      const run = serializeRun(runs[0], { quotaPaused: blackbaudQuota.paused });

      if (!run) {
        return Response.json({ error: "Import run not found" }, { status: 404 });
      }

      const rows = await sql`
        SELECT *
        FROM constituency_import_rows
        WHERE run_id = ${requestedId}
        ORDER BY row_number ASC
      `;

      return Response.json(
        {
          previewOnly: true,
          savedRun: run,
          warnings: run.warnings,
          summary: run.summary,
          rows: rows.map((row) =>
            serializeImportRow(row, { quotaPaused: blackbaudQuota.paused }),
          ),
        },
        { headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    }

    const limitParam = Number(searchParams.get("limit") || 12);
    const limit = Number.isInteger(limitParam) && limitParam > 0 && limitParam <= 50
      ? limitParam
      : 12;

    const runs = await sql`
      SELECT
        r.*,
        creator.name AS created_by_name,
        creator.email AS created_by_email,
        workspace_user.name AS workspace_user_name,
        workspace_user.email AS workspace_user_email
      FROM constituency_import_runs r
      LEFT JOIN users creator ON creator.id = r.created_by_user_id
      LEFT JOIN users workspace_user ON workspace_user.id = r.workspace_user_id
      WHERE (${status || null}::TEXT IS NULL OR r.status = ${status || null})
      ORDER BY r.created_at DESC
      LIMIT ${limit}
    `;

    return Response.json(
      {
        runs: runs.map((run) =>
          serializeRun(run, { quotaPaused: blackbaudQuota.paused }),
        ),
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Error fetching constituency import runs:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch import runs" },
      { status: 500 },
    );
  }
}
