import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { isReviewerRole } from "@/utils/workspaceRoles";

function cleanText(value) {
  return String(value || "").trim();
}

function parseRouteParams(params) {
  const runId = cleanText(params?.id);
  const rowId = cleanText(params?.rowId);
  if (!/^\d+$/.test(runId) || !/^\d+$/.test(rowId)) {
    return { error: "Invalid import run or row ID" };
  }
  return { runId, rowId };
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function summarizeRows(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      if (row.status === "Ready") summary.ready += 1;
      if (row.status === "Needs Review") summary.needsReview += 1;
      if (row.status === "Conflict") summary.conflict += 1;
      if (row.status === "Skipped") summary.skipped += 1;
      if (row.status === "Applied") summary.applied += 1;
      if (row.status === "Failed") summary.failed += 1;
      return summary;
    },
    { total: 0, ready: 0, needsReview: 0, conflict: 0, skipped: 0, applied: 0, failed: 0 },
  );
}

async function refreshRunSummary(runId) {
  const rows = await sql`
    SELECT status
    FROM constituency_import_rows
    WHERE run_id = ${runId}
  `;
  const summary = summarizeRows(rows);
  const status = summary.failed > 0 || summary.needsReview > 0 || summary.ready > 0
    ? "partially_applied"
    : "applied";

  await sql`
    UPDATE constituency_import_runs
    SET
      status = ${status},
      summary = ${JSON.stringify(summary)}::jsonb,
      ready_count = ${summary.ready},
      needs_review_count = ${summary.needsReview},
      conflict_count = ${summary.conflict},
      skipped_count = ${summary.skipped},
      applied_count = ${summary.applied},
      failed_count = ${summary.failed},
      updated_at = NOW()
    WHERE id = ${runId}
  `;
  return summary;
}

async function requireReviewer(request) {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { sessionUser: user } = await getWorkspaceUser(session, request);
  if (!user) {
    return { error: Response.json({ error: "User not found" }, { status: 404 }) };
  }
  if (!isReviewerRole(user.role)) {
    return {
      error: Response.json(
        { error: "Only Advancement Services users can manage import rows." },
        { status: 403 },
      ),
    };
  }
  return { user };
}

export async function PATCH(request, { params }) {
  try {
    await ensureAppSchema();
    const authResult = await requireReviewer(request);
    if (authResult.error) return authResult.error;

    const routeParams = parseRouteParams(params);
    if (routeParams.error) return Response.json({ error: routeParams.error }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const action = cleanText(body?.action || "skip").toLowerCase();
    if (action !== "skip" && action !== "restore") {
      return Response.json({ error: "Action must be skip or restore" }, { status: 400 });
    }

    const rows = await sql`
      SELECT *
      FROM constituency_import_rows
      WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return Response.json({ error: "Import row not found" }, { status: 404 });

    if (action === "skip") {
      if (!["Ready", "Needs Review", "Conflict"].includes(row.status)) {
        return Response.json(
          { error: "Only rows that have not been sent to NXT can be skipped." },
          { status: 409 },
        );
      }

      const skipAudit = {
        type: "import_row_skipped",
        skippedAt: new Date().toISOString(),
        skippedByUserId: String(authResult.user.id),
        previousStatus: row.status,
        previousBlackbaudResult: row.blackbaud_result || null,
      };
      await sql`
        UPDATE constituency_import_rows
        SET
          status = 'Skipped',
          blackbaud_result = ${JSON.stringify(skipAudit)}::jsonb,
          blackbaud_error = NULL
        WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
      `;

      const summary = await refreshRunSummary(routeParams.runId);
      return Response.json({
        action,
        status: "Skipped",
        summary,
        message: "Skipped this record. No Raiser's Edge NXT data was changed.",
      });
    }

    const skipAudit = parseJson(row.blackbaud_result);
    if (row.status !== "Skipped" || skipAudit?.type !== "import_row_skipped") {
      return Response.json(
        { error: "Only rows manually skipped from this import run can be restored." },
        { status: 409 },
      );
    }

    const restoredStatus = ["Ready", "Needs Review", "Conflict"].includes(skipAudit.previousStatus)
      ? skipAudit.previousStatus
      : "Needs Review";
    const previousResult = skipAudit.previousBlackbaudResult || null;
    await sql`
      UPDATE constituency_import_rows
      SET
        status = ${restoredStatus},
        blackbaud_result = ${JSON.stringify(previousResult)}::jsonb,
        blackbaud_error = NULL
      WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
    `;

    const summary = await refreshRunSummary(routeParams.runId);
    return Response.json({
      action,
      status: restoredStatus,
      summary,
      message: "Restored this record to the import review. No Raiser's Edge NXT data was changed.",
    });
  } catch (error) {
    console.error("Error updating import row skip state:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update import row" },
      { status: 500 },
    );
  }
}
