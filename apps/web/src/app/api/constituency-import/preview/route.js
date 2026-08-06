import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { isReviewerRole } from "@/utils/workspaceRoles";
import {
  blackbaudApiFetch,
  findBlackbaudConstituentByLookupId,
  getBlackbaudConstituentById,
  searchBlackbaudConstituents,
} from "@/app/api/utils/blackbaud";

const MAX_PREVIEW_ROWS = 100;

const STATUS = {
  ready: "Ready",
  needsReview: "Needs Review",
  skipped: "Skipped",
  conflict: "Conflict",
};

const ACTION_ALIASES = new Map([
  ["replace", "replace"],
  ["replace current", "replace"],
  ["replace constituency", "replace"],
  ["add", "add"],
  ["append", "add"],
  ["add constituency", "add"],
  ["end", "end-date"],
  ["end date", "end-date"],
  ["end-date", "end-date"],
  ["end constituency", "end-date"],
  ["reorder", "reorder"],
  ["sort", "reorder"],
]);

const RELATIONSHIP_ACTION_ALIASES = new Map([
  ["add", "add"],
  ["new", "add"],
  ["add new", "add"],
  ["add additional", "add"],
  ["update", "update"],
  ["edit", "update"],
  ["update existing", "update"],
  ["edit existing", "update"],
]);

const CONSTITUENCY_HIERARCHY = [
  "Trustee",
  "Former Trustee",
  "Alumni - Bachelor's Degree",
  "Alumni - Graduate Degree",
  "Employee",
  "Employee - Former",
  "Parent - Current",
  "Parent - Former",
  "Friend",
  "Student",
];

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

function normalizeAction(value, fallback = "replace") {
  const normalized = normalizeText(value || fallback);
  return ACTION_ALIASES.get(normalized) || ACTION_ALIASES.get(normalizeText(fallback)) || "replace";
}

function normalizeRelationshipAction(value, fallback = "add") {
  const normalized = normalizeText(value || fallback);
  return (
    RELATIONSHIP_ACTION_ALIASES.get(normalized) ||
    RELATIONSHIP_ACTION_ALIASES.get(normalizeText(fallback)) ||
    "add"
  );
}

function getMappedValue(row, mappings, key) {
  const mappedColumn = cleanText(mappings?.[key]);
  if (mappedColumn && Object.prototype.hasOwnProperty.call(row, mappedColumn)) {
    return cleanText(row[mappedColumn]);
  }
  return "";
}

function hasAnyValue(values, keys = null) {
  const entries = keys
    ? keys.map((key) => [key, values?.[key]])
    : Object.entries(values || {});
  return entries.some(
    ([key, value]) =>
      !["action", "duplicatePolicy"].includes(key) && cleanText(value),
  );
}

function hasConstituencyChange(input) {
  return Boolean(cleanText(input.sourceConstituency) || cleanText(input.targetConstituency));
}

function getRowInput(row, mappings, defaults = {}) {
  const defaultAction = cleanText(defaults.defaultAction) || "replace";
  const defaultEducationAction = normalizeRelationshipAction(
    defaults.educationRelationshipAction,
    "add",
  );
  const firstName = getMappedValue(row, mappings, "firstName");
  const lastName = getMappedValue(row, mappings, "lastName");
  const preferredName = getMappedValue(row, mappings, "preferredName");
  const legacyConstituentName = getMappedValue(row, mappings, "constituentName");
  const derivedName =
    legacyConstituentName ||
    [preferredName || firstName, lastName].filter(Boolean).join(" ").trim() ||
    [firstName, lastName].filter(Boolean).join(" ").trim();

  const input = {
    firstName,
    lastName,
    preferredName,
    constituentName: derivedName,
    blackbaudConstituentId: getMappedValue(row, mappings, "blackbaudConstituentId"),
    lookupId: getMappedValue(row, mappings, "lookupId"),
    email: getMappedValue(row, mappings, "email"),
    sourceConstituency: getMappedValue(row, mappings, "sourceConstituency"),
    targetConstituency: getMappedValue(row, mappings, "targetConstituency"),
    action: normalizeAction(getMappedValue(row, mappings, "action"), defaultAction),
    startDate: getMappedValue(row, mappings, "startDate") || cleanText(defaults.startDate),
    endDate: getMappedValue(row, mappings, "endDate") || cleanText(defaults.endDate),
  };

  const educationRelationship = {
    action: defaultEducationAction,
    duplicatePolicy:
      defaultEducationAction === "update"
        ? "match_existing_before_update"
        : "add_additional",
    institution: getMappedValue(row, mappings, "educationInstitution"),
    degree: getMappedValue(row, mappings, "educationDegree"),
    major: getMappedValue(row, mappings, "educationMajor"),
    classYear: getMappedValue(row, mappings, "educationClassYear"),
    makePrimary: getMappedValue(row, mappings, "educationRelationshipMakePrimary"),
  };
  const organizationRelationship = {
    action: "add",
    duplicatePolicy: "add_additional",
    name: getMappedValue(row, mappings, "organizationName"),
    relationshipType: getMappedValue(row, mappings, "organizationRelationshipType"),
    title: getMappedValue(row, mappings, "organizationTitle"),
    startDate: getMappedValue(row, mappings, "organizationStartDate"),
    endDate: getMappedValue(row, mappings, "organizationEndDate"),
    makePrimary: getMappedValue(row, mappings, "organizationRelationshipMakePrimary"),
  };

  if (hasAnyValue(educationRelationship, ["institution", "degree", "major", "classYear"])) {
    input.educationRelationship = educationRelationship;
  }
  if (hasAnyValue(organizationRelationship, ["name", "relationshipType", "title"])) {
    input.organizationRelationship = organizationRelationship;
  }

  return input;
}

function buildWritePlan(input, changePreview) {
  const writes = [];

  if (changePreview.status === STATUS.ready && cleanText(input.targetConstituency)) {
    writes.push({
      type: "constituent_code",
      action: input.action,
      duplicatePolicy: input.action === "add" ? "skip_if_present" : "review_before_apply",
      sourceConstituency: input.sourceConstituency || "",
      targetConstituency: input.targetConstituency || "",
      startDate: input.startDate || "",
      endDate: input.endDate || "",
    });
  }

  if (input.educationRelationship) {
    writes.push({
      type: "education_relationship",
      action: input.educationRelationship.action || "add",
      duplicatePolicy:
        input.educationRelationship.action === "update"
          ? "match_existing_before_update"
          : "add_additional",
      institution: input.educationRelationship.institution || "",
      degree: input.educationRelationship.degree || "",
      major: input.educationRelationship.major || "",
      classYear: input.educationRelationship.classYear || "",
      makePrimary: input.educationRelationship.makePrimary || "",
    });
  }

  if (input.organizationRelationship) {
    writes.push({
      type: "organization_relationship",
      action: "add",
      duplicatePolicy: "add_additional",
      name: input.organizationRelationship.name || "",
      relationshipType: input.organizationRelationship.relationshipType || "",
      title: input.organizationRelationship.title || "",
      startDate: input.organizationRelationship.startDate || "",
      endDate: input.organizationRelationship.endDate || "",
      makePrimary: input.organizationRelationship.makePrimary || "",
    });
  }

  return writes;
}

function getConstituencyLabel(value) {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value);
  return cleanText(
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

function mapConstituencyCode(item) {
  const label = getConstituencyLabel(item);
  return {
    id: item?.id || item?.constituent_code_id || item?.code_id || null,
    label,
    startDate: item?.date_from || item?.start_date || item?.start || null,
    endDate: item?.date_to || item?.end_date || item?.end || null,
    raw: item || null,
  };
}

function hierarchyRank(label) {
  const normalizedLabel = normalizeText(label);
  const index = CONSTITUENCY_HIERARCHY.findIndex(
    (item) => normalizeText(item) === normalizedLabel,
  );
  return index === -1 ? CONSTITUENCY_HIERARCHY.length : index;
}

function sortByHierarchy(codes) {
  return [...codes].sort((a, b) => {
    const rankDifference = hierarchyRank(a.label) - hierarchyRank(b.label);
    if (rankDifference !== 0) return rankDifference;
    return a.label.localeCompare(b.label);
  });
}

function labelsMatch(a, b) {
  return normalizeText(a) === normalizeText(b);
}

function findCode(codes, label) {
  const normalizedLabel = normalizeText(label);
  return codes.find((code) => normalizeText(code.label) === normalizedLabel) || null;
}

function makeCode(label, input) {
  return {
    id: null,
    label,
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    raw: null,
  };
}

function sameLabelOrder(left, right) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => labelsMatch(item.label, right[index]?.label));
}

export function previewConstituencyChange(input, currentCodes, options = {}) {
  const source = cleanText(input.sourceConstituency);
  const target = cleanText(input.targetConstituency);
  const action = normalizeAction(input.action);
  const useHierarchy = options.useHierarchy !== false;
  const reasons = [];
  const labels = currentCodes.map((code) => code.label).filter(Boolean);

  if (!source && !target) {
    return {
      status: STATUS.skipped,
      reasons: ["No constituent-code change requested."],
      proposedCodes: labels,
    };
  }

  if (action === "add") {
    if (!target) {
      return {
        status: STATUS.conflict,
        reasons: ["A new constituency is required for add actions."],
        proposedCodes: labels,
      };
    }
    if (findCode(currentCodes, target)) {
      return {
        status: STATUS.skipped,
        reasons: [`${target} is already present.`],
        proposedCodes: labels,
      };
    }
    const proposed = [...currentCodes, makeCode(target, input)];
    return {
      status: STATUS.ready,
      reasons: useHierarchy
        ? reasons
        : ["Would append the new constituency without re-sorting by hierarchy."],
      proposedCodes: (useHierarchy ? sortByHierarchy(proposed) : proposed).map((code) => code.label),
    };
  }

  if (action === "replace") {
    if (!source || !target) {
      return {
        status: STATUS.conflict,
        reasons: ["Both current and new constituency values are required for replace actions."],
        proposedCodes: labels,
      };
    }
    if (!findCode(currentCodes, source)) {
      return {
        status: STATUS.needsReview,
        reasons: [`Current constituency ${source} was not found on the NXT record.`],
        proposedCodes: labels,
      };
    }

    const withoutSource = currentCodes.filter((code) => !labelsMatch(code.label, source));
    const proposed = findCode(withoutSource, target)
      ? withoutSource
      : [...withoutSource, makeCode(target, input)];

    return {
      status: STATUS.ready,
      reasons,
      proposedCodes: sortByHierarchy(proposed).map((code) => code.label),
    };
  }

  if (action === "end-date") {
    if (!source) {
      return {
        status: STATUS.conflict,
        reasons: ["A current constituency is required for end-date actions."],
        proposedCodes: labels,
      };
    }
    if (!findCode(currentCodes, source)) {
      return {
        status: STATUS.needsReview,
        reasons: [`Current constituency ${source} was not found on the NXT record.`],
        proposedCodes: labels,
      };
    }
    return {
      status: STATUS.ready,
      reasons: [
        `Would end-date ${source}${input.endDate ? ` on ${input.endDate}` : ""}.`,
      ],
      proposedCodes: labels,
    };
  }

  if (action === "reorder") {
    const proposed = sortByHierarchy(currentCodes);
    return {
      status: sameLabelOrder(currentCodes, proposed) ? STATUS.skipped : STATUS.ready,
      reasons: sameLabelOrder(currentCodes, proposed)
        ? ["Current constituency order already matches the configured hierarchy."]
        : [],
      proposedCodes: proposed.map((code) => code.label),
    };
  }

  return {
    status: STATUS.conflict,
    reasons: [`Unsupported action: ${input.action || "blank"}.`],
    proposedCodes: labels,
  };
}

function scoreCandidate(candidate, input) {
  const candidateEmail = normalizeText(candidate?.email);
  const candidateName = normalizeText(candidate?.name);
  const inputEmail = normalizeText(input.email);
  const inputName = normalizeText(input.constituentName);

  let score = 0;
  const reasons = [];

  if (inputEmail && candidateEmail && inputEmail === candidateEmail) {
    score += 60;
    reasons.push("Exact email match");
  }
  if (inputName && candidateName && inputName === candidateName) {
    score += 35;
    reasons.push("Exact name match");
  } else if (inputName && candidateName && candidateName.includes(inputName)) {
    score += 20;
    reasons.push("Partial name match");
  }

  return { score, reasons };
}

async function resolveMatch({ input, userId, authUserId, origin }) {
  if (input.blackbaudConstituentId) {
    const match = await getBlackbaudConstituentById({
      userId,
      authUserId,
      origin,
      constituentId: input.blackbaudConstituentId,
    });
    return match
      ? {
          status: "matched",
          method: "NXT system ID",
          confidence: 100,
          match,
          notes: [],
        }
      : {
          status: "not_matched",
          method: "NXT system ID",
          confidence: 0,
          match: null,
          notes: ["No NXT record was found for that system ID."],
        };
  }

  if (input.lookupId) {
    const match = await findBlackbaudConstituentByLookupId({
      userId,
      authUserId,
      origin,
      lookupId: input.lookupId,
    });
    return match
      ? {
          status: "matched",
          method: "NXT lookup ID",
          confidence: 98,
          match,
          notes: [],
        }
      : {
          status: "not_matched",
          method: "NXT lookup ID",
          confidence: 0,
          match: null,
          notes: ["No NXT record was found for that lookup ID."],
        };
  }

  const query = input.email || input.constituentName;
  if (!query) {
    return {
      status: "not_matched",
      method: "none",
      confidence: 0,
      match: null,
      notes: ["No constituent identifier, lookup ID, email, or name was provided."],
    };
  }

  const candidates = await searchBlackbaudConstituents({
    userId,
    authUserId,
    origin,
    query,
  });
  const scored = candidates
    .map((candidate) => ({ candidate, ...scoreCandidate(candidate, input) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (!best || best.score <= 0) {
    return {
      status: "not_matched",
      method: input.email ? "email search" : "name search",
      confidence: 0,
      match: null,
      notes: ["No likely NXT match was found."],
    };
  }

  return {
    status: "needs_review",
    method: input.email ? "email search" : "name search",
    confidence: Math.min(best.score, 85),
    match: best.candidate,
    notes: [
      ...best.reasons,
      "Name and email matches are previewed for human review before import.",
    ],
  };
}

async function fetchConstituencyCodes({ userId, authUserId, origin, constituentId }) {
  const payload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}/constituentcodes`,
    {
      userId,
      authUserId,
      origin,
    },
  );
  const rows = Array.isArray(payload?.value)
    ? payload.value
    : Array.isArray(payload)
      ? payload
      : [];
  return rows.map(mapConstituencyCode).filter((code) => code.label);
}

function deriveStatus(matchResult, codeFetchError, changePreview, writePlan = []) {
  const hasWritePlan = Array.isArray(writePlan) && writePlan.length > 0;
  const hasConstituentCodeWrite = writePlan.some((write) => write.type === "constituent_code");

  if (changePreview.status === STATUS.conflict) return STATUS.conflict;
  if (matchResult.status !== "matched") return STATUS.needsReview;
  if (codeFetchError && hasConstituentCodeWrite) return STATUS.needsReview;
  if (hasWritePlan) return STATUS.ready;
  if (changePreview.status === STATUS.skipped) return STATUS.skipped;
  return changePreview.status;
}

function summarize(rows, warnings) {
  return rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.status === STATUS.ready) acc.ready += 1;
      if (row.status === STATUS.needsReview) acc.needsReview += 1;
      if (row.status === STATUS.skipped) acc.skipped += 1;
      if (row.status === STATUS.conflict) acc.conflict += 1;
      return acc;
    },
    {
      total: 0,
      ready: 0,
      needsReview: 0,
      skipped: 0,
      conflict: 0,
      warningCount: warnings.length,
    },
  );
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
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    appliedAt: row.applied_at || null,
  };
}

async function savePreviewRun({
  sessionUser,
  workspaceUser,
  sourceFilename,
  mappings,
  defaults,
  warnings,
  summary,
  previewRows,
  rawRows,
}) {
  const cleanSourceFilename = cleanText(sourceFilename).slice(0, 255) || null;
  const createdRows = await sql`
    INSERT INTO constituency_import_runs (
      created_by_user_id,
      workspace_user_id,
      status,
      source_filename,
      mappings,
      defaults,
      warnings,
      summary,
      row_count,
      ready_count,
      needs_review_count,
      conflict_count,
      skipped_count,
      created_at,
      updated_at
    )
    VALUES (
      ${sessionUser?.id || workspaceUser.id},
      ${workspaceUser.id},
      'previewed',
      ${cleanSourceFilename},
      ${JSON.stringify(mappings)}::jsonb,
      ${JSON.stringify(defaults)}::jsonb,
      ${JSON.stringify(warnings)}::jsonb,
      ${JSON.stringify(summary)}::jsonb,
      ${Number(summary.total || previewRows.length || 0)},
      ${Number(summary.ready || 0)},
      ${Number(summary.needsReview || 0)},
      ${Number(summary.conflict || 0)},
      ${Number(summary.skipped || 0)},
      NOW(),
      NOW()
    )
    RETURNING *
  `;
  const run = createdRows[0];

  for (const row of previewRows) {
    const rawRow = rawRows[row.rowNumber - 1] || {};
    const input = row.input || {};
    await sql`
      INSERT INTO constituency_import_rows (
        run_id,
        row_number,
        status,
        match_status,
        match_method,
        confidence,
        matched_blackbaud_constituent_id,
        matched_lookup_id,
        constituent_name,
        action,
        source_constituency,
        target_constituency,
        start_date,
        end_date,
        raw_row,
        preview,
        requested_writes,
        created_at,
        updated_at
      )
      VALUES (
        ${run.id},
        ${row.rowNumber},
        ${row.status},
        ${row.matchStatus || null},
        ${row.matchMethod || null},
        ${Number(row.confidence || 0)},
        ${row.match?.blackbaudConstituentId || null},
        ${row.match?.lookupId || null},
        ${input.constituentName || row.match?.name || null},
        ${input.action || null},
        ${input.sourceConstituency || null},
        ${input.targetConstituency || null},
        ${input.startDate || null},
        ${input.endDate || null},
        ${JSON.stringify(rawRow)}::jsonb,
        ${JSON.stringify(row)}::jsonb,
        ${JSON.stringify(row.writePlan || [])}::jsonb,
        NOW(),
        NOW()
      )
    `;
  }

  return serializeRun(run);
}

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser, workspaceUser: user, isActing } = await getWorkspaceUser(
      session,
      request,
    );
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    if (!isReviewerRole(user.role)) {
      return Response.json(
        { error: "Only Advancement Services users can preview imports." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const inputRows = Array.isArray(body?.rows) ? body.rows : [];
    const warnings = [];

    if (inputRows.length === 0) {
      return Response.json(
        { error: "Add at least one row before previewing an import." },
        { status: 400 },
      );
    }
    if (inputRows.length > MAX_PREVIEW_ROWS) {
      warnings.push(`Preview limited to the first ${MAX_PREVIEW_ROWS} rows.`);
    }

    const rowsToPreview = inputRows.slice(0, MAX_PREVIEW_ROWS);
    const mappings = body?.mappings && typeof body.mappings === "object" ? body.mappings : {};
    const defaults = body?.defaults && typeof body.defaults === "object" ? body.defaults : {};
    const useHierarchy = defaults.useHierarchy !== false;
    const saveRun = Boolean(body?.saveRun);
    const origin = new URL(request.url).origin;
    const authUserId = isActing ? sessionUser?.id : user.id;

    const previewRows = [];
    for (let index = 0; index < rowsToPreview.length; index += 1) {
      const row = rowsToPreview[index];
      const input = getRowInput(row, mappings, defaults);
      let matchResult;
      let currentCodes = [];
      let codeFetchError = "";

      try {
        matchResult = await resolveMatch({
          input,
          userId: user.id,
          authUserId,
          origin,
        });
      } catch (error) {
        matchResult = {
          status: "not_matched",
          method: "NXT lookup",
          confidence: 0,
          match: null,
          notes: [error instanceof Error ? error.message : "NXT lookup failed."],
        };
      }

      if (matchResult.match?.blackbaudConstituentId && hasConstituencyChange(input)) {
        try {
          currentCodes = await fetchConstituencyCodes({
            userId: user.id,
            authUserId,
            origin,
            constituentId: matchResult.match.blackbaudConstituentId,
          });
        } catch (error) {
          codeFetchError =
            error instanceof Error ? error.message : "Could not load current constituencies.";
        }
      }

      const changePreview = previewConstituencyChange(input, currentCodes, { useHierarchy });
      const writePlan = buildWritePlan(input, changePreview);
      const reasons = [
        ...matchResult.notes,
        ...(codeFetchError ? [`Could not load current NXT constituencies: ${codeFetchError}`] : []),
        ...changePreview.reasons,
        ...(input.educationRelationship
          ? [
              input.educationRelationship.action === "update"
                ? "Education relationship data is staged to update an existing education relationship; the matching relationship should be reviewed before applying."
                : "Education relationship data is staged as an additional education relationship; it will not replace existing education relationships.",
            ]
          : []),
        ...(input.organizationRelationship
          ? ["Organization relationship data is staged as an additional organization relationship; it will not replace existing organization relationships."]
          : []),
      ].filter(Boolean);

      previewRows.push({
        rowNumber: index + 1,
        status: deriveStatus(matchResult, codeFetchError, changePreview, writePlan),
        matchStatus: matchResult.status,
        matchMethod: matchResult.method,
        confidence: matchResult.confidence,
        input,
        match: matchResult.match
          ? {
              blackbaudConstituentId: matchResult.match.blackbaudConstituentId || null,
              lookupId: matchResult.match.lookupId || matchResult.match.blackbaudLookupId || null,
              name: matchResult.match.name || null,
              email: matchResult.match.email || null,
            }
          : null,
        currentCodes: currentCodes.map((code) => code.label),
        proposedCodes: changePreview.proposedCodes,
        writePlan,
        reasons,
      });
    }

    const summary = summarize(previewRows, warnings);
    const savedRun = saveRun
      ? await savePreviewRun({
          sessionUser,
          workspaceUser: user,
          sourceFilename: body?.sourceFilename,
          mappings,
          defaults,
          warnings,
          summary,
          previewRows,
          rawRows: rowsToPreview,
        })
      : null;

    return Response.json({
      previewOnly: true,
      savedRun,
      warnings,
      summary,
      rows: previewRows,
    });
  } catch (error) {
    console.error("Error previewing constituency import:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to preview constituency import",
      },
      { status: 500 },
    );
  }
}
