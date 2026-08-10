import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";
import { isReviewerRole } from "@/utils/workspaceRoles";

function cleanText(value) {
  return String(value || "").trim();
}

function parseSelectedRowIds(value) {
  if (value === undefined) return { rowIds: null };
  if (!Array.isArray(value)) {
    return { error: "Selected import rows must be provided as an array." };
  }

  const rowIds = value.map(cleanText);
  if (!rowIds.length) {
    return { error: "Select at least one Ready row before applying changes to NXT." };
  }
  if (rowIds.some((rowId) => !/^\d+$/.test(rowId))) {
    return { error: "One or more selected import rows are invalid." };
  }
  if (new Set(rowIds).size !== rowIds.length) {
    return { error: "Each selected import row may appear only once." };
  }

  return { rowIds };
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseBoolean(value) {
  const normalized = normalizeText(value);
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  return false;
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
    createApprovedAt: row.create_approved_at || null,
    createApprovedByUserId: row.create_approved_by_user_id
      ? String(row.create_approved_by_user_id)
      : null,
    createdBlackbaudConstituentId: row.created_blackbaud_constituent_id || null,
    createdBlackbaudLookupId: row.created_blackbaud_lookup_id || null,
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
  if (value && typeof value === "object") {
    const year = Number(value.y || value.year);
    const month = Number(value.m || value.month);
    const day = Number(value.d || value.day);
    if (year && month && day) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const text = cleanText(value);
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString().slice(0, 10);
}

function parseBirthDate(value) {
  const normalized = cleanText(value);
  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const usMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!isoMatch && !usMatch) return null;

  const year = Number(isoMatch?.[1] ?? usMatch?.[3]);
  const month = Number(isoMatch?.[2] ?? usMatch?.[1]);
  const day = Number(isoMatch?.[3] ?? usMatch?.[2]);
  const currentTwoDigitYear = new Date().getUTCFullYear() % 100;
  const resolvedYear = year < 100 ? (year <= currentTwoDigitYear ? 2000 + year : 1900 + year) : year;
  const date = new Date(Date.UTC(resolvedYear, month - 1, day));
  if (
    date.getUTCFullYear() !== resolvedYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { y: resolvedYear, m: month, d: day };
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
  return {
    id: item?.id || item?.constituent_code_id || item?.code_id || null,
    label: getConstituencyLabel(item),
    startDate: item?.date_from || item?.start_date || item?.start || null,
    endDate: item?.date_to || item?.end_date || item?.end || null,
    raw: item || null,
  };
}

function findCode(codes, label) {
  const normalizedLabel = normalizeText(label);
  return codes.find((code) => normalizeText(code.label) === normalizedLabel) || null;
}

function isOpenConstituencyCode(code) {
  return !cleanText(code?.endDate);
}

function isCurrentConstituencyCode(code) {
  const endDate = formatDateForBlackbaud(code?.endDate);
  if (!endDate) return true;

  const endTimestamp = Date.parse(`${endDate}T23:59:59.999Z`);
  return Number.isNaN(endTimestamp) || endTimestamp >= Date.now();
}

function findOpenCode(codes, label) {
  const normalizedLabel = normalizeText(label);
  return (
    codes.find(
      (code) => normalizeText(code.label) === normalizedLabel && isOpenConstituencyCode(code),
    ) || null
  );
}

function findCurrentCode(codes, label) {
  const normalizedLabel = normalizeText(label);
  return (
    codes.find(
      (code) =>
        normalizeText(code.label) === normalizedLabel && isCurrentConstituencyCode(code),
    ) || null
  );
}

async function fetchConstituencyCodes({ request, user, constituentId }) {
  const payload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}/constituentcodes`,
    {
      userId: user.id,
      authUserId: user.id,
      origin: new URL(request.url).origin,
    },
  );
  const rows = Array.isArray(payload?.value)
    ? payload.value
    : Array.isArray(payload)
      ? payload
      : [];
  return rows.map(mapConstituencyCode).filter((code) => code.label);
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
        { error: "Only Advancement Services users can apply import runs." },
        { status: 403 },
      ),
    };
  }

  return { user };
}

async function createConstituentCode({
  request,
  user,
  constituentId,
  targetConstituency,
  row,
  write,
  includeEndDate = true,
}) {
  const payload = {
    constituent_id: String(constituentId),
    description: targetConstituency,
  };
  // A blank CSV date deliberately remains blank. Do not fall back to source-row dates
  // for a reviewed replacement, because that would carry dates to the new code.
  const hasStartDate = Object.prototype.hasOwnProperty.call(write || {}, "startDate");
  const hasEndDate = Object.prototype.hasOwnProperty.call(write || {}, "endDate");
  const startDate = formatDateForBlackbaud(hasStartDate ? write.startDate : row.start_date);
  const endDate = formatDateForBlackbaud(hasEndDate ? write.endDate : row.end_date);
  if (startDate) payload.date_from = startDate;
  if (includeEndDate && endDate) payload.date_to = endDate;

  return blackbaudApiFetch("/constituent/v1/constituentcodes", {
    userId: user.id,
    authUserId: user.id,
    origin: new URL(request.url).origin,
    method: "POST",
    body: payload,
  });
}

async function patchConstituentCode({ request, user, codeId, payload }) {
  return blackbaudApiFetch(
    `/constituent/v1/constituentcodes/${encodeURIComponent(String(codeId))}`,
    {
      userId: user.id,
      authUserId: user.id,
      origin: new URL(request.url).origin,
      method: "PATCH",
      body: payload,
    },
  );
}

async function deleteConstituentCode({ request, user, codeId }) {
  return blackbaudApiFetch(
    `/constituent/v1/constituentcodes/${encodeURIComponent(String(codeId))}`,
    {
      userId: user.id,
      authUserId: user.id,
      origin: new URL(request.url).origin,
      method: "DELETE",
    },
  );
}

async function applyConstituentNameUpdate({ request, user, row, write }) {
  const constituentId = getMatchedConstituentId(row);
  const recordType = normalizeText(write?.recordType);
  const payload = {};
  const firstName = cleanText(write?.firstName);
  const lastName = cleanText(write?.lastName);
  const preferredName = cleanText(write?.preferredName);

  if (firstName) payload.first = firstName;
  if (lastName) payload.last = lastName;
  if (preferredName) payload.preferred_name = preferredName;

  if (!constituentId || Object.keys(payload).length === 0) {
    return {
      status: "manual_required",
      type: "constituent_name",
      action: "update",
      message: "A matched NXT constituent ID and at least one populated name field are required.",
    };
  }

  if (recordType.includes("organization")) {
    return {
      status: "manual_required",
      type: "constituent_name",
      action: "update",
      message:
        "Name-field imports are limited to individual constituents. Review organization name changes manually.",
    };
  }

  const result = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}`,
    {
      userId: user.id,
      authUserId: user.id,
      origin: new URL(request.url).origin,
      method: "PATCH",
      body: payload,
    },
  );

  const fields = [
    firstName && "first name",
    lastName && "last name",
    preferredName && "preferred name",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    status: "applied",
    type: "constituent_name",
    action: "update",
    message: `Updated NXT ${fields}.`,
    blackbaudResult: result || null,
  };
}

async function applyConstituentProfileUpdate({ request, user, row, write }) {
  const constituentId = getMatchedConstituentId(row);
  const recordType = normalizeText(write?.recordType);
  const title = cleanText(write?.title);
  const gender = cleanText(write?.gender);
  const ethnicity = cleanText(write?.ethnicity);
  const suffix = cleanText(write?.suffix);
  const birthDate = cleanText(write?.birthDate);
  const payload = {};

  if (title) payload.title = title;
  if (gender) payload.gender = gender;
  if (ethnicity) payload.ethnicity = ethnicity;
  if (suffix) payload.suffix = suffix;
  if (birthDate) {
    const parsedBirthDate = parseBirthDate(birthDate);
    if (!parsedBirthDate) {
      return {
        status: "manual_required",
        type: "constituent_profile",
        action: "update",
        message: "Birth Date must use a valid MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD value before it can be imported.",
      };
    }
    payload.birthdate = parsedBirthDate;
  }

  if (!constituentId || Object.keys(payload).length === 0) {
    return {
      status: "manual_required",
      type: "constituent_profile",
      action: "update",
      message: "A matched NXT constituent ID and at least one populated profile field are required.",
    };
  }
  if (recordType.includes("organization")) {
    return {
      status: "manual_required",
      type: "constituent_profile",
      action: "update",
      message: "Title, gender, ethnicity, birth date, and suffix imports are limited to individual constituents.",
    };
  }

  const result = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}`,
    {
      userId: user.id,
      authUserId: user.id,
      origin: new URL(request.url).origin,
      method: "PATCH",
      body: payload,
    },
  );
  const fields = [title && "title", gender && "gender", ethnicity && "ethnicity", birthDate && "birth date", suffix && "suffix"]
    .filter(Boolean)
    .join(", ");

  return {
    status: "applied",
    type: "constituent_profile",
    action: "update",
    message: `Updated NXT ${fields}.`,
    blackbaudResult: result || null,
  };
}

async function applyConstituentNameFormatUpdate({ request, user, row, write }) {
  const constituentId = getMatchedConstituentId(row);
  const targetId = cleanText(write?.targetId);
  const value = cleanText(write?.value);
  const kind = cleanText(write?.kind) || "name";

  if (!constituentId || !targetId || !value) {
    return {
      status: "manual_required",
      type: "constituent_name_format",
      action: "update_primary",
      message: `A matched NXT constituent, current primary ${kind} format, and proposed value are required.`,
    };
  }

  const result = await blackbaudApiFetch(
    `/constituent/v1/primarynameformats/${encodeURIComponent(String(targetId))}`,
    {
      userId: user.id,
      authUserId: user.id,
      origin: new URL(request.url).origin,
      method: "PATCH",
      body: {
        custom_format: true,
        formatted_name: value,
      },
    },
  );

  return {
    status: "applied",
    type: "constituent_name_format",
    action: "update_primary",
    message: `Updated the primary NXT ${kind} to ${value}.`,
    blackbaudResult: result || null,
  };
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function getEmailAddress(value) {
  if (typeof value === "string") return cleanText(value);
  return cleanText(value?.address || value?.email || value?.email_address);
}

function isPrimaryEmail(value) {
  return parseBoolean(value?.primary ?? value?.is_primary);
}

function getContactId(value, kind) {
  const keys =
    kind === "email"
      ? ["id", "email_address_id"]
      : kind === "phone"
        ? ["id", "phone_id"]
        : ["id", "address_id"];
  return cleanText(keys.map((key) => value?.[key]).find(Boolean));
}

function getContactType(value) {
  return cleanText(value?.type || value?.type_name || value?.type_description);
}

function isPrimaryContact(value) {
  return parseBoolean(value?.primary ?? value?.is_primary ?? value?.preferred);
}

function getPhoneNumber(value) {
  if (typeof value === "string") return cleanText(value);
  return cleanText(value?.number || value?.phone || value?.phone_number);
}

function getAddressLines(value) {
  const lines = value?.address_lines || value?.addressLines || value?.lines;
  if (Array.isArray(lines)) return lines.map(cleanText).filter(Boolean);
  if (typeof lines === "string") return lines.split("\n").map(cleanText).filter(Boolean);
  return [cleanText(value?.address_line1 || value?.line1), cleanText(value?.address_line2 || value?.line2)].filter(Boolean);
}

function getCollection(payload) {
  return Array.isArray(payload?.value) ? payload.value : Array.isArray(payload) ? payload : [];
}

function getEducationSchool(value) {
  if (typeof value === "string") return cleanText(value);
  const school = value?.school || value?.school_name || value?.institution || value?.name;
  if (typeof school === "string") return cleanText(school);
  return cleanText(school?.name || school?.description || school?.value);
}

function getEducationId(value) {
  return cleanText(value?.id || value?.education_id);
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

function educationMatchesWrite(write, education) {
  const expectedSchool = normalizeText(write?.institution);
  if (!expectedSchool || expectedSchool !== normalizeText(getEducationSchool(education))) {
    return false;
  }

  const matchesValue = (expected, values) => {
    const normalizedExpected = normalizeText(expected);
    return !normalizedExpected || values.some((value) => normalizeText(value) === normalizedExpected);
  };

  return (
    matchesValue(write?.degree, getEducationValues(education, "degrees", ["degree", "degree_name"])) &&
    matchesValue(write?.major, getEducationValues(education, "majors", ["major", "major_name"])) &&
    (!cleanText(write?.classYear) || cleanText(write.classYear) === getEducationClassYear(education))
  );
}

async function fetchCurrentEducations({ request, user, constituentId }) {
  const payload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}/educations`,
    {
      userId: user.id,
      authUserId: user.id,
      origin: new URL(request.url).origin,
    },
  );
  return getCollection(payload);
}

function manualEducationResult(action, message) {
  return { status: "manual_required", type: "education_relationship", action, message };
}

function buildEducationPayload({ constituentId, write, includeConstituentId = false }) {
  const payload = {};
  const institution = cleanText(write?.institution);
  const degree = cleanText(write?.degree);
  const major = cleanText(write?.major);
  const minor = cleanText(write?.minor);
  const schoolType = cleanText(write?.schoolType);
  const campus = cleanText(write?.campus);
  const fraternitySorority = cleanText(write?.fraternitySorority);
  const gpa = cleanText(write?.gpa);
  const classYear = cleanText(write?.classYear);
  const status = cleanText(write?.status);
  const dateGraduated = cleanText(write?.dateGraduated);
  const dateEntered = cleanText(write?.dateEntered);
  const dateLeft = cleanText(write?.dateLeft);
  const dates = {
    dateGraduated: dateGraduated ? parseBirthDate(dateGraduated) : null,
    dateEntered: dateEntered ? parseBirthDate(dateEntered) : null,
    dateLeft: dateLeft ? parseBirthDate(dateLeft) : null,
  };
  const invalidDate = [
    ["Education Date Graduated", dateGraduated, dates.dateGraduated],
    ["Education Date Entered", dateEntered, dates.dateEntered],
    ["Education Date Left", dateLeft, dates.dateLeft],
  ].find(([, value, parsed]) => value && !parsed);
  if (invalidDate) {
    return {
      error: `${invalidDate[0]} must use MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD before it can be imported.`,
    };
  }

  if (includeConstituentId) payload.constituent_id = String(constituentId);
  if (institution) payload.school = institution;
  if (degree) payload.degree = degree;
  if (major) payload.majors = [major];
  if (minor) payload.minors = [minor];
  if (schoolType) payload.type = schoolType;
  if (campus) payload.campus = campus;
  if (fraternitySorority) payload.social_organization = fraternitySorority;
  if (gpa) payload.gpa = Number(gpa);
  if (classYear) payload.class_of = Number(classYear);
  if (status) payload.status = status;
  if (dates.dateGraduated) payload.date_graduated = dates.dateGraduated;
  if (dates.dateEntered) payload.date_entered = dates.dateEntered;
  if (dates.dateLeft) payload.date_left = dates.dateLeft;
  if (parseBoolean(write?.makePrimary)) payload.primary = true;
  return { payload };
}

async function applyEducationRelationshipAdd({ request, user, row, write }) {
  const constituentId = getMatchedConstituentId(row);
  const action = cleanText(write?.action) || "add";
  const recordType = normalizeText(write?.recordType);
  const institution = cleanText(write?.institution);
  const gpa = cleanText(write?.gpa);
  const classYear = cleanText(write?.classYear);
  const dateGraduated = cleanText(write?.dateGraduated);
  const dateEntered = cleanText(write?.dateEntered);
  const dateLeft = cleanText(write?.dateLeft);

  if (!constituentId || !institution) {
    return manualEducationResult(
      action,
      "A matched NXT constituent ID and Education Institution are required before an education relationship can be added.",
    );
  }
  if (recordType !== "individual") {
    return manualEducationResult(
      action,
      "Education imports require a confirmed matched individual NXT constituent. Refresh the preview before applying.",
    );
  }
  if (classYear && !/^\d{2}(\d{2})?$/.test(classYear)) {
    return manualEducationResult(
      action,
      "Education Class Year must use either two or four digits before it can be imported.",
    );
  }
  if (gpa && (!Number.isFinite(Number(gpa)) || Number(gpa) < 0)) {
    return manualEducationResult(
      action,
      "Education GPA must be a non-negative number before it can be imported.",
    );
  }
  const parsedEducationDates = {
    dateGraduated: dateGraduated ? parseBirthDate(dateGraduated) : null,
    dateEntered: dateEntered ? parseBirthDate(dateEntered) : null,
    dateLeft: dateLeft ? parseBirthDate(dateLeft) : null,
  };
  const invalidDate = [
    ["Education Date Graduated", dateGraduated, parsedEducationDates.dateGraduated],
    ["Education Date Entered", dateEntered, parsedEducationDates.dateEntered],
    ["Education Date Left", dateLeft, parsedEducationDates.dateLeft],
  ].find(([, value, parsed]) => value && !parsed);
  if (invalidDate) {
    return manualEducationResult(
      action,
      `${invalidDate[0]} must use MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD before it can be imported.`,
    );
  }

  const currentEducations = await fetchCurrentEducations({ request, user, constituentId });
  const existing = currentEducations.find((education) => educationMatchesWrite(write, education));
  if (existing) {
    return {
      status: "applied",
      type: "education_relationship",
      action: "skip_existing",
      message: `${institution} is already present as a matching NXT education relationship; no duplicate was added.`,
    };
  }
  if (action === "skip_existing") {
    return manualEducationResult(
      action,
      "The matching NXT education relationship changed after preview. Refresh the preview before applying.",
    );
  }

  const builtPayload = buildEducationPayload({ constituentId, write, includeConstituentId: true });
  if (builtPayload.error) return manualEducationResult(action, builtPayload.error);
  const { payload } = builtPayload;

  const result = await blackbaudApiFetch("/constituent/v1/educations", {
    userId: user.id,
    authUserId: user.id,
    origin: new URL(request.url).origin,
    method: "POST",
    body: payload,
  });

  return {
    status: "applied",
    type: "education_relationship",
    action: "add",
    message: `Added ${institution} as an NXT education relationship.`,
    blackbaudResult: result || null,
  };
}

async function applyEducationRelationshipUpdate({ request, user, row, write }) {
  const constituentId = getMatchedConstituentId(row);
  const action = cleanText(write?.action) || "update";
  const targetEducationId = cleanText(write?.targetEducationId);
  const institution = cleanText(write?.institution);
  if (!write?.reviewSelection?.selectedAt) {
    return manualEducationResult(
      action,
      "Choose the exact current NXT education relationship before sending this education update to NXT.",
    );
  }
  if (!constituentId || !targetEducationId || !institution) {
    return manualEducationResult(
      action,
      "A matched NXT constituent, a reviewed education-row ID, and Education Institution are required before an education relationship can be updated.",
    );
  }
  if (normalizeText(write?.recordType) !== "individual") {
    return manualEducationResult(
      action,
      "Education imports require a confirmed matched individual NXT constituent. Refresh the preview before applying.",
    );
  }

  const currentEducations = await fetchCurrentEducations({ request, user, constituentId });
  const target = currentEducations.find((education) => getEducationId(education) === targetEducationId);
  if (!target) {
    return manualEducationResult(
      action,
      "The selected current NXT education row is no longer on this constituent. Refresh the import review before applying.",
    );
  }

  const builtPayload = buildEducationPayload({ constituentId, write });
  if (builtPayload.error) return manualEducationResult(action, builtPayload.error);
  const result = await blackbaudApiFetch(
    `/constituent/v1/educations/${encodeURIComponent(targetEducationId)}`,
    {
      userId: user.id,
      authUserId: user.id,
      origin: new URL(request.url).origin,
      method: "PATCH",
      body: builtPayload.payload,
    },
  );
  return {
    status: "applied",
    type: "education_relationship",
    action: "update",
    message: `Updated the reviewed ${institution} education relationship in NXT.`,
    blackbaudResult: result || null,
  };
}

function getRelationshipConstituentId(value) {
  return cleanText(
    value?.relation_id ||
      value?.related_constituent_id ||
      value?.relatedConstituentId ||
      value?.relation?.id,
  );
}

function getRelationshipName(value) {
  return cleanText(
    value?.name ||
      value?.relation_name ||
      value?.related_constituent_name ||
      value?.relation?.name,
  );
}

function relationshipMatchesOrganization(relationship, organization) {
  const relationshipId = getRelationshipConstituentId(relationship);
  const organizationId = cleanText(organization?.id || organization?.constituent_id);
  if (relationshipId && organizationId && relationshipId === organizationId) {
    return true;
  }

  const relationshipName = normalizeText(getRelationshipName(relationship));
  const organizationName = normalizeText(organization?.name);
  return Boolean(relationshipName && organizationName && relationshipName === organizationName);
}

function getSearchCandidateId(value) {
  return cleanText(value?.id || value?.constituent_id || value?.constituentId);
}

function getSearchCandidateName(value) {
  return cleanText(
    value?.name ||
      value?.formatted_name ||
      value?.organization_name ||
      value?.org_name ||
      value?.organization?.name ||
      value?.display_name,
  );
}

function isOrganizationConstituent(value) {
  return normalizeText(
    value?.type || value?.constituent_type || value?.record_type || value?.recordType,
  ).includes("organization");
}

async function fetchCurrentRelationships({ request, user, constituentId }) {
  const payload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}/relationships`,
    {
      userId: user.id,
      authUserId: user.id,
      origin: new URL(request.url).origin,
    },
  );
  return getCollection(payload);
}

async function resolveExactOrganization({ request, user, organizationName }) {
  const origin = new URL(request.url).origin;
  const searchPayload = await blackbaudApiFetch("/constituent/v1/constituents/search", {
    userId: user.id,
    authUserId: user.id,
    origin,
    searchParams: {
      search_text: organizationName,
      limit: 10,
    },
  });

  const exactCandidates = getCollection(searchPayload).filter((candidate) =>
    normalizeText(getSearchCandidateName(candidate)) === normalizeText(organizationName),
  );

  const organizations = [];
  for (const candidate of exactCandidates) {
    const candidateId = getSearchCandidateId(candidate);
    if (!candidateId) continue;

    if (isOrganizationConstituent(candidate)) {
      organizations.push({ id: candidateId, name: getSearchCandidateName(candidate) });
      continue;
    }

    // Search results do not always include constituent type, so verify an exact
    // name candidate before creating any relationship.
    const constituent = await blackbaudApiFetch(
      `/constituent/v1/constituents/${encodeURIComponent(candidateId)}`,
      {
        userId: user.id,
        authUserId: user.id,
        origin,
      },
    );
    if (isOrganizationConstituent(constituent)) {
      organizations.push({
        id: getSearchCandidateId(constituent) || candidateId,
        name: getSearchCandidateName(constituent) || getSearchCandidateName(candidate),
      });
    }
  }

  const uniqueOrganizations = [];
  const seen = new Set();
  for (const organization of organizations) {
    if (!organization?.id || seen.has(organization.id)) continue;
    seen.add(organization.id);
    uniqueOrganizations.push(organization);
  }

  return uniqueOrganizations;
}

function manualOrganizationResult(action, message) {
  return { status: "manual_required", type: "organization_relationship", action, message };
}

async function applyOrganizationRelationshipAdd({ request, user, row, write }) {
  const constituentId = getMatchedConstituentId(row);
  const action = cleanText(write?.action) || "add";
  const recordType = normalizeText(write?.recordType);
  const organizationName = cleanText(write?.name);

  if (!constituentId || !organizationName) {
    return manualOrganizationResult(
      action,
      "A matched NXT constituent ID and Organization Name are required before an organization relationship can be added.",
    );
  }
  if (!recordType.includes("individual")) {
    return manualOrganizationResult(
      action,
      "Organization relationship imports require a confirmed matched individual NXT constituent. Refresh the preview before applying.",
    );
  }

  const currentRelationships = await fetchCurrentRelationships({ request, user, constituentId });
  const organizations = await resolveExactOrganization({ request, user, organizationName });
  if (organizations.length === 0) {
    return manualOrganizationResult(
      action,
      `No exact existing NXT organization matched ${organizationName}; no organization record or relationship was created.`,
    );
  }
  if (organizations.length > 1) {
    return manualOrganizationResult(
      action,
      `More than one exact NXT organization matched ${organizationName}; choose the organization manually to avoid a duplicate or incorrect link.`,
    );
  }

  const organization = organizations[0];
  const existing = currentRelationships.find((relationship) =>
    relationshipMatchesOrganization(relationship, organization),
  );
  if (existing) {
    return {
      status: "applied",
      type: "organization_relationship",
      action: "skip_existing",
      message: `${organization.name} is already linked in NXT; no duplicate organization relationship was added.`,
    };
  }
  if (action === "skip_existing") {
    return manualOrganizationResult(
      action,
      "The matching NXT organization relationship changed after preview. Refresh the preview before applying.",
    );
  }

  const payload = {
    constituent_id: String(constituentId),
    relation_id: String(organization.id),
  };
  const relationshipType = cleanText(write?.relationshipType);
  const title = cleanText(write?.title);
  const startDate = formatDateForBlackbaud(write?.startDate);
  const endDate = formatDateForBlackbaud(write?.endDate);
  if (relationshipType) payload.type = relationshipType;
  if (title) payload.position = title;
  if (startDate) payload.start = startDate;
  if (endDate) payload.end = endDate;
  if (parseBoolean(write?.makePrimary)) payload.is_primary_business = true;

  const result = await blackbaudApiFetch("/constituent/v1/relationships", {
    userId: user.id,
    authUserId: user.id,
    origin: new URL(request.url).origin,
    method: "POST",
    body: payload,
  });

  return {
    status: "applied",
    type: "organization_relationship",
    action: "add",
    message: `Added ${organization.name} as an NXT organization relationship.`,
    blackbaudResult: result || null,
  };
}

async function fetchEmailAddresses({ request, user, constituentId }) {
  const payload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}/emailaddresses`,
    {
      userId: user.id,
      authUserId: user.id,
      origin: new URL(request.url).origin,
    },
  );
  return getCollection(payload);
}

async function fetchContactValues({ request, user, constituentId, kind }) {
  const path =
    kind === "phone"
      ? `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}/phones`
      : `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}/addresses`;
  const payload = await blackbaudApiFetch(path, {
    userId: user.id,
    authUserId: user.id,
    origin: new URL(request.url).origin,
  });
  return getCollection(payload);
}

async function updateExistingContact({ request, user, path, payload }) {
  return blackbaudApiFetch(path, {
    userId: user.id,
    authUserId: user.id,
    origin: new URL(request.url).origin,
    method: "PATCH",
    body: payload,
  });
}

function manualContactResult(type, action, message) {
  return { status: "manual_required", type, action, message };
}

async function demoteExistingPrimary({ request, user, kind, contacts, write }) {
  if (!write?.demoteExistingPrimary) return null;
  const primary = contacts.find((contact) => isPrimaryContact(contact));
  const primaryId = getContactId(primary, kind);
  if (!primary || !primaryId) return null;
  if (cleanText(write.existingPrimaryId) && primaryId !== cleanText(write.existingPrimaryId)) {
    return { stale: true };
  }
  const type = cleanText(write.demotedPrimaryType);
  const endpoint =
    kind === "email"
      ? `/constituent/v1/emailaddresses/${encodeURIComponent(primaryId)}`
      : kind === "phone"
        ? `/constituent/v1/phones/${encodeURIComponent(primaryId)}`
        : `/constituent/v1/addresses/${encodeURIComponent(primaryId)}`;
  const payload = { primary: false };
  if (type) payload.type = type;
  return updateExistingContact({ request, user, path: endpoint, payload });
}

function getContactEndpoint(kind, id) {
  const encodedId = encodeURIComponent(id);
  if (kind === "email") return `/constituent/v1/emailaddresses/${encodedId}`;
  if (kind === "phone") return `/constituent/v1/phones/${encodedId}`;
  return `/constituent/v1/addresses/${encodedId}`;
}

function getContactLabel(contact, kind) {
  if (kind === "email") return getEmailAddress(contact);
  if (kind === "phone") return getPhoneNumber(contact);
  return getAddressLines(contact)[0] || "the selected address";
}

async function applyExistingContactPrimary({ request, user, row, write, kind }) {
  const constituentId = getMatchedConstituentId(row);
  const targetId = cleanText(write?.targetId);
  const type = kind === "email" ? "email_address" : "phone";
  if (!constituentId || !targetId) {
    return manualContactResult(type, "set_primary", "A matched NXT constituent and selected current contact are required.");
  }

  const contacts =
    kind === "email"
      ? await fetchEmailAddresses({ request, user, constituentId })
      : await fetchContactValues({ request, user, constituentId, kind: "phone" });
  const target = contacts.find((contact) => getContactId(contact, kind) === targetId);
  if (!target) {
    return manualContactResult(
      type,
      "set_primary",
      `The selected current NXT ${kind} is no longer available. Refresh the preview before applying.`,
    );
  }
  if (isPrimaryContact(target)) {
    return {
      status: "applied",
      type,
      action: "set_primary",
      message: `${getContactLabel(target, kind)} is already the primary ${kind === "email" ? "email address" : "phone number"}.`,
    };
  }

  const demotion = await demoteExistingPrimary({ request, user, kind, contacts, write });
  if (demotion?.stale) {
    return manualContactResult(
      type,
      "set_primary",
      `The NXT primary ${kind} changed after preview. Refresh the preview before applying.`,
    );
  }
  const result = await updateExistingContact({
    request,
    user,
    path: getContactEndpoint(kind, targetId),
    payload: { primary: true },
  });
  return {
    status: "applied",
    type,
    action: "set_primary",
    message: `${getContactLabel(target, kind)} is now the primary ${kind === "email" ? "email address" : "phone number"}.`,
    blackbaudResult: result || null,
  };
}

async function applyEmailAddressUpdate({ request, user, row, write }) {
  const constituentId = getMatchedConstituentId(row);
  const address = cleanText(write?.address);
  const emailType = cleanText(write?.emailType);
  const makePrimary = parseBoolean(write?.makePrimary);
  const action = cleanText(write?.action) || "add_if_new";

  if (action === "set_primary") {
    return applyExistingContactPrimary({ request, user, row, write, kind: "email" });
  }

  if (!constituentId || !address) {
    return {
      status: "manual_required",
      type: "email_address",
      action,
      message: "A matched NXT constituent ID and a populated email address are required.",
    };
  }
  if (action !== "replace" && !emailType) {
    return {
      status: "manual_required",
      type: "email_address",
      action,
      message: `An NXT email type is required before adding ${address}.`,
    };
  }

  const emails = await fetchEmailAddresses({ request, user, constituentId });
  if (action === "replace") {
    const targetId = cleanText(write?.targetId);
    const target = emails.find((email) => getContactId(email, "email") === targetId);
    if (!targetId || !target) {
      return manualContactResult(
        "email_address",
        "replace",
        "The selected current NXT email is no longer available. Refresh the preview before applying.",
      );
    }
    const duplicate = emails.find(
      (email) =>
        getContactId(email, "email") !== targetId &&
        normalizeEmail(getEmailAddress(email)) === normalizeEmail(address),
    );
    if (duplicate) {
      return manualContactResult(
        "email_address",
        "replace",
        `${address} already exists as a different NXT email address; refresh the preview and choose how to handle it.`,
      );
    }
    const result = await updateExistingContact({
      request,
      user,
      path: `/constituent/v1/emailaddresses/${encodeURIComponent(targetId)}`,
      payload: { address },
    });
    return {
      status: "applied",
      type: "email_address",
      action: "replace",
      message: `Replaced ${getEmailAddress(target)} with ${address}, preserving its NXT type and primary setting.`,
      blackbaudResult: result || null,
    };
  }
  const existing = emails.find(
    (email) => normalizeEmail(getEmailAddress(email)) === normalizeEmail(address),
  );

  if (existing) {
    const existingId = cleanText(existing?.id || existing?.email_address_id);
    if (makePrimary && existingId && !isPrimaryEmail(existing)) {
      return applyExistingContactPrimary({
        request,
        user,
        row,
        write: {
          ...write,
          action: "set_primary",
          targetId: existingId,
          demoteExistingPrimary: true,
        },
        kind: "email",
      });
    }

    return {
      status: "applied",
      type: "email_address",
      action: "skip_existing",
      message: `${address} is already present in NXT; no duplicate email was added.`,
    };
  }

  const demotion = await demoteExistingPrimary({
    request,
    user,
    kind: "email",
    contacts: emails,
    write,
  });
  if (demotion?.stale) {
    return manualContactResult(
      "email_address",
      "add",
      "The NXT primary email changed after preview. Refresh the preview before applying.",
    );
  }

  const result = await blackbaudApiFetch("/constituent/v1/emailaddresses", {
    userId: user.id,
    authUserId: user.id,
    origin: new URL(request.url).origin,
    method: "POST",
    body: {
      constituent_id: String(constituentId),
      address,
      type: emailType,
      primary: makePrimary,
    },
  });

  return {
    status: "applied",
    type: "email_address",
    action: "add",
    message: `Added ${address} to the NXT record${makePrimary ? " as the primary email" : ""}.`,
    blackbaudResult: result || null,
  };
}

function getAddressPayload(write, constituentId, options = {}) {
  const payload = {
    address_lines: [cleanText(write?.addressLine1), cleanText(write?.addressLine2)].filter(Boolean),
    city: cleanText(write?.city),
    state: cleanText(write?.state),
    postal_code: cleanText(write?.postalCode),
    country: cleanText(write?.country),
  };
  const validFrom = formatDateForBlackbaud(write?.validFrom);
  if (validFrom) payload.valid_from = validFrom;
  if (!options.existing) {
    payload.constituent_id = String(constituentId);
    payload.type = cleanText(write?.addressType);
    payload.primary = parseBoolean(write?.makePrimary);
  }
  return payload;
}

async function applyPhoneUpdate({ request, user, row, write }) {
  const constituentId = getMatchedConstituentId(row);
  const number = cleanText(write?.number);
  const phoneType = cleanText(write?.phoneType);
  const action = cleanText(write?.action) || "add";
  if (action === "set_primary") {
    return applyExistingContactPrimary({ request, user, row, write, kind: "phone" });
  }
  if (!constituentId || !number) {
    return manualContactResult("phone", action, "A matched NXT constituent ID and phone number are required.");
  }
  if (action !== "replace" && !phoneType) {
    return manualContactResult("phone", action, `An NXT phone type is required before adding ${number}.`);
  }
  const phones = await fetchContactValues({ request, user, constituentId, kind: "phone" });
  if (action === "replace") {
    const targetId = cleanText(write?.targetId);
    const target = phones.find((phone) => getContactId(phone, "phone") === targetId);
    if (!targetId || !target) {
      return manualContactResult("phone", action, "The selected current NXT phone is no longer available. Refresh the preview before applying.");
    }
    const duplicate = phones.find(
      (phone) => getContactId(phone, "phone") !== targetId && getPhoneNumber(phone) === number,
    );
    if (duplicate) {
      return manualContactResult("phone", action, `${number} already exists as a different NXT phone number.`);
    }
    const result = await updateExistingContact({
      request,
      user,
      path: `/constituent/v1/phones/${encodeURIComponent(targetId)}`,
      payload: { number },
    });
    return {
      status: "applied",
      type: "phone",
      action,
      message: `Replaced ${getPhoneNumber(target)} with ${number}, preserving its NXT type and primary setting.`,
      blackbaudResult: result || null,
    };
  }
  const existing = phones.find((phone) => getPhoneNumber(phone) === number);
  if (existing) {
    const existingId = getContactId(existing, "phone");
    if (parseBoolean(write?.makePrimary) && existingId && !isPrimaryContact(existing)) {
      return applyExistingContactPrimary({
        request,
        user,
        row,
        write: {
          ...write,
          action: "set_primary",
          targetId: existingId,
          demoteExistingPrimary: true,
        },
        kind: "phone",
      });
    }
    return { status: "applied", type: "phone", action: "skip_existing", message: `${number} is already present in NXT; no duplicate phone was added.` };
  }
  const demotion = await demoteExistingPrimary({ request, user, kind: "phone", contacts: phones, write });
  if (demotion?.stale) {
    return manualContactResult("phone", action, "The NXT primary phone changed after preview. Refresh the preview before applying.");
  }
  const result = await blackbaudApiFetch("/constituent/v1/phones", {
    userId: user.id,
    authUserId: user.id,
    origin: new URL(request.url).origin,
    method: "POST",
    body: {
      constituent_id: String(constituentId),
      number,
      type: phoneType,
      primary: parseBoolean(write?.makePrimary),
    },
  });
  return {
    status: "applied",
    type: "phone",
    action: "add",
    message: `Added ${number} to the NXT record${parseBoolean(write?.makePrimary) ? " as the primary phone" : ""}.`,
    blackbaudResult: result || null,
  };
}

async function applyAddressUpdate({ request, user, row, write }) {
  const constituentId = getMatchedConstituentId(row);
  const addressLine1 = cleanText(write?.addressLine1);
  const addressType = cleanText(write?.addressType);
  const validFrom = cleanText(write?.validFrom);
  const action = cleanText(write?.action) || "add";
  if (!constituentId || !addressLine1) {
    return manualContactResult("address", action, "A matched NXT constituent ID and address line 1 are required.");
  }
  if (action !== "replace" && !addressType) {
    return manualContactResult("address", action, "An NXT address type is required before adding this address.");
  }
  if (validFrom && !parseBirthDate(validFrom)) {
    return manualContactResult("address", action, "Address Valid From must use a valid MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD value before it can be imported.");
  }
  const addresses = await fetchContactValues({ request, user, constituentId, kind: "address" });
  if (action === "replace") {
    const targetId = cleanText(write?.targetId);
    const target = addresses.find((address) => getContactId(address, "address") === targetId);
    if (!targetId || !target) {
      return manualContactResult("address", action, "The selected current NXT address is no longer available. Refresh the preview before applying.");
    }
    const targetLines = getAddressLines(target);
    const duplicate = addresses.find(
      (address) =>
        getContactId(address, "address") !== targetId &&
        cleanText(getAddressLines(address)[0]).toLowerCase() === addressLine1.toLowerCase(),
    );
    if (duplicate) {
      return manualContactResult("address", action, `${addressLine1} already exists as a different NXT address.`);
    }
    const result = await updateExistingContact({
      request,
      user,
      path: `/constituent/v1/addresses/${encodeURIComponent(targetId)}`,
      payload: getAddressPayload(write, constituentId, { existing: true }),
    });
    return {
      status: "applied",
      type: "address",
      action,
      message: `Replaced ${targetLines[0] || "the selected NXT address"} with ${addressLine1}, preserving its NXT type and primary setting${validFrom ? ` and setting valid from ${formatDateForBlackbaud(validFrom)}` : ""}.`,
      blackbaudResult: result || null,
    };
  }
  const isDuplicate = addresses.some(
    (address) => cleanText(getAddressLines(address)[0]).toLowerCase() === addressLine1.toLowerCase(),
  );
  if (isDuplicate) {
    return { status: "applied", type: "address", action: "skip_existing", message: `${addressLine1} is already present in NXT; no duplicate address was added.` };
  }
  const demotion = await demoteExistingPrimary({ request, user, kind: "address", contacts: addresses, write });
  if (demotion?.stale) {
    return manualContactResult("address", action, "The NXT primary address changed after preview. Refresh the preview before applying.");
  }
  const result = await blackbaudApiFetch("/constituent/v1/addresses", {
    userId: user.id,
    authUserId: user.id,
    origin: new URL(request.url).origin,
    method: "POST",
    body: getAddressPayload(write, constituentId),
  });
  return {
    status: "applied",
    type: "address",
    action: "add",
    message: `Added ${addressLine1} to the NXT record${parseBoolean(write?.makePrimary) ? " as the primary address" : ""}${validFrom ? `, valid from ${formatDateForBlackbaud(validFrom)}` : ""}.`,
    blackbaudResult: result || null,
  };
}

async function applyAddressPreviousUpdate({ request, user, row, write }) {
  const constituentId = getMatchedConstituentId(row);
  const targetId = cleanText(write?.targetId);
  const validTo = cleanText(write?.validTo);
  if (!constituentId || !targetId || !validTo) {
    return manualContactResult(
      "address",
      "mark_previous",
      "A matched NXT constituent, selected current address, and end date are required before an address can be marked Previous Address.",
    );
  }
  if (!parseBirthDate(validTo)) {
    return manualContactResult(
      "address",
      "mark_previous",
      "The Previous Address end date must use a valid MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD value.",
    );
  }

  const addresses = await fetchContactValues({ request, user, constituentId, kind: "address" });
  const target = addresses.find((address) => getContactId(address, "address") === targetId);
  if (!target) {
    return manualContactResult(
      "address",
      "mark_previous",
      "The selected current NXT address is no longer available. Refresh the preview before applying.",
    );
  }
  const result = await updateExistingContact({
    request,
    user,
    path: getContactEndpoint("address", targetId),
    payload: {
      type: "Previous Address",
      valid_to: formatDateForBlackbaud(validTo),
    },
  });
  return {
    status: "applied",
    type: "address",
    action: "mark_previous",
    message: `Marked ${getContactLabel(target, "address")} as Previous Address through ${formatDateForBlackbaud(validTo)}.`,
    blackbaudResult: result || null,
  };
}

async function applyConstituentCodeAdd({ request, user, row, write, currentCodes = null }) {
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

  const liveCodes =
    currentCodes || (await fetchConstituencyCodes({ request, user, constituentId }));
  const existingCode = findCode(liveCodes, targetConstituency);
  if (existingCode && !isOpenConstituencyCode(existingCode)) {
    return {
      status: "manual_required",
      type: "constituent_code",
      action: "add",
      targetConstituency,
      message: `${targetConstituency} already exists in NXT with an end date; review before adding another copy.`,
    };
  }
  if (existingCode) {
    return {
      status: "applied",
      type: "constituent_code",
      action: "skip_existing",
      targetConstituency,
      message: `${targetConstituency} is already present in NXT; no duplicate code was added.`,
    };
  }

  const result = await createConstituentCode({
    request,
    user,
    constituentId,
    targetConstituency,
    row,
    write,
  });

  return {
    status: "applied",
    type: "constituent_code",
    action: "add",
    targetConstituency,
    blackbaudResult: result || null,
  };
}

async function applyConstituentCodeEndDate({ request, user, row, write }) {
  const constituentId = getMatchedConstituentId(row);
  const sourceConstituency = cleanText(write.sourceConstituency || row.source_constituency);
  const endDate = formatDateForBlackbaud(write.endDate || row.end_date);

  if (!constituentId || !sourceConstituency) {
    return {
      status: "manual_required",
      type: "constituent_code",
      action: write.action || "end-date",
      message: "Missing matched NXT constituent ID or current constituent code.",
    };
  }
  if (!endDate) {
    return {
      status: "manual_required",
      type: "constituent_code",
      action: write.action || "end-date",
      message: `An end date is required before ${sourceConstituency} can be changed in NXT.`,
    };
  }

  const liveCodes = await fetchConstituencyCodes({ request, user, constituentId });
  const sourceCode = findOpenCode(liveCodes, sourceConstituency);
  if (!sourceCode && findCode(liveCodes, sourceConstituency)) {
    return {
      status: "manual_required",
      type: "constituent_code",
      action: write.action || "end-date",
      message: `${sourceConstituency} already has an end date in NXT; review before changing it.`,
    };
  }
  if (!sourceCode?.id) {
    return {
      status: "manual_required",
      type: "constituent_code",
      action: write.action || "end-date",
      message: `${sourceConstituency} was not found on the current NXT record.`,
    };
  }

  const result = await patchConstituentCode({
    request,
    user,
    codeId: sourceCode.id,
    payload: { date_to: endDate },
  });

  return {
    status: "applied",
    type: "constituent_code",
    action: "end-date",
    sourceConstituency,
    endDate,
    blackbaudResult: result || null,
  };
}

async function applyConstituentCodeReplace({ request, user, row, write }) {
  const constituentId = getMatchedConstituentId(row);
  const sourceConstituency = cleanText(write.sourceConstituency || row.source_constituency);
  const targetConstituency = cleanText(write.targetConstituency || row.target_constituency);
  const sourceCodeId = cleanText(write.sourceCodeId);
  const startDate = formatDateForBlackbaud(write.startDate);
  const endDate = formatDateForBlackbaud(write.endDate);

  if (!constituentId || !sourceConstituency || !targetConstituency) {
    return {
      status: "manual_required",
      type: "constituent_code",
      action: "replace",
      message:
        "Matched NXT constituent ID, current constituent code, and new constituent code are required before replace can apply.",
    };
  }
  if (!sourceCodeId) {
    return {
      status: "manual_required",
      type: "constituent_code",
      action: "replace",
      message:
        "Choose the exact current NXT constituent-code row before replacing it. Reload this import row and complete the constituency replacement review.",
    };
  }

  const liveCodes = await fetchConstituencyCodes({ request, user, constituentId });
  if (normalizeText(sourceConstituency) === normalizeText(targetConstituency)) {
    return {
      status: "applied",
      type: "constituent_code",
      action: "skip_existing",
      sourceConstituency,
      targetConstituency,
      message: `${sourceConstituency} already matches the selected constituent code.`,
    };
  }

  const sourceCode = liveCodes.find((code) => String(code.id) === sourceCodeId) || null;
  if (sourceCode && normalizeText(sourceCode.label) !== normalizeText(sourceConstituency)) {
    return {
      status: "manual_required",
      type: "constituent_code",
      action: "replace",
      message: `The selected NXT code no longer matches ${sourceConstituency}. Reload this import row and review the current NXT codes again.`,
    };
  }
  if (!sourceCode?.id) {
    return {
      status: "manual_required",
      type: "constituent_code",
      action: "replace",
      message: `${sourceConstituency} was not found on the current NXT record.`,
    };
  }

  const targetAlreadyExists = findCode(liveCodes, targetConstituency);
  if (targetAlreadyExists) {
    return {
      status: "manual_required",
      type: "constituent_code",
      action: "replace",
      message: `${targetConstituency} already exists in NXT; review before replacing ${sourceConstituency} to avoid a duplicate constituent code.`,
    };
  }

  // Replacement is intentionally delete-and-create. Only the reviewed source ID is removed;
  // every other NXT constituency code is left untouched.
  await deleteConstituentCode({ request, user, codeId: sourceCode.id });

  let result;
  try {
    result = await createConstituentCode({
      request,
      user,
      constituentId,
      targetConstituency,
      row,
      write: { ...write, startDate, endDate },
    });
  } catch (error) {
    // Restore the removed row if the target cannot be created. If restoration also fails,
    // surface both outcomes so Advancement Services can resolve the record safely.
    try {
      await createConstituentCode({
        request,
        user,
        constituentId,
        targetConstituency: sourceCode.label,
        row,
        write: {
          startDate: sourceCode.startDate || "",
          endDate: sourceCode.endDate || "",
        },
      });
    } catch (restoreError) {
      throw new Error(
        `NXT removed the selected ${sourceConstituency} code but could not create ${targetConstituency} or restore ${sourceConstituency}. Original error: ${error instanceof Error ? error.message : "Unknown error"}. Restore error: ${restoreError instanceof Error ? restoreError.message : "Unknown error"}.`,
      );
    }
    throw new Error(
      `NXT could not create ${targetConstituency}; the selected ${sourceConstituency} code was restored with its original dates. ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  return {
    status: "applied",
    type: "constituent_code",
    action: "replace",
    sourceConstituency,
    targetConstituency,
    sourceCodeId: String(sourceCode.id),
    removedSourceDates: {
      startDate: formatDateForBlackbaud(sourceCode.startDate) || null,
      endDate: formatDateForBlackbaud(sourceCode.endDate) || null,
    },
    startDate: startDate || null,
    endDate: endDate || null,
    message: `Removed the selected ${sourceConstituency} constituent-code row${sourceCode.startDate || sourceCode.endDate ? ` (start ${formatDateForBlackbaud(sourceCode.startDate) || "not set"}; end ${formatDateForBlackbaud(sourceCode.endDate) || "not set"})` : ""} and created ${targetConstituency}${startDate || endDate ? ` (start ${startDate || "not set"}; end ${endDate || "not set"})` : " without dates"}. Other NXT constituent codes were not changed.`,
    blackbaudResult: result || null,
  };
}

async function applyWrite({ request, user, row, write }) {
  if (write?.type === "constituent_name" && write?.action === "update") {
    return applyConstituentNameUpdate({ request, user, row, write });
  }
  if (write?.type === "constituent_profile" && write?.action === "update") {
    return applyConstituentProfileUpdate({ request, user, row, write });
  }
  if (write?.type === "constituent_name_format" && write?.action === "update_primary") {
    return applyConstituentNameFormatUpdate({ request, user, row, write });
  }
  if (
    write?.type === "email_address" &&
    ["add_if_new", "add", "replace", "set_primary"].includes(write?.action)
  ) {
    return applyEmailAddressUpdate({ request, user, row, write });
  }
  if (write?.type === "phone" && ["add", "replace", "set_primary"].includes(write?.action)) {
    return applyPhoneUpdate({ request, user, row, write });
  }
  if (write?.type === "address" && ["add", "replace"].includes(write?.action)) {
    return applyAddressUpdate({ request, user, row, write });
  }
  if (write?.type === "address" && write?.action === "mark_previous") {
    return applyAddressPreviousUpdate({ request, user, row, write });
  }
  if (
    write?.type === "education_relationship" &&
    ["add", "skip_existing"].includes(write?.action)
  ) {
    return applyEducationRelationshipAdd({ request, user, row, write });
  }
  if (write?.type === "education_relationship" && write?.action === "update") {
    return applyEducationRelationshipUpdate({ request, user, row, write });
  }
  if (
    write?.type === "organization_relationship" &&
    ["add", "skip_existing"].includes(write?.action)
  ) {
    return applyOrganizationRelationshipAdd({ request, user, row, write });
  }
  if (write?.type === "constituent_code" && write?.action === "add") {
    return applyConstituentCodeAdd({ request, user, row, write });
  }
  if (write?.type === "constituent_code" && write?.action === "end-date") {
    return applyConstituentCodeEndDate({ request, user, row, write });
  }
  if (write?.type === "constituent_code" && write?.action === "replace") {
    return applyConstituentCodeReplace({ request, user, row, write });
  }

  if (write?.type === "constituent_code") {
    return {
      status: "manual_required",
      type: "constituent_code",
      action: write?.action || "review",
      message:
        "This constituent-code action is not automated yet.",
    };
  }

  if (write?.type === "education_relationship") {
    return {
      status: "manual_required",
      type: "education_relationship",
      action: write?.action || "review",
      message:
        "This education relationship needs review before NXT can identify one existing row to update.",
    };
  }

  if (write?.type === "organization_relationship") {
    return {
      status: "manual_required",
      type: "organization_relationship",
      action: write?.action || "review",
      message:
        "Only add-only organization relationship imports are automated. Existing organization relationships are not edited by this import.",
    };
  }

  return {
    status: "manual_required",
    type: write?.type || "unknown",
    action: write?.action || "review",
    message: "This staged write type is not automated yet.",
  };
}

function getWriteItems(row, retryFailedOnly = false) {
  const writePlan = getWritePlan(row);
  const items = writePlan.map((write, writeIndex) => ({ write, writeIndex }));
  if (!retryFailedOnly) return items;

  const priorResults = Array.isArray(row?.blackbaud_result?.results)
    ? row.blackbaud_result.results
    : [];
  const failedIndexes = new Set(
    priorResults
      .filter((result) => result?.status === "failed" && Number.isInteger(result?.writeIndex))
      .map((result) => result.writeIndex),
  );

  return items.filter((item) => failedIndexes.has(item.writeIndex));
}

function getPriorAttempts(row) {
  const priorResult = row?.blackbaud_result;
  if (!priorResult || typeof priorResult !== "object") return [];
  if (Array.isArray(priorResult.attempts)) return priorResult.attempts;
  if (!Array.isArray(priorResult.results)) return [];

  return [
    {
      attemptedAt: priorResult.appliedAt || null,
      appliedByUserId: priorResult.appliedByUserId || null,
      appliedByEmail: priorResult.appliedByEmail || "",
      retryFailedOnly: false,
      results: priorResult.results,
    },
  ];
}

function buildApplyAudit({ row, user, results, retryFailedOnly }) {
  const priorResult =
    row?.blackbaud_result && typeof row.blackbaud_result === "object"
      ? row.blackbaud_result
      : {};
  const { results: _priorResults, attempts: _priorAttempts, ...priorAudit } = priorResult;
  const attemptedAt = new Date().toISOString();
  const attempt = {
    attemptedAt,
    appliedByUserId: user.id,
    appliedByEmail: user.email,
    retryFailedOnly,
    results,
  };

  return {
    ...priorAudit,
    appliedByUserId: user.id,
    appliedByEmail: user.email,
    appliedAt: attemptedAt,
    retryFailedOnly,
    results,
    attempts: [...getPriorAttempts(row), attempt],
  };
}

function createFailedWriteResult(write, writeIndex, error) {
  return {
    status: "failed",
    type: write?.type || "unknown",
    action: write?.action || "apply",
    writeIndex,
    message: error instanceof Error ? error.message : "NXT rejected this staged write.",
  };
}

async function applyRowWrites({ request, user, row, retryFailedOnly = false }) {
  const writeItems = getWriteItems(row, retryFailedOnly);
  if (retryFailedOnly && writeItems.length === 0) {
    return {
      retryUnavailable: true,
      message:
        "This failure does not include a write-level retry record. Re-preview the source row and review NXT before applying it again.",
    };
  }

  const results = [];
  for (const { write, writeIndex } of writeItems) {
    if (
      write?.requiresSuccessfulAddressAdd &&
      !results.some(
        (result) => result.type === "address" && result.action === "add" && result.status === "applied",
      )
    ) {
      results.push({
        status: "manual_required",
        type: "address",
        action: "mark_previous",
        writeIndex,
        message: "The new address was not added, so the selected prior address was left unchanged.",
      });
      continue;
    }
    try {
      const result = await applyWrite({ request, user, row, write });
      results.push({ ...result, writeIndex });
    } catch (error) {
      results.push(createFailedWriteResult(write, writeIndex, error));
    }
  }

  const appliedWrites = results.filter((result) => result.status === "applied");
  const manualWrites = results.filter((result) => result.status === "manual_required");
  const failedWrites = results.filter((result) => result.status === "failed");
  const nextStatus = failedWrites.length
    ? "Failed"
    : manualWrites.length
      ? "Needs Review"
      : "Applied";
  const failureMessage = failedWrites.map((result) => result.message).filter(Boolean).join(" ");

  await sql`
    UPDATE constituency_import_rows
    SET
      status = ${nextStatus},
      blackbaud_result = ${JSON.stringify(
        buildApplyAudit({ row, user, results, retryFailedOnly }),
      )}::jsonb,
      blackbaud_error = ${failureMessage || null},
      applied_at = CASE
        WHEN ${appliedWrites.length}::INTEGER > 0 THEN COALESCE(applied_at, NOW())
        ELSE applied_at
      END,
      updated_at = NOW()
    WHERE id = ${row.id}
  `;

  return {
    applied: appliedWrites.length > 0,
    manualRequired: manualWrites.length > 0,
    failed: failedWrites.length > 0,
    results,
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

    const { searchParams } = new URL(request.url);
    const retryRowId = cleanText(searchParams.get("retryRowId"));
    if (retryRowId && !/^\d+$/.test(retryRowId)) {
      return Response.json({ error: "Invalid import row ID" }, { status: 400 });
    }

    let selectedRowIds = null;
    if (!retryRowId) {
      const body = await request.json().catch(() => ({}));
      const selection = parseSelectedRowIds(body?.rowIds);
      if (selection.error) {
        return Response.json({ error: selection.error }, { status: 400 });
      }
      selectedRowIds = selection.rowIds;
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

    const candidateRows = retryRowId
      ? await sql`
          SELECT *
          FROM constituency_import_rows
          WHERE run_id = ${runId}
            AND id = ${retryRowId}
            AND status = 'Failed'
          LIMIT 1
        `
      : selectedRowIds
        ? await sql`
            SELECT *
            FROM constituency_import_rows
            WHERE run_id = ${runId}
              AND id = ANY(${selectedRowIds})
              AND status = 'Ready'
              AND applied_at IS NULL
            ORDER BY row_number ASC
          `
        : await sql`
          SELECT *
          FROM constituency_import_rows
          WHERE run_id = ${runId}
            AND status = 'Ready'
            AND applied_at IS NULL
          ORDER BY row_number ASC
        `;

    if (selectedRowIds && candidateRows.length !== selectedRowIds.length) {
      const payload = await fetchRunWithRows(runId);
      const error =
        "One or more selected rows are no longer Ready to apply. Refresh the saved run, review the remaining eligible rows, and try again.";
      return Response.json(
        {
          ...payload,
          error,
          applySummary: {
            applied: 0,
            manualRequired: 0,
            failed: 0,
            message: error,
          },
        },
        { status: 409 },
      );
    }

    if (!candidateRows.length) {
      const payload = await fetchRunWithRows(runId);
      return Response.json({
        ...payload,
        applySummary: {
          applied: 0,
          manualRequired: 0,
          failed: 0,
          message: retryRowId
            ? "That row is no longer eligible for a failed-write retry. Refresh the saved run before trying again."
            : "No ready unapplied rows were available to apply.",
        },
      });
    }

    let applied = 0;
    let manualRequired = 0;
    let failed = 0;

    for (const row of candidateRows) {
      const result = await applyRowWrites({
        request,
        user: authResult.user,
        row,
        retryFailedOnly: Boolean(retryRowId),
      });

      if (result.retryUnavailable) {
        const payload = await fetchRunWithRows(runId);
        return Response.json(
          {
            ...payload,
            applySummary: {
              applied: 0,
              manualRequired: 1,
              failed: 0,
              message: result.message,
            },
          },
          { status: 409 },
        );
      }

      if (result.applied) applied += 1;
      if (result.manualRequired) manualRequired += 1;
      if (result.failed) failed += 1;
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
        message: retryRowId
          ? `Retried failed NXT writes for ${candidateRows.length} row${candidateRows.length === 1 ? "" : "s"}; ${applied} completed; ${manualRequired} need manual review; ${failed} still failed.`
          : `Applied ${applied} of ${candidateRows.length} selected row${candidateRows.length === 1 ? "" : "s"}; ${manualRequired} need manual review; ${failed} failed.`,
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
