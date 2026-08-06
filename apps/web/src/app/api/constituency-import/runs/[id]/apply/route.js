import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";
import { isReviewerRole } from "@/utils/workspaceRoles";

function cleanText(value) {
  return String(value || "").trim();
}

function serializeRun(row) {
  if (!row) return null;
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
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
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
  const preview = row.preview && typeof row.preview === "object" ? row.preview : {};
  const requestedWrites = Array.isArray(row.requested_writes) ? row.requested_writes : [];
  return {
    ...preview,
    id: String(row.id),
    runId: String(row.run_id),
    rowNumber: Number(row.row_number || preview.rowNumber || 0),
    status: row.status || preview.status || "Needs Review",
    matchStatus: row.match_status || preview.matchStatus || "",
    matchMethod: row.match_method || preview.matchMethod || "",
    confidence: Number(row.confidence || preview.confidence || 0),
    blackbaudResult: row.blackbaud_result || null,
    blackbaudError: row.blackbaud_error || "",
    writePlan: Array.isArray(preview.writePlan) ? preview.writePlan : requestedWrites,
    appliedAt: row.applied_at || null,
  };
}

function getWritePlan(row) {
  if (Array.isArray(row.requested_writes) && row.requested_writes.length > 0) {
    return row.requested_writes;
  }
  const preview = row.preview && typeof row.preview === "object" ? row.preview : {};
  return Array.isArray(preview.writePlan) ? preview.writePlan : [];
}

function getMatchedConstituentId(row) {
  const preview = row.preview && typeof row.preview === "object" ? row.preview : {};
  return (
    cleanText(row.matched_blackbaud_constituent_id) ||
    cleanText(preview.match?.blackbaudConstituentId) ||
    cleanText(preview.input?.blackbaudConstituentId)
  );
}

function formatDateForBlackbaud(value) {
  const text = cleanText(value);
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString().slice(0, 10);
}

async function requireReviewer(request) {
  const session = await auth();
  if (!session || !session.user?.email) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { workspaceUser: user } = await getWorkspaceUser(session, request);
  if (!user) {
    return { error: Response.json({ error: "User not found" }, { status: 404 }) };
  }
  if (!isReviewerRole(user.role)) {
    return {
      error: Response.json(
        { error: "Only Advancement Services users can apply import runs." },
        { status: 403 },
      ),
    };
  }

  return { user };
}

async function applyConstituentCodeAdd({ request, user, row, write }) {
  const constituentId = getMatchedConstituentId(row);
  const targetConstituency = cleanText(write.targetConstituency || row.target_constituency);

  if (!constituentId || !targetConstituency) {
    return {
      status: "manual_required",
      type: write.type || "constituent_code",
      action: write.action || "add",
      message: "Missing matched NXT constituent ID or target constituent code.",
    };
  }

  const payload = {
    constituent_id: String(constituentId),
    description: targetConstituency,
  };
  const startDate = formatDateForBlackbaud(write.startDate || row.start_date);
  const endDate = formatDateForBlackbaud(write.endDate || row.end_date);
  if (startDate) payload.date_from = startDate;
  if (endDate) payload.date_to = endDate;

  const result = await blackbaudApiFetch("/constituent/v1/constituentcodes", {
    userId: user.id,
    authUserId: user.id,
    origin: new URL(request.url).origin,
    method: "POST",
    body: payload,
  });

  return {
    status: "applied",
    type: "constituent_code",
    action: "add",
    targetConstituency,
    blackbaudResult: result || null,
  };
}

async function applyWrite({ request, user, row, write }) {
  if (write?.type === "constituent_code" && write?.action === "add") {
    return applyConstituentCodeAdd({ request, user, row, write });
  }

  if (write?.type === "constituent_code") {
    return {
      status: "manual_required",
      type: "constituent_code",
      action: write?.action || "review",
      message:
        "Only additive constituent-code writes are automated in this stage. Replace and end-date rows still require manual NXT review.",
    };
  }

  if (write?.type === "education_relationship") {
    return {
      status: "manual_required",
      type: "education_relationship",
      action: write?.action || "review",
      message:
        "Education relationship writes are staged for manual NXT review until relationship endpoint payloads are validated.",
    };
  }

  if (write?.type === "organization_relationship") {
    return {
      status: "manual_required",
      type: "organization_relationship",
      action: write?.action || "review",
      message:
        "Organization relationship writes are staged for manual NXT review until relationship endpoint payloads are validated.",
    };
  }

  return {
    status: "manual_required",
    type: write?.type || "unknown",
    action: write?.action || "review",
    message: "This staged write type is not automated yet.",
  };
}

function summarizeRows(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.status === "Ready") acc.ready += 1;
      if (row.status === "Needs Review") acc.needsReview += 1;
      if (row.status === "Conflict") acc.conflict += 1;
      if (row.status === "Skipped") acc.skipped += 1;
      if (row.status === "Applied") acc.applied += 1;
      if (row.status === "Failed") acc.failed += 1;
      return acc;
    },
    { total: 0, ready: 0, needsReview: 0, conflict: 0, skipped: 0, applied: 0, failed: 0 },
  );
}

async function fetchRunWithRows(runId) {
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
    WHERE r.id = ${runId}
    LIMIT 1
  `;
  const run = serializeRun(runs[0]);

  if (!run) {
    return null;
  }

  const rows = await sql`
    SELECT *
    FROM constituency_import_rows
    WHERE run_id = ${runId}
    ORDER BY row_number ASC
  `;

  return {
    previewOnly: false,
    savedRun: run,
    warnings: run.warnings,
    summary: run.summary,
    rows: rows.map(serializeImportRow),
  };
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();

    const authResult = await requireReviewer(request);
    if (authResult.error) return authResult.error;

    const runId = cleanText(params?.id);
    if (!/^\d+$/.test(runId)) {
      return Response.json({ error: "Invalid import run ID" }, { status: 400 });
    }

    const runs = await sql`
      SELECT *
      FROM constituency_import_runs
      WHERE id = ${runId}
      LIMIT 1
    `;

    if (!runs[0]) {
      return Response.json({ error: "Import run not found" }, { status: 404 });
    }

    const candidateRows = await sql`
      SELECT *
      FROM constituency_import_rows
      WHERE run_id = ${runId}
        AND status = 'Ready'
        AND applied_at IS NULL
      ORDER BY row_number ASC
    `;

    if (!candidateRows.length) {
      const payload = await fetchRunWithRows(runId);
      return Response.json({
        ...payload,
        applySummary: {
          applied: 0,
          manualRequired: 0,
          failed: 0,
          message: "No ready unapplied rows were available to apply.",
        },
      });
    }

    let applied = 0;
    let manualRequired = 0;
    let failed = 0;

    for (const row of candidateRows) {
      const writePlan = getWritePlan(row);

      try {
        const results = [];
        for (const write of writePlan) {
          results.push(await applyWrite({ request, user: authResult.user, row, write }));
        }

        const appliedWrites = results.filter((result) => result.status === "applied");
        const manualWrites = results.filter((result) => result.status === "manual_required");
        const nextStatus = manualWrites.length ? "Needs Review" : "Applied";

        if (appliedWrites.length) applied += 1;
        if (manualWrites.length) manualRequired += 1;

        await sql`
          UPDATE constituency_import_rows
          SET
            status = ${nextStatus},
            blackbaud_result = ${JSON.stringify({
              appliedByUserId: authResult.user.id,
              appliedByEmail: authResult.user.email,
              appliedAt: new Date().toISOString(),
              results,
            })}::jsonb,
            blackbaud_error = NULL,
            applied_at = CASE
              WHEN ${appliedWrites.length}::INTEGER > 0 THEN NOW()
              ELSE applied_at
            END,
            updated_at = NOW()
          WHERE id = ${row.id}
        `;
      } catch (rowError) {
        failed += 1;
        await sql`
          UPDATE constituency_import_rows
          SET
            status = 'Failed',
            blackbaud_error = ${rowError instanceof Error ? rowError.message : "Failed to apply row"},
            blackbaud_result = ${JSON.stringify({
              appliedByUserId: authResult.user.id,
              appliedByEmail: authResult.user.email,
              failedAt: new Date().toISOString(),
            })}::jsonb,
            updated_at = NOW()
          WHERE id = ${row.id}
        `;
      }
    }

    const updatedRows = await sql`
      SELECT *
      FROM constituency_import_rows
      WHERE run_id = ${runId}
    `;
    const summary = summarizeRows(updatedRows);
    const nextRunStatus =
      summary.failed > 0 || summary.needsReview > 0 || summary.ready > 0
        ? "partially_applied"
        : "applied";

    await sql`
      UPDATE constituency_import_runs
      SET
        status = ${nextRunStatus},
        summary = ${JSON.stringify(summary)}::jsonb,
        ready_count = ${summary.ready},
        needs_review_count = ${summary.needsReview},
        conflict_count = ${summary.conflict},
        skipped_count = ${summary.skipped},
        applied_count = ${summary.applied},
        failed_count = ${summary.failed},
        applied_at = CASE
          WHEN ${summary.applied}::INTEGER > 0 THEN COALESCE(applied_at, NOW())
          ELSE applied_at
        END,
        updated_at = NOW()
      WHERE id = ${runId}
    `;

    const payload = await fetchRunWithRows(runId);
    return Response.json({
      ...payload,
      applySummary: {
        applied,
        manualRequired,
        failed,
        message: `Applied ${applied} row${applied === 1 ? "" : "s"}; ${manualRequired} need manual review; ${failed} failed.`,
      },
    });
  } catch (error) {
    console.error("Error applying constituency import run:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to apply import run" },
      { status: 500 },
    );
  }
}
