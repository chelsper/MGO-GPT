import { auth } from "@/auth";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import {
  getFamilyRowReadiness,
  summarizeFamilyImportRows,
} from "@/utils/familyImport";
import { isReviewerRole } from "@/utils/workspaceRoles";

export function cleanText(value) {
  return String(value || "").trim();
}

export function parseJson(value, fallback) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return fallback;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function getCollection(payload) {
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.results)) return payload.results;
  return Array.isArray(payload) ? payload : [];
}

export async function requireFamilyImportReviewer(request) {
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
        { error: "Only Advancement Services users can use Family Import." },
        { status: 403 },
      ),
    };
  }

  return { user };
}

function getRowStatus(row, input, review) {
  const storedStatus = cleanText(row?.status);
  if (["Applied", "Failed", "Skipped"].includes(storedStatus)) return storedStatus;
  return getFamilyRowReadiness(input, review).ready ? "Ready" : "Needs Review";
}

export function serializeFamilyImportRow(row) {
  if (!row) return null;
  const input = parseJson(row.input, {});
  const review = parseJson(row.review, {});
  const application = parseJson(row.application, {});
  const readiness = getFamilyRowReadiness(input, review);

  return {
    id: String(row.id),
    runId: String(row.run_id),
    rowNumber: Number(row.row_number || input.rowNumber || 0),
    familyKey: cleanText(row.family_key || input.familyKey),
    status: getRowStatus(row, input, review),
    input,
    review,
    application,
    readiness,
    blackbaudResult: parseJson(row.blackbaud_result, null),
    blackbaudError: cleanText(row.blackbaud_error),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function serializeFamilyImportRun(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    status: cleanText(row.status) || "reviewing",
    sourceFilename: cleanText(row.source_filename),
    summary: parseJson(row.summary, {}),
    rowCount: Number(row.row_count || 0),
    readyCount: Number(row.ready_count || 0),
    needsReviewCount: Number(row.needs_review_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    appliedCount: Number(row.applied_count || 0),
    failedCount: Number(row.failed_count || 0),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    appliedAt: row.applied_at || null,
    createdByName: cleanText(row.created_by_name || row.created_by_email),
    createdByEmail: cleanText(row.created_by_email),
  };
}

export function parseFamilyRouteParams(params) {
  const runId = cleanText(params?.id);
  const rowId = cleanText(params?.rowId);
  if (!/^\d+$/.test(runId)) return { error: "Invalid family import run ID." };
  if (rowId && !/^\d+$/.test(rowId)) return { error: "Invalid family import row ID." };
  return { runId, rowId };
}

export async function getFamilyImportRun(runId) {
  const rows = await sql`
    SELECT
      r.*,
      creator.name AS created_by_name,
      creator.email AS created_by_email
    FROM family_import_runs r
    LEFT JOIN users creator ON creator.id = r.created_by_user_id
    WHERE r.id = ${runId}
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function getFamilyImportRow(runId, rowId) {
  const rows = await sql`
    SELECT *
    FROM family_import_rows
    WHERE run_id = ${runId}
      AND id = ${rowId}
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function getFamilyImportRunPayload(runId) {
  const run = await getFamilyImportRun(runId);
  if (!run) return null;
  const rows = await sql`
    SELECT *
    FROM family_import_rows
    WHERE run_id = ${runId}
    ORDER BY row_number ASC
  `;

  return {
    run: serializeFamilyImportRun(run),
    rows: rows.map(serializeFamilyImportRow),
  };
}

export async function refreshFamilyImportRunSummary(runId) {
  const rows = await sql`
    SELECT status
    FROM family_import_rows
    WHERE run_id = ${runId}
  `;
  const summary = summarizeFamilyImportRows(rows);
  const nextRunStatus = summary.failed > 0 ? "needs_attention" : summary.applied === summary.total && summary.total > 0 ? "applied" : "reviewing";

  await sql`
    UPDATE family_import_runs
    SET
      status = ${nextRunStatus},
      summary = ${JSON.stringify(summary)}::jsonb,
      row_count = ${summary.total},
      ready_count = ${summary.ready},
      needs_review_count = ${summary.needsReview},
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

  return summary;
}

export function findFamilyPerson(input, key) {
  if (key === "student") return input?.student || null;
  return (Array.isArray(input?.parents) ? input.parents : []).find(
    (parent) => parent?.key === key,
  ) || null;
}

export function toFamilyCandidate(value) {
  if (!value || typeof value !== "object") return null;
  const blackbaudConstituentId = cleanText(
    value.blackbaudConstituentId || value.id || value.constituent_id || value.constituentId,
  );
  if (!blackbaudConstituentId) return null;

  return {
    blackbaudConstituentId,
    lookupId: cleanText(value.lookupId || value.lookup_id),
    name: cleanText(value.name),
    email: cleanText(value.email),
  };
}

export function normalizeFamilyReview(value, previousReview = {}) {
  const candidateSelections = value?.selections && typeof value.selections === "object"
    ? value.selections
    : {};
  const previousSelections = previousReview?.selections && typeof previousReview.selections === "object"
    ? previousReview.selections
    : {};
  const selections = {};

  for (const key of ["student", "parent1", "parent2"]) {
    const nextSelection = candidateSelections[key];
    if (!nextSelection || typeof nextSelection !== "object") {
      selections[key] = previousSelections[key] || null;
      continue;
    }
    const candidate = toFamilyCandidate(nextSelection.candidate);
    const mode = cleanText(nextSelection.mode);
    selections[key] =
      key === "student"
        ? candidate
          ? { mode: "existing", candidate }
          : null
        : mode === "create"
          ? { mode: "create", confirmed: nextSelection.confirmed === true }
          : candidate
            ? { mode: "existing", candidate }
            : null;
  }

  const suppliedRelationships = value?.relationships && typeof value.relationships === "object"
    ? value.relationships
    : previousReview?.relationships || {};
  const normalizeRelationship = (relationship = {}) => ({
    type: cleanText(relationship.type),
    reciprocalType: cleanText(relationship.reciprocalType),
  });
  const spouse = suppliedRelationships.spouse || {};

  return {
    selections,
    relationships: {
      parent1: normalizeRelationship(suppliedRelationships.parent1),
      parent2: normalizeRelationship(suppliedRelationships.parent2),
      spouse: {
        enabled: spouse.enabled === true,
        type: cleanText(spouse.type),
        reciprocalType: cleanText(spouse.reciprocalType),
        householdHead: cleanText(spouse.householdHead) === "parent2" ? "parent2" : "parent1",
      },
    },
    notes: cleanText(value?.notes ?? previousReview?.notes),
  };
}
