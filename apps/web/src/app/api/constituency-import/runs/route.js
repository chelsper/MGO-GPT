import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { isReviewerRole } from "@/utils/workspaceRoles";

function cleanText(value) {
  return String(value || "").trim();
}

const QUOTA_PAUSED_MATCH_METHOD = "NXT checks paused";
const QUOTA_PAUSED_PATTERN =
  /(?:call[-\s]volume quota|out of call volume quota|quota will be replenished|nxt checks are paused)/i;

function isQuotaPausedText(value) {
  return QUOTA_PAUSED_PATTERN.test(cleanText(value));
}

function getQuotaPauseNotice(value) {
  const text = cleanText(value);
  const durationMatch = text.match(
    /(?:quota (?:will be )?replenished|replenished)\s+in\s+(\d{1,2}):(\d{2}):(\d{2})/i,
  );
  const aboutMatch = text.match(/about\s+(\d+)\s+minutes?/i);
  const durationMinutes = durationMatch
    ? Math.ceil(
        (Number(durationMatch[1]) * 60 * 60 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])) /
          60,
      )
    : Number(aboutMatch?.[1] || 0);
  const wait = durationMinutes
    ? ` Blackbaud estimates availability in about ${durationMinutes} minute${durationMinutes === 1 ? "" : "s"}.`
    : "";

  return `Blackbaud's call-volume quota is temporarily unavailable.${wait} This import row was saved safely; no NXT record was checked and no NXT change is staged or will be sent until the quota is restored.`;
}

function isLegacyQuotaPausedPreview(row, preview, storedMatchMethod) {
  if (preview?.nxtChecksPaused || storedMatchMethod === QUOTA_PAUSED_MATCH_METHOD) {
    return true;
  }

  // Earlier paused previews saved the quota response beside stale review details.
  // Treat only those explicitly safe, pre-write rows as paused when reopening them.
  const reasons = Array.isArray(preview?.reasons) ? preview.reasons.join(" ") : "";
  return (
    row.status !== "Applied" &&
    row.status !== "Failed" &&
    isQuotaPausedText(reasons) &&
    /saved safely without attempting further nxt calls|retry its review after/i.test(reasons)
  );
}

function normalizeQuotaPausedPreview(preview, notice) {
  return {
    ...preview,
    nxtChecksPaused: true,
    matchStatus: "needs_review",
    matchMethod: QUOTA_PAUSED_MATCH_METHOD,
    confidence: 0,
    match: null,
    currentCodes: [],
    currentCodeDetails: [],
    currentContacts: { emails: [], phones: [], addresses: [] },
    currentNameFormats: {
      addressee: { id: "", value: "" },
      salutation: { id: "", value: "" },
    },
    currentEducations: [],
    deferredHydration: null,
    proposedCodes: [],
    writePlan: [],
    reasons: [notice],
    intentDisposition: {
      key: "nxt_checks_paused",
      label: "NXT checks paused",
      allowApply: false,
      message:
        "This import row is saved safely. Blackbaud did not allow an NXT lookup, so it cannot be reviewed or sent until the quota is replenished.",
    },
  };
}

function serializeRun(row) {
  if (!row) return null;
  const warnings = Array.isArray(row.warnings) ? row.warnings : [];
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
    warnings: warnings.map((warning) =>
      isQuotaPausedText(warning) ? getQuotaPauseNotice(warning) : warning,
    ),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    appliedAt: row.applied_at || null,
    createdByName: row.created_by_name || row.created_by_email || "",
    createdByEmail: row.created_by_email || "",
    workspaceUserName: row.workspace_user_name || row.workspace_user_email || "",
    workspaceUserEmail: row.workspace_user_email || "",
  };
}

function serializeImportRow(row) {
  const persistedPreview = row.preview && typeof row.preview === "object" ? row.preview : {};
  const storedMatchMethod = row.match_method || persistedPreview.matchMethod || "";
  const quotaPaused = isLegacyQuotaPausedPreview(row, persistedPreview, storedMatchMethod);
  const preview = quotaPaused
    ? normalizeQuotaPausedPreview(
        persistedPreview,
        getQuotaPauseNotice(
          [storedMatchMethod, ...(Array.isArray(persistedPreview.reasons) ? persistedPreview.reasons : [])].join(" "),
        ),
      )
    : persistedPreview;
  const requestedWrites = Array.isArray(row.requested_writes) ? row.requested_writes : [];
  return {
    ...preview,
    id: String(row.id),
    runId: String(row.run_id),
    rowNumber: Number(row.row_number || preview.rowNumber || 0),
    status: row.status || preview.status || "Needs Review",
    matchStatus: quotaPaused ? preview.matchStatus : row.match_status || preview.matchStatus || "",
    matchMethod: preview.matchMethod || storedMatchMethod,
    confidence: quotaPaused ? 0 : Number(row.confidence || preview.confidence || 0),
    blackbaudResult: row.blackbaud_result || null,
    blackbaudError: row.blackbaud_error || "",
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
      const run = serializeRun(runs[0]);

      if (!run) {
        return Response.json({ error: "Import run not found" }, { status: 404 });
      }

      const rows = await sql`
        SELECT *
        FROM constituency_import_rows
        WHERE run_id = ${requestedId}
        ORDER BY row_number ASC
      `;

      return Response.json({
        previewOnly: true,
        savedRun: run,
        warnings: run.warnings,
        summary: run.summary,
        rows: rows.map(serializeImportRow),
      });
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

    return Response.json({ runs: runs.map(serializeRun) });
  } catch (error) {
    console.error("Error fetching constituency import runs:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch import runs" },
      { status: 500 },
    );
  }
}
