import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";
import { isReviewerRole } from "@/utils/workspaceRoles";

function cleanText(value) {
  return String(value || "").trim();
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

function getConfirmedEducationWrite(writePlan) {
  return (Array.isArray(writePlan) ? writePlan : []).find(
    (write) =>
      write?.type === "education_relationship" &&
      write?.action === "update" &&
      cleanText(write?.targetEducationId),
  ) || null;
}

function getMatchedConstituentId(row) {
  const preview = getPreview(row);
  return cleanText(
    row?.matched_blackbaud_constituent_id ||
      preview.match?.blackbaudConstituentId ||
      preview.input?.blackbaudConstituentId,
  );
}

function getEducationId(value) {
  return cleanText(value?.id || value?.education_id);
}

function getEducationSchool(value) {
  if (typeof value === "string") return cleanText(value);
  const school = value?.school || value?.school_name || value?.institution || value?.name;
  if (typeof school === "string") return cleanText(school);
  return cleanText(school?.name || school?.description || school?.value);
}

function getEducationValueText(value) {
  if (typeof value === "string" || typeof value === "number") return cleanText(value);
  return cleanText(value?.name || value?.description || value?.value || value?.degree || value?.major);
}

function getEducationValues(value, pluralKey, singularKeys) {
  const values = [];
  const pluralValue = value?.[pluralKey];
  if (Array.isArray(pluralValue)) {
    pluralValue.forEach((item) => values.push(getEducationValueText(item)));
  } else if (pluralValue) {
    values.push(getEducationValueText(pluralValue));
  }
  singularKeys.forEach((key) => values.push(getEducationValueText(value?.[key])));
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function getEducationClassYear(value) {
  return cleanText(value?.class_of || value?.class_year || value?.classYear || value?.class);
}

function formatEducationDate(value) {
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

function serializeEducation(value) {
  return {
    id: getEducationId(value),
    school: getEducationSchool(value),
    degrees: getEducationValues(value, "degrees", ["degree", "degree_name"]),
    majors: getEducationValues(value, "majors", ["major", "major_name"]),
    minors: getEducationValues(value, "minors", ["minor", "minor_name"]),
    schoolType: getEducationValueText(value?.type ?? value?.school_type ?? value?.schoolType),
    campus: getEducationValueText(value?.campus),
    fraternitySorority: getEducationValueText(
      value?.social_organization ?? value?.fraternity_sorority,
    ),
    gpa: cleanText(value?.gpa),
    classYear: getEducationClassYear(value),
    status: getEducationValueText(value?.status),
    dateGraduated: formatEducationDate(
      value?.date_graduated ?? value?.graduation_date ?? value?.dateGraduated,
    ),
    dateEntered: formatEducationDate(value?.date_entered ?? value?.dateEntered),
    dateLeft: formatEducationDate(value?.date_left ?? value?.dateLeft),
    primary: Boolean(value?.primary ?? value?.is_primary),
  };
}

function getSelectableEducations(currentEducations) {
  // The CSV can correct any education detail, including the institution. Show every current
  // education row and require an explicit source-row selection rather than guessing a match.
  return (Array.isArray(currentEducations) ? currentEducations : []).filter((education) =>
    getEducationId(education),
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
    (write) =>
      write?.type === "education_relationship" && write?.action === "review_existing",
  );
  if (writeIndex < 0) {
    return {
      row,
      writePlan,
      writeIndex,
      constituentId: getMatchedConstituentId(row),
      candidates: [],
      alreadyResolved: true,
      targetEducationId: cleanText(getConfirmedEducationWrite(writePlan)?.targetEducationId),
    };
  }

  const constituentId = getMatchedConstituentId(row);
  if (!constituentId) {
    return {
      error: "A matched NXT constituent is required before an education relationship can be reviewed.",
      status: 409,
    };
  }

  const savedCandidates = getSelectableEducations(getPreview(row).currentEducations);
  if (savedCandidates.length) {
    return {
      row,
      writePlan,
      writeIndex,
      candidates: savedCandidates,
      constituentId,
      candidatesFromSavedPreview: true,
    };
  }

  const payload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/educations`,
    {
      userId: user.id,
      authUserId: user.id,
      origin: new URL(request.url).origin,
    },
  );
  const candidates = getSelectableEducations(getCollection(payload));
  if (!candidates.length) {
    return {
      row,
      writePlan,
      writeIndex,
      candidates: [],
      constituentId,
      candidatesFromSavedPreview: false,
      noCurrentEducation: true,
    };
  }

  return {
    row,
    writePlan,
    writeIndex,
    candidates,
    constituentId,
    candidatesFromSavedPreview: false,
  };
}

async function saveEducationCandidateSnapshot(context, { runId, rowId }) {
  if (context.candidatesFromSavedPreview || !context.candidates.length) return;

  const nextPreview = {
    ...getPreview(context.row),
    currentEducations: context.candidates.map(serializeEducation),
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
    await saveEducationCandidateSnapshot(context, routeParams);

    return Response.json({
      constituentId: context.constituentId,
      candidates: context.candidates.map(serializeEducation),
      candidateCount: context.candidates.length,
      alreadyResolved: context.alreadyResolved === true,
      targetEducationId: context.targetEducationId || null,
      noCurrentEducation: context.noCurrentEducation === true,
    });
  } catch (error) {
    console.error("Error loading import education-review candidates:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load NXT education candidates" },
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

    const context = await loadReviewContext({
      request,
      user: authResult.user,
      ...routeParams,
    });
    if (context.error) return Response.json({ error: context.error }, { status: context.status });

    if (context.alreadyResolved) {
      return Response.json({
        message: context.targetEducationId
          ? "The selected NXT education source row is already saved."
          : "No NXT education source-row review is required for this record.",
        status: context.row.status,
        targetEducationId: context.targetEducationId || null,
        alreadyResolved: true,
      });
    }

    if (context.noCurrentEducation) {
      const selectedAt = new Date().toISOString();
      const nextWritePlan = context.writePlan.map((write, index) => {
        if (index !== context.writeIndex) return write;
        const { requiresReview, validationMessage, deferredHydration, ...reviewedWrite } = write;
        return {
          ...reviewedWrite,
          action: "add",
          duplicatePolicy: "skip_if_matching",
          reviewSelection: {
            selectedAt,
            selectedByUserId: authResult.user.id,
            selectedByEmail: authResult.user.email || "",
            noCurrentEducation: true,
          },
        };
      });
      const hasRemainingReview = nextWritePlan.some((write) => write?.requiresReview);
      const nextStatus = hasRemainingReview ? "Needs Review" : "Ready";
      const preview = getPreview(context.row);
      const nextPreview = {
        ...preview,
        status: nextStatus,
        currentEducations: [],
        educationsSnapshotLoaded: true,
        writePlan: nextWritePlan,
        reasons: [
          ...(Array.isArray(preview.reasons) ? preview.reasons : []).filter(
            (reason) =>
              !/Education relationship data is staged for review\./i.test(reason) &&
              !/possible NXT education rows/i.test(reason) &&
              !/Choose the exact current NXT education row/i.test(reason),
          ),
          "No current NXT education relationship was found, so this CSV relationship will be added safely when the row is sent to NXT.",
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
        educationReview: {
          action: "add",
          noCurrentEducation: true,
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
          ? "Saved this education add. This record still has other items to review."
          : "No current NXT education was found, so this record is ready to add the CSV relationship.",
        status: nextStatus,
        alreadyResolved: true,
        noCurrentEducation: true,
      });
    }

    const body = await request.json().catch(() => ({}));
    const targetEducationId = cleanText(body?.educationId);
    if (!targetEducationId) {
      return Response.json({ error: "Choose one NXT education row before continuing." }, { status: 400 });
    }

    const target = context.candidates.find(
      (candidate) => getEducationId(candidate) === targetEducationId,
    );
    if (!target) {
      return Response.json(
        { error: "The selected NXT education row is no longer a valid candidate. Reload the candidates and review again." },
        { status: 409 },
      );
    }

    const selectedAt = new Date().toISOString();
    const nextWritePlan = context.writePlan.map((write, index) => {
      if (index !== context.writeIndex) return write;
      const { requiresReview, validationMessage, ...reviewedWrite } = write;
      return {
        ...reviewedWrite,
        action: "update",
        targetEducationId,
        existingEducation: serializeEducation(target),
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
          (reason) =>
            !/Education relationship data is staged for review\./i.test(reason) &&
            !/possible NXT education rows/i.test(reason) &&
            !/Choose the exact current NXT education row/i.test(reason),
        ),
        `Advancement Services selected current NXT education ID ${targetEducationId} as the source row for this education update.`,
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
      educationReview: {
        targetEducationId,
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
        ? "Saved the education-row selection. This record still has other items to review."
        : "Saved the NXT education-row selection. This record is ready to apply to NXT.",
      status: nextStatus,
      targetEducationId,
    });
  } catch (error) {
    console.error("Error selecting import education-review target:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save the education-row selection" },
      { status: 500 },
    );
  }
}
