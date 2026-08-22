import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";
import { isReviewerRole } from "@/utils/workspaceRoles";

const CLASS_YEAR_REVIEW_PATTERN =
  /^Education Class Year must .*digit.* before it can be imported\.$/i;

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

function getSavedEducationCandidates(row) {
  const candidates = Array.isArray(getPreview(row).currentEducations)
    ? getPreview(row).currentEducations
    : [];
  return candidates.filter((candidate) => getEducationId(candidate));
}

function hasSavedEducationSnapshot(row) {
  const preview = getPreview(row);
  return preview.educationsSnapshotLoaded === true && Array.isArray(preview.currentEducations);
}

function getSavedConstituencyCandidates(row, sourceConstituency) {
  const candidates = Array.isArray(getPreview(row).currentCodeDetails)
    ? getPreview(row).currentCodeDetails
    : [];
  return candidates
    .map(serializeCode)
    .filter(
      (candidate) =>
        candidate.id &&
        normalizeText(candidate.label) === normalizeText(sourceConstituency),
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

function getPendingEducationTargetIndex(writePlan) {
  return writePlan.findIndex(
    (write) =>
      write?.type === "education_relationship" && write?.action === "review_existing",
  );
}

function getPendingConstituencyIndex(writePlan) {
  return writePlan.findIndex(
    (write) =>
      write?.type === "constituent_code" &&
      write?.action === "replace" &&
      !cleanText(write?.sourceCodeId),
  );
}

function getPendingClassYearIndex(writePlan) {
  return writePlan.findIndex(
    (write) =>
      write?.type === "education_relationship" &&
      write?.requiresReview &&
      CLASS_YEAR_REVIEW_PATTERN.test(cleanText(write?.validationMessage)),
  );
}

function buildResponseRow(row, status, nextPreview, nextWritePlan, nextResult) {
  return {
    ...row,
    status,
    reasons: Array.isArray(nextPreview?.reasons) ? nextPreview.reasons : [],
    preview: nextPreview,
    writePlan: nextWritePlan,
    requested_writes: nextWritePlan,
    blackbaudResult: nextResult,
    blackbaud_error: null,
  };
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();
    const authResult = await requireReviewer(request);
    if (authResult.error) return authResult.error;

    const routeParams = parseRouteParams(params);
    if (routeParams.error) return Response.json({ error: routeParams.error }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const educationId = cleanText(body?.educationId);
    const constituentCodeId = cleanText(body?.constituentCodeId);
    const classYear = cleanText(body?.classYear);

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

    const constituentId = getMatchedConstituentId(row);
    if (!constituentId) {
      return Response.json(
        { error: "Confirm a matched NXT constituent before reviewing this row." },
        { status: 409 },
      );
    }

    const writePlan = getWritePlan(row);
    const pendingEducationTargetIndex = getPendingEducationTargetIndex(writePlan);
    const pendingConstituencyIndex = getPendingConstituencyIndex(writePlan);
    const pendingClassYearIndex = getPendingClassYearIndex(writePlan);

    if (
      pendingEducationTargetIndex < 0 &&
      pendingConstituencyIndex < 0 &&
      pendingClassYearIndex < 0
    ) {
      return Response.json(
        { error: "This import row does not have any pending review items to confirm." },
        { status: 409 },
      );
    }

    let educations = null;
    let refreshedEducationSnapshot = null;
    let codes = null;
    const reviewNotes = [];
    const nextWritePlan = writePlan.map((write) => ({ ...write }));
    const priorResult =
      row.blackbaud_result && typeof row.blackbaud_result === "object"
        ? row.blackbaud_result
        : {};
    const nextResult = { ...priorResult };
    const selectedAt = new Date().toISOString();

    if (pendingEducationTargetIndex >= 0) {
      educations = getSavedEducationCandidates(row);
      if (!educations.length && !hasSavedEducationSnapshot(row)) {
        const payload = await blackbaudApiFetch(
          `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/educations`,
          {
            userId: authResult.user.id,
            authUserId: authResult.user.id,
            origin: new URL(request.url).origin,
          },
        );
        educations = getCollection(payload);
        refreshedEducationSnapshot = educations.map(serializeEducation);
      }

      const existingWrite = nextWritePlan[pendingEducationTargetIndex];
      const { requiresReview, validationMessage, deferredHydration, ...reviewedWrite } = existingWrite;

      if (!educations.length) {
        // A review-update has nothing to replace when this constituent has no
        // education records. Keep the operation duplicate-safe and add it instead.
        nextWritePlan[pendingEducationTargetIndex] = {
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
        nextResult.educationReview = {
          action: "add",
          noCurrentEducation: true,
          selectedAt,
          selectedByUserId: authResult.user.id,
          selectedByEmail: authResult.user.email || "",
        };
        reviewNotes.push(
          "No current NXT education relationship was found, so this CSV relationship will be added safely when the row is sent to NXT.",
        );
      } else {
        if (!educationId) {
          return Response.json(
            { error: "Choose the current NXT education row before saving this row review." },
            { status: 400 },
          );
        }
        const target = educations.find((candidate) => getEducationId(candidate) === educationId);
        if (!target) {
          return Response.json(
            { error: "The selected NXT education row is no longer a valid candidate. Reload the row and try again." },
            { status: 409 },
          );
        }

        nextWritePlan[pendingEducationTargetIndex] = {
          ...reviewedWrite,
          action: "update",
          targetEducationId: educationId,
          existingEducation: serializeEducation(target),
          reviewSelection: {
            selectedAt,
            selectedByUserId: authResult.user.id,
            selectedByEmail: authResult.user.email || "",
            candidateCount: educations.length,
          },
        };
        nextResult.educationReview = {
          targetEducationId: educationId,
          candidateCount: educations.length,
          selectedAt,
          selectedByUserId: authResult.user.id,
          selectedByEmail: authResult.user.email || "",
        };
        reviewNotes.push(
          `Advancement Services selected current NXT education ID ${educationId} as the source row for this education update.`,
        );
      }
    }

    if (pendingConstituencyIndex >= 0) {
      if (!constituentCodeId) {
        return Response.json(
          { error: "Choose the current NXT constituent-code row before saving this row review." },
          { status: 400 },
        );
      }

      const sourceConstituency = cleanText(
        nextWritePlan[pendingConstituencyIndex]?.sourceConstituency,
      );
      codes = getSavedConstituencyCandidates(row, sourceConstituency);
      if (!codes.length) {
        const payload = await blackbaudApiFetch(
          `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/constituentcodes`,
          {
            userId: authResult.user.id,
            authUserId: authResult.user.id,
            origin: new URL(request.url).origin,
          },
        );
        codes = getCollection(payload)
          .map(serializeCode)
          .filter(
            (code) =>
              code.id && normalizeText(code.label) === normalizeText(sourceConstituency),
          );
      }
      const selectedSourceCode = codes.find((candidate) => candidate.id === constituentCodeId);
      if (!selectedSourceCode) {
        return Response.json(
          { error: "The selected NXT constituent-code row is no longer a valid candidate. Reload the row and try again." },
          { status: 409 },
        );
      }

      const existingWrite = nextWritePlan[pendingConstituencyIndex];
      const { requiresReview, validationMessage, ...reviewedWrite } = existingWrite;
      nextWritePlan[pendingConstituencyIndex] = {
        ...reviewedWrite,
        sourceCodeId: constituentCodeId,
        selectedSourceCode,
        reviewSelection: {
          selectedAt,
          selectedByUserId: authResult.user.id,
          selectedByEmail: authResult.user.email || "",
          candidateCount: codes.length,
        },
      };
      nextResult.constituencyReview = {
        sourceCodeId: constituentCodeId,
        sourceConstituency,
        selectedSourceCode,
        candidateCount: codes.length,
        selectedAt,
        selectedByUserId: authResult.user.id,
        selectedByEmail: authResult.user.email || "",
      };
      reviewNotes.push(
        `Advancement Services selected NXT constituent-code ID ${constituentCodeId} to remove before creating the new code.`,
      );
    }

    if (pendingClassYearIndex >= 0) {
      if (!/^\d{2}(\d{2})?$/.test(classYear)) {
        return Response.json(
          { error: "Enter a two- or four-digit Education Class Year, such as 26 or 2026." },
          { status: 400 },
        );
      }

      const priorClassYear = cleanText(nextWritePlan[pendingClassYearIndex]?.classYear);
      const existingWrite = nextWritePlan[pendingClassYearIndex];
      const { requiresReview, validationMessage, ...reviewedWrite } = existingWrite;
      nextWritePlan[pendingClassYearIndex] = {
        ...reviewedWrite,
        classYear,
        classYearReview: {
          priorClassYear,
          confirmedClassYear: classYear,
          confirmedAt: selectedAt,
          confirmedByUserId: authResult.user.id,
          confirmedByEmail: authResult.user.email || "",
        },
      };
      nextResult.educationClassYearReview = {
        priorClassYear,
        confirmedClassYear: classYear,
        confirmedAt: selectedAt,
        confirmedByUserId: authResult.user.id,
        confirmedByEmail: authResult.user.email || "",
      };
      reviewNotes.push(
        `Advancement Services confirmed Education Class Year ${classYear} from CSV value ${priorClassYear || "not set"}.`,
      );
    }

    const hasRemainingReview = nextWritePlan.some((write) => write?.requiresReview);
    const nextStatus = hasRemainingReview ? "Needs Review" : "Ready";
    const preview = getPreview(row);
    const nextPreview = {
      ...preview,
      status: nextStatus,
      writePlan: nextWritePlan,
      ...(refreshedEducationSnapshot !== null
        ? {
            currentEducations: refreshedEducationSnapshot,
            educationsSnapshotLoaded: true,
          }
        : {}),
      reasons: [
        ...(Array.isArray(preview.reasons) ? preview.reasons : []).filter(
          (reason) =>
            !/Education relationship data is staged for review\./i.test(reason) &&
            !/possible NXT education rows/i.test(reason) &&
            !/Choose the exact current NXT education row/i.test(reason) &&
            !/Choose the exact current NXT constituent-code row/i.test(reason) &&
            !CLASS_YEAR_REVIEW_PATTERN.test(cleanText(reason)),
        ),
        ...reviewNotes,
        ...(hasRemainingReview
          ? ["Other staged changes still require review before this record can be applied."]
          : []),
      ],
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
      status: nextStatus,
      message: hasRemainingReview
        ? "Saved this row review. This record still has other items to review."
        : "Saved this row review. This record is ready to send to NXT.",
      reasons: nextPreview.reasons,
      preview: nextPreview,
      writePlan: nextWritePlan,
      blackbaudResult: nextResult,
      row: buildResponseRow(row, nextStatus, nextPreview, nextWritePlan, nextResult),
    });
  } catch (error) {
    console.error("Error saving combined constituency import row review:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save this row review" },
      { status: 500 },
    );
  }
}
