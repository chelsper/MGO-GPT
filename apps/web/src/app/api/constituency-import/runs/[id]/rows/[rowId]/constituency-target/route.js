import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";
import { isReviewerRole } from "@/utils/workspaceRoles";

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getCollection(payload) {
  return Array.isArray(payload?.value) ? payload.value : Array.isArray(payload) ? payload : [];
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

function getMatchedConstituentId(row) {
  const preview = getPreview(row);
  return cleanText(
    row?.matched_blackbaud_constituent_id ||
      preview.match?.blackbaudConstituentId ||
      preview.input?.blackbaudConstituentId,
  );
}

function getConstituencyLabel(value) {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value);
  return cleanText(
    value.label ||
      value.description ||
      value.constituent_code ||
      value.constituentCode ||
      value.constituency ||
      value.code ||
      value.name ||
      value.type ||
      value.category,
  );
}

function getCodeId(value) {
  return cleanText(value?.id || value?.constituent_code_id || value?.code_id);
}

function formatDate(value) {
  if (!value) return "";
  if (typeof value === "object") {
    const year = value.y || value.year;
    const month = value.m || value.month;
    const day = value.d || value.day;
    if (year && month && day) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return cleanText(value).slice(0, 10);
}

function serializeCode(value) {
  return {
    id: getCodeId(value),
    label: getConstituencyLabel(value),
    startDate: formatDate(
      value?.date_from || value?.start_date || value?.startDate || value?.start,
    ),
    endDate: formatDate(value?.date_to || value?.end_date || value?.endDate || value?.end),
  };
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

async function loadReviewContext({ request, user, runId, rowId }) {
  const rows = await sql`
    SELECT *
    FROM constituency_import_rows
    WHERE id = ${rowId} AND run_id = ${runId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return { error: "Import row not found", status: 404 };

  const writePlan = getWritePlan(row);
  const writeIndex = writePlan.findIndex(
    (write) => write?.type === "constituent_code" && write?.action === "replace",
  );
  if (writeIndex < 0) {
    return {
      error: "This import row does not have a constituency replacement to review.",
      status: 409,
    };
  }

  const constituentId = getMatchedConstituentId(row);
  if (!constituentId) {
    return {
      error: "A matched NXT constituent is required before a constituency replacement can be reviewed.",
      status: 409,
    };
  }

  const sourceConstituency = cleanText(writePlan[writeIndex]?.sourceConstituency);
  const savedCandidates = (Array.isArray(getPreview(row).currentCodeDetails)
    ? getPreview(row).currentCodeDetails
    : [])
    .map(serializeCode)
    .filter(
      (code) =>
        code.id && normalizeText(code.label) === normalizeText(sourceConstituency),
    );
  if (savedCandidates.length) {
    return {
      row,
      writePlan,
      writeIndex,
      candidates: savedCandidates,
      constituentId,
      sourceConstituency,
      candidatesFromSavedPreview: true,
    };
  }

  const payload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/constituentcodes`,
    {
      userId: user.id,
      authUserId: user.id,
      origin: new URL(request.url).origin,
    },
  );
  const candidates = getCollection(payload)
    .map(serializeCode)
    .filter(
      (code) =>
        code.id && normalizeText(code.label) === normalizeText(sourceConstituency),
    );
  if (!candidates.length) {
    return {
      error: `No current NXT ${sourceConstituency} constituent-code rows remain. Refresh the import preview before continuing.`,
      status: 409,
    };
  }

  return {
    row,
    writePlan,
    writeIndex,
    candidates,
    constituentId,
    sourceConstituency,
    candidatesFromSavedPreview: false,
  };
}

async function saveConstituencyCandidateSnapshot(context, { runId, rowId }) {
  if (context.candidatesFromSavedPreview || !context.candidates.length) return;

  const preview = getPreview(context.row);
  const existingCandidates = Array.isArray(preview.currentCodeDetails)
    ? preview.currentCodeDetails
    : [];
  const nextCandidates = Array.from(
    new Map(
      [...existingCandidates, ...context.candidates.map(serializeCode)]
        .map(serializeCode)
        .filter((candidate) => candidate.id)
        .map((candidate) => [candidate.id, candidate]),
    ).values(),
  );
  const nextPreview = {
    ...preview,
    currentCodeDetails: nextCandidates,
  };
  await sql`
    UPDATE constituency_import_rows
    SET preview = ${JSON.stringify(nextPreview)}::jsonb, updated_at = NOW()
    WHERE id = ${rowId} AND run_id = ${runId}
  `;
}

export async function GET(request, { params }) {
  try {
    await ensureAppSchema();
    const authResult = await requireReviewer(request);
    if (authResult.error) return authResult.error;

    const routeParams = parseRouteParams(params);
    if (routeParams.error) return Response.json({ error: routeParams.error }, { status: 400 });

    const context = await loadReviewContext({
      request,
      user: authResult.user,
      ...routeParams,
    });
    if (context.error) return Response.json({ error: context.error }, { status: context.status });
    await saveConstituencyCandidateSnapshot(context, routeParams);

    return Response.json({
      constituentId: context.constituentId,
      sourceConstituency: context.sourceConstituency,
      candidates: context.candidates,
      candidateCount: context.candidates.length,
    });
  } catch (error) {
    console.error("Error loading import constituency-review candidates:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load NXT constituency candidates" },
      { status: 500 },
    );
  }
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();
    const authResult = await requireReviewer(request);
    if (authResult.error) return authResult.error;

    const routeParams = parseRouteParams(params);
    if (routeParams.error) return Response.json({ error: routeParams.error }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const sourceCodeId = cleanText(body?.constituentCodeId);
    if (!sourceCodeId) {
      return Response.json({ error: "Choose one current NXT constituent-code row before continuing." }, { status: 400 });
    }

    const context = await loadReviewContext({
      request,
      user: authResult.user,
      ...routeParams,
    });
    if (context.error) return Response.json({ error: context.error }, { status: context.status });

    const selectedSourceCode = context.candidates.find((candidate) => candidate.id === sourceCodeId);
    if (!selectedSourceCode) {
      return Response.json(
        { error: "The selected NXT constituent-code row is no longer a valid candidate. Reload the current codes and review again." },
        { status: 409 },
      );
    }

    const selectedAt = new Date().toISOString();
    const nextWritePlan = context.writePlan.map((write, index) => {
      if (index !== context.writeIndex) return write;
      const { requiresReview, validationMessage, ...reviewedWrite } = write;
      return {
        ...reviewedWrite,
        sourceCodeId,
        selectedSourceCode,
        reviewSelection: {
          selectedAt,
          selectedByUserId: authResult.user.id,
          selectedByEmail: authResult.user.email || "",
          candidateCount: context.candidates.length,
        },
      };
    });
    const hasRemainingReview = nextWritePlan.some((write) => write?.requiresReview);
    const nextStatus = hasRemainingReview ? "Needs Review" : "Ready";
    const preview = getPreview(context.row);
    const nextPreview = {
      ...preview,
      status: nextStatus,
      writePlan: nextWritePlan,
      reasons: [
        ...(Array.isArray(preview.reasons) ? preview.reasons : []).filter(
          (reason) => !/Choose the exact current NXT constituent-code row/i.test(reason),
        ),
        `Advancement Services selected NXT constituent-code ID ${sourceCodeId} to remove before creating the new code.`,
        ...(hasRemainingReview
          ? ["Other staged changes still require review before this record can be applied."]
          : []),
      ],
    };
    const previousResult =
      context.row.blackbaud_result && typeof context.row.blackbaud_result === "object"
        ? context.row.blackbaud_result
        : {};
    const nextResult = {
      ...previousResult,
      constituencyReview: {
        sourceCodeId,
        sourceConstituency: context.sourceConstituency,
        selectedSourceCode,
        candidateCount: context.candidates.length,
        selectedAt,
        selectedByUserId: authResult.user.id,
        selectedByEmail: authResult.user.email || "",
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
      message: hasRemainingReview
        ? "Saved the current NXT code selection. This record still has other items to review."
        : "Saved the current NXT code selection. This record is ready to send to NXT.",
      status: nextStatus,
      sourceCodeId,
    });
  } catch (error) {
    console.error("Error selecting import constituency-review source:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save the NXT code selection" },
      { status: 500 },
    );
  }
}
