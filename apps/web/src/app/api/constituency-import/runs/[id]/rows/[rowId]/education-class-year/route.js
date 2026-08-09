import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { isReviewerRole } from "@/utils/workspaceRoles";

const CLASS_YEAR_REVIEW_PATTERN =
  /^Education Class Year must .*digit.* before it can be imported\.$/i;

function cleanText(value) {
  return String(value || "").trim();
}

function getPreview(row) {
  return row?.preview && typeof row.preview === "object" ? row.preview : {};
}

function getWritePlan(row) {
  if (Array.isArray(row?.requested_writes) && row.requested_writes.length) {
    return row.requested_writes;
  }
  return Array.isArray(getPreview(row).writePlan) ? getPreview(row).writePlan : [];
}

function isEducationClassYearReview(write) {
  return (
    write?.type === "education_relationship" &&
    write?.requiresReview &&
    CLASS_YEAR_REVIEW_PATTERN.test(cleanText(write?.validationMessage))
  );
}

function getMatchedConstituentId(row) {
  const preview = getPreview(row);
  return cleanText(
    row?.matched_blackbaud_constituent_id ||
      preview.match?.blackbaudConstituentId ||
      preview.input?.blackbaudConstituentId,
  );
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
  const nextStatus = summary.failed > 0 || summary.needsReview > 0 || summary.ready > 0
    ? "partially_applied"
    : "applied";

  await sql`
    UPDATE constituency_import_runs
    SET
      status = ${nextStatus},
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
        { error: "Only Advancement Services users can review import rows." },
        { status: 403 },
      ),
    };
  }
  return { user };
}

function parseRouteParams(params) {
  const runId = cleanText(params?.id);
  const rowId = cleanText(params?.rowId);
  if (!/^\d+$/.test(runId) || !/^\d+$/.test(rowId)) {
    return { error: "Invalid import run or row ID" };
  }
  return { runId, rowId };
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();
    const authResult = await requireReviewer(request);
    if (authResult.error) return authResult.error;

    const routeParams = parseRouteParams(params);
    if (routeParams.error) return Response.json({ error: routeParams.error }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const classYear = cleanText(body?.classYear);
    if (!/^\d{2}(\d{2})?$/.test(classYear)) {
      return Response.json(
        { error: "Enter a two- or four-digit Education Class Year, such as 26 or 2026." },
        { status: 400 },
      );
    }

    const rows = await sql`
      SELECT *
      FROM constituency_import_rows
      WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      return Response.json({ error: "Import row not found" }, { status: 404 });
    }
    if (!getMatchedConstituentId(row)) {
      return Response.json(
        { error: "Confirm a matched NXT constituent before resolving the Education Class Year." },
        { status: 409 },
      );
    }

    const writePlan = getWritePlan(row);
    const writeIndex = writePlan.findIndex(isEducationClassYearReview);
    if (writeIndex < 0) {
      return Response.json(
        { error: "This import row does not have an Education Class Year review to resolve." },
        { status: 409 },
      );
    }

    const reviewedAt = new Date().toISOString();
    const priorClassYear = cleanText(writePlan[writeIndex]?.classYear);
    const nextWritePlan = writePlan.map((write, index) => {
      if (index !== writeIndex) return write;
      const { requiresReview, validationMessage, ...reviewedWrite } = write;
      return {
        ...reviewedWrite,
        classYear,
        classYearReview: {
          priorClassYear,
          confirmedClassYear: classYear,
          confirmedAt: reviewedAt,
          confirmedByUserId: authResult.user.id,
          confirmedByEmail: authResult.user.email || "",
        },
      };
    });
    const hasRemainingReview = nextWritePlan.some((write) => write?.requiresReview);
    const nextStatus = hasRemainingReview ? "Needs Review" : "Ready";
    const preview = getPreview(row);
    const nextPreview = {
      ...preview,
      status: nextStatus,
      writePlan: nextWritePlan,
      reasons: [
        ...(Array.isArray(preview.reasons) ? preview.reasons : []).filter(
          (reason) => !CLASS_YEAR_REVIEW_PATTERN.test(cleanText(reason)),
        ),
        `Advancement Services confirmed Education Class Year ${classYear} from CSV value ${priorClassYear || "not set"}.`,
        ...(hasRemainingReview
          ? ["Other staged changes still require review before this record can be applied."]
          : []),
      ],
    };
    const priorResult =
      row.blackbaud_result && typeof row.blackbaud_result === "object"
        ? row.blackbaud_result
        : {};
    const nextResult = {
      ...priorResult,
      educationClassYearReview: {
        priorClassYear,
        confirmedClassYear: classYear,
        confirmedAt: reviewedAt,
        confirmedByUserId: authResult.user.id,
        confirmedByEmail: authResult.user.email || "",
      },
    };

    await sql`
      UPDATE constituency_import_rows
      SET
        status = ${nextStatus},
        preview = ${JSON.stringify(nextPreview)}::jsonb,
        requested_writes = ${JSON.stringify(nextWritePlan)}::jsonb,
        blackbaud_result = ${JSON.stringify(nextResult)}::jsonb,
        blackbaud_error = NULL,
        updated_at = NOW()
      WHERE id = ${routeParams.rowId} AND run_id = ${routeParams.runId}
    `;
    await refreshRunSummary(routeParams.runId);

    return Response.json({
      classYear,
      status: nextStatus,
      message: hasRemainingReview
        ? `Saved Education Class Year ${classYear}. This record still has other items to review.`
        : `Saved Education Class Year ${classYear}. This record is ready to send to NXT.`,
    });
  } catch (error) {
    console.error("Error saving import education class-year review:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save the Education Class Year" },
      { status: 500 },
    );
  }
}
