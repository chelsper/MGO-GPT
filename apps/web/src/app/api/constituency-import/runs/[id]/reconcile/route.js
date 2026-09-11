import { auth } from "@/auth";
import { getImportWriteResults } from "@/utils/importWriteResults";
import { importAddressMatches } from "@/utils/importAddressVerification";
import { importPhonesMatch } from "@/utils/importPhoneMatching";
import { canFinishImportWithoutSending } from "@/utils/importCompletion";
import { verifyImportTargetIdentity } from "@/app/api/utils/importTargetIdentity";
import { saveImportVerification, refreshVerifiedImportSummary } from "@/app/api/utils/saveImportVerification";
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

function parseBoolean(value) {
  return ["true", "yes", "y", "1"].includes(normalizeText(value));
}

function parseRowIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "Select at least one applied row to verify in NXT." };
  }
  const rowIds = value.map(cleanText);
  if (rowIds.some((rowId) => !/^\d+$/.test(rowId))) {
    return { error: "One or more selected import rows are invalid." };
  }
  if (new Set(rowIds).size !== rowIds.length) {
    return { error: "Each selected import row may appear only once." };
  }
  return { rowIds };
}

function getCollection(payload) {
  const values = Array.isArray(payload?.value) ? payload.value : Array.isArray(payload) ? payload : null;
  if (!values || payload?.next_link || payload?.next || payload?.links?.next ||
      (payload?.count != null && (!Number.isFinite(Number(payload.count)) || Number(payload.count) > values.length))) {
    throw new Error("NXT returned an incomplete list. Verification cannot confirm this change; no NXT data was changed.");
  }
  return values;
}

function getMatchedConstituentId(row) {
  const preview = row.preview && typeof row.preview === "object" ? row.preview : {};
  return cleanText(
    row.matched_blackbaud_constituent_id ||
      preview.match?.blackbaudConstituentId ||
      preview.input?.blackbaudConstituentId,
  );
}

function getWritePlan(row) {
  if (Array.isArray(row.requested_writes) && row.requested_writes.length) {
    return row.requested_writes;
  }
  return Array.isArray(row.preview?.writePlan) ? row.preview.writePlan : [];
}

function getAppliedResult(row, writeIndex) {
  const results = getImportWriteResults(row.blackbaud_result);
  return results.find((result) => result?.writeIndex === writeIndex) || null;
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

function isPrimaryContact(value) {
  return parseBoolean(value?.primary ?? value?.is_primary ?? value?.preferred);
}

function getEmailAddress(value) {
  return cleanText(typeof value === "string" ? value : value?.address || value?.email || value?.email_address);
}

function getPhoneNumber(value) {
  return cleanText(typeof value === "string" ? value : value?.number || value?.phone || value?.phone_number);
}

function getAddressLines(value) {
  const lines = value?.address_lines || value?.addressLines || value?.lines;
  if (Array.isArray(lines)) return lines.map(cleanText).filter(Boolean);
  if (typeof lines === "string") return lines.split("\n").map(cleanText).filter(Boolean);
  return [cleanText(value?.address_line1 || value?.line1), cleanText(value?.address_line2 || value?.line2)].filter(Boolean);
}

function getConstituencyLabel(value) {
  if (typeof value === "string") return cleanText(value);
  return cleanText(
    value?.description ||
      value?.constituent_code ||
      value?.constituentCode ||
      value?.constituency ||
      value?.code ||
      value?.name ||
      value?.type,
  );
}

function mapConstituencyCode(value) {
  return {
    id: cleanText(value?.id),
    label: getConstituencyLabel(value),
    startDate: value?.date_from || value?.start_date || value?.start || "",
    endDate: value?.date_to || value?.end_date || value?.end || "",
  };
}

function getEducationSchool(value) {
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
  if (Array.isArray(pluralValue)) pluralValue.forEach((item) => values.push(getEducationValueText(item)));
  else if (pluralValue) values.push(getEducationValueText(pluralValue));
  singularKeys.forEach((key) => values.push(getEducationValueText(value?.[key])));
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function educationMatchesWrite(write, education) {
  if (normalizeText(write?.institution) !== normalizeText(getEducationSchool(education))) return false;
  const matchesValue = (expected, values) => {
    const normalizedExpected = normalizeText(expected);
    return !normalizedExpected || values.some((value) => normalizeText(value) === normalizedExpected);
  };
  return (
    matchesValue(write?.degree, getEducationValues(education, "degrees", ["degree", "degree_name"])) &&
    matchesValue(write?.major, getEducationValues(education, "majors", ["major", "major_name"])) &&
    (!cleanText(write?.classYear) || cleanText(write.classYear) === cleanText(education?.class_of || education?.class_year || education?.classYear || education?.class))
  );
}

function educationDetailsMismatch(write, education) {
  const mismatches = [];
  const textFields = [
    ["school type", write?.schoolType, education?.type ?? education?.school_type],
    ["campus", write?.campus, education?.campus],
    [
      "fraternity/sorority",
      write?.fraternitySorority,
      education?.social_organization ?? education?.fraternity_sorority,
    ],
    ["status", write?.status, education?.status],
  ];
  textFields.forEach(([label, expected, actual]) => {
    if (cleanText(expected) && normalizeText(expected) !== normalizeText(getEducationValueText(actual))) {
      mismatches.push(label);
    }
  });

  const expectedMinor = cleanText(write?.minor);
  if (
    expectedMinor &&
    !getEducationValues(education, "minors", ["minor", "minor_name"]).some(
      (value) => normalizeText(value) === normalizeText(expectedMinor),
    )
  ) {
    mismatches.push("minor");
  }

  const expectedGpa = cleanText(write?.gpa);
  if (
    expectedGpa &&
    (!Number.isFinite(Number(education?.gpa)) || Math.abs(Number(expectedGpa) - Number(education.gpa)) > 0.001)
  ) {
    mismatches.push("GPA");
  }

  const dateFields = [
    ["date graduated", write?.dateGraduated, education?.date_graduated ?? education?.graduation_date],
    ["date entered", write?.dateEntered, education?.date_entered],
    ["date left", write?.dateLeft, education?.date_left],
  ];
  dateFields.forEach(([label, expected, actual]) => {
    if (cleanText(expected) && comparableDate(expected) !== comparableDate(actual)) {
      mismatches.push(label);
    }
  });

  if (parseBoolean(write?.makePrimary) && !parseBoolean(education?.primary ?? education?.is_primary)) {
    mismatches.push("primary designation");
  }

  return mismatches;
}

function getRelationshipName(value) {
  return cleanText(value?.name || value?.relation_name || value?.related_constituent_name || value?.relation?.name);
}

function comparableDate(value) {
  if (!value) return "";
  if (typeof value === "object") {
    const year = value.y || value.year;
    const month = value.m || value.month;
    const day = value.d || value.day;
    if (year && month && day) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (year && month) return `${year}-${String(month).padStart(2, "0")}`;
    if (year) return String(year);
  }
  const text = cleanText(value);
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!us) return text;
  const currentTwoDigitYear = new Date().getUTCFullYear() % 100;
  const rawYear = Number(us[3]);
  const year = rawYear < 100 ? (rawYear <= currentTwoDigitYear ? 2000 + rawYear : 1900 + rawYear) : rawYear;
  return `${year}-${String(us[1]).padStart(2, "0")}-${String(us[2]).padStart(2, "0")}`;
}

function verificationResult({ status, write, message }) {
  return {
    status,
    type: write?.type || "unknown",
    action: write?.action || "apply",
    message,
  };
}

function confirmed(write, message) {
  return verificationResult({ status: "confirmed", write, message });
}

function needsReview(write, message) {
  return verificationResult({ status: "needs_review", write, message });
}

async function requireReviewer(request) {
  const session = await auth();
  if (!session?.user?.email) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { sessionUser: user } = await getWorkspaceUser(session, request);
  if (!user) return { error: Response.json({ error: "User not found" }, { status: 404 }) };
  if (!isReviewerRole(user.role)) {
    return {
      error: Response.json(
        { error: "Only Advancement Services users can verify import runs." },
        { status: 403 },
      ),
    };
  }
  return { user };
}

function createSnapshotReader({ request, user, constituentId }) {
  const origin = new URL(request.url).origin;
  const cache = new Map();
  const read = (key, path) => {
    if (!cache.has(key)) {
      cache.set(
        key,
        blackbaudApiFetch(path, { userId: user.id, authUserId: user.id, origin }),
      );
    }
    return cache.get(key);
  };
  return {
    constituent: () => read("constituent", `/constituent/v1/constituents/${encodeURIComponent(constituentId)}`),
    emails: async () => getCollection(await read("emails", `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/emailaddresses`)),
    phones: async () => getCollection(await read("phones", `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/phones`)),
    addresses: async () => getCollection(await read("addresses", `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/addresses`)),
    codes: async () => getCollection(await read("codes", `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/constituentcodes`)).map(mapConstituencyCode),
    educations: async () => getCollection(await read("educations", `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/educations`)),
    relationships: async () => getCollection(await read("relationships", `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/relationships`)),
    nameFormatSummary: () => read(
      "name-format-summary",
      `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/nameformats/summary`,
    ),
  };
}

function contactMismatch({ write, applyResult, contacts, contact, kind }) {
  if (write.action === "set_primary" || parseBoolean(write.makePrimary)) {
    if (!isPrimaryContact(contact)) return "The saved contact is not marked primary in NXT.";
    if (contacts.some((other) => getContactId(other, kind) !== getContactId(contact, kind) && isPrimaryContact(other))) {
      return "NXT still lists another primary contact of this kind. Compare the primary settings before finishing.";
    }
    if (parseBoolean(write.demoteExistingPrimary) && cleanText(write.existingPrimaryId) && cleanText(write.existingPrimaryId) !== getContactId(contact, kind)) {
      const prior = contacts.find((other) => getContactId(other, kind) === cleanText(write.existingPrimaryId));
      if (!prior || (cleanText(write.demotedPrimaryType) && normalizeText(prior.type) !== normalizeText(write.demotedPrimaryType))) {
        return "The previous primary contact does not match the requested retained contact/type.";
      }
    }
  }
  const type = kind === "email" ? write.emailType : kind === "phone" ? write.phoneType : write.addressType;
  if (!["replace", "set_primary"].includes(write.action) && !["skip_existing", "set_primary"].includes(applyResult?.action) &&
      cleanText(type) && normalizeText(contact.type) !== normalizeText(type)) {
    return "The contact exists, but its NXT type does not match the requested type.";
  }
  return "";
}

async function reconcileWrite({ write, applyResult, reader, verifyExisting = false }) {
  if (!verifyExisting && applyResult?.status !== "applied") {
    return needsReview(write, "No completed NXT write is available to verify for this staged change.");
  }

  if (write.type === "constituent_name") {
    const constituent = await reader.constituent();
    const expected = [
      ["first", write.firstName],
      ["last", write.lastName],
      ["preferred name", write.preferredName],
    ].filter(([, value]) => cleanText(value));
    const actual = {
      first: constituent?.first || constituent?.first_name,
      last: constituent?.last || constituent?.last_name,
      "preferred name": constituent?.preferred_name || constituent?.preferredName,
    };
    const mismatches = expected.filter(([label, value]) => normalizeText(actual[label]) !== normalizeText(value));
    if (!expected.length) return needsReview(write, "No name fields were supplied to verify.");
    return mismatches.length
      ? needsReview(write, `NXT currently differs for ${mismatches.map(([label]) => label).join(", ")}.`)
      : confirmed(write, "NXT name fields match the applied import values.");
  }

  if (write.type === "constituent_profile") {
    const constituent = await reader.constituent();
    const expected = [
      ["title", write.title, constituent?.title],
      ["gender", write.gender, constituent?.gender],
      ["ethnicity", write.ethnicity, constituent?.ethnicity?.description || constituent?.ethnicity?.name || constituent?.ethnicity?.value || constituent?.ethnicity],
      ["suffix", write.suffix, constituent?.suffix],
      ["birth date", write.birthDate, constituent?.birthdate || constituent?.birth_date],
    ].filter(([, value]) => cleanText(value));
    const mismatches = expected.filter(([label, value, actual]) =>
      label === "birth date"
        ? comparableDate(actual) !== comparableDate(value)
        : normalizeText(actual) !== normalizeText(value),
    );
    if (!expected.length) return needsReview(write, "No profile fields were supplied to verify.");
    return mismatches.length
      ? needsReview(write, `NXT currently differs for ${mismatches.map(([label]) => label).join(", ")}.`)
      : confirmed(write, "NXT profile fields match the applied import values.");
  }

  if (write.type === "constituent_name_format") {
    const value = cleanText(write.value);
    const targetId = cleanText(write.targetId);
    if (!targetId || !value) return needsReview(write, "The primary name-format ID or proposed value is unavailable for verification.");
    const summary = await reader.nameFormatSummary();
    const current = write.kind === "salutation"
      ? summary?.primary_salutation || summary?.primarySalutation
      : summary?.primary_addressee || summary?.primaryAddressee;
    const actual = cleanText(current?.formatted_name || current?.formattedName || current?.name);
    if (verifyExisting && (cleanText(current?.id) !== targetId || current?.custom_format !== true)) {
      return needsReview(write, "The primary name-format record or custom-text setting does not match the requested change.");
    }
    return normalizeText(actual) === normalizeText(value)
      ? confirmed(write, `NXT primary ${write.kind || "name format"} matches the import value.`)
      : needsReview(write, `NXT primary ${write.kind || "name format"} does not yet match the import value.`);
  }

  if (write.type === "email_address") {
    const address = cleanText(write.address).toLowerCase();
    const contacts = await reader.emails();
    const matches = contacts.filter((value) => write.action === "set_primary"
      ? getContactId(value, "email") === cleanText(write.targetId)
      : Boolean(address) && (!write.targetId || getContactId(value, "email") === cleanText(write.targetId)) && getEmailAddress(value).toLowerCase() === address);
    if (verifyExisting && matches.length !== 1) return needsReview(write, "The requested email must match exactly one current NXT email record.");
    const email = matches[0];
    if (!email) return needsReview(write, "The imported email address was not found on the current NXT record.");
    const mismatch = verifyExisting && contactMismatch({ write, applyResult, contacts, contact: email, kind: "email" });
    if (mismatch) return needsReview(write, mismatch);
    if ((parseBoolean(write.makePrimary) || write.action === "set_primary") && !isPrimaryContact(email)) {
      return needsReview(write, "The imported email address exists in NXT but is not marked primary.");
    }
    return confirmed(write, "The imported email address is present in NXT.");
  }

  if (write.type === "phone") {
    const number = cleanText(write.number);
    const contacts = await reader.phones();
    const matches = contacts.filter((value) => write.action === "set_primary"
      ? getContactId(value, "phone") === cleanText(write.targetId)
      : (!write.targetId || getContactId(value, "phone") === cleanText(write.targetId)) && importPhonesMatch(getPhoneNumber(value), number));
    if (verifyExisting && matches.length !== 1) return needsReview(write, "The requested phone must match exactly one current NXT phone record.");
    const phone = matches[0];
    if (!phone) return needsReview(write, "The imported phone number was not found on the current NXT record.");
    const mismatch = verifyExisting && contactMismatch({ write, applyResult, contacts, contact: phone, kind: "phone" });
    if (mismatch) return needsReview(write, mismatch);
    if ((parseBoolean(write.makePrimary) || write.action === "set_primary") && !isPrimaryContact(phone)) {
      return needsReview(write, "The imported phone number exists in NXT but is not marked primary.");
    }
    return confirmed(write, "The imported phone number is present in NXT.");
  }

  if (write.type === "address") {
    const addresses = await reader.addresses();
    if (write.action === "mark_previous") {
      const previous = addresses.find((value) => getContactId(value, "address") === cleanText(write.targetId));
      return previous && normalizeText(previous.type) === "previous address" &&
        comparableDate(previous.valid_to || previous.validTo) === comparableDate(write.validTo)
        ? confirmed(write, "The selected NXT address has the requested Previous Address type and end date.")
        : needsReview(write, "The selected NXT address does not match the requested previous-address change.");
    }
    const matches = addresses.filter((value) =>
      (!cleanText(write.targetId) || getContactId(value, "address") === cleanText(write.targetId)) &&
      importAddressMatches(value, write));
    if (verifyExisting && matches.length !== 1) return needsReview(write, "The requested address must match exactly one complete current NXT address record.");
    const address = matches[0];
    if (!address) return needsReview(write, "The imported address was not found on the current NXT record.");
    const mismatch = verifyExisting && contactMismatch({ write, applyResult, contacts: addresses, contact: address, kind: "address" });
    if (mismatch) return needsReview(write, mismatch);
    if (parseBoolean(write.makePrimary) && !isPrimaryContact(address)) {
      return needsReview(write, "The imported address exists in NXT but is not marked primary.");
    }
    if (
      cleanText(write.validFrom) &&
      comparableDate(address?.valid_from || address?.validFrom || address?.date_from) !== comparableDate(write.validFrom)
    ) {
      return needsReview(write, "The imported address exists in NXT but has a different valid-from date.");
    }
    return confirmed(write, "The imported address is present in NXT.");
  }

  if (write.type === "constituent_code") {
    const codes = await reader.codes();
    const findCode = (label) => {
      const matches = codes.filter((code) => normalizeText(code.label) === normalizeText(label));
      return verifyExisting && matches.length !== 1 ? null : matches[0];
    };
    if (write.action === "end-date") {
      const source = findCode(write.sourceConstituency);
      return source && (!write.sourceCodeId || source.id === cleanText(write.sourceCodeId)) && comparableDate(source.endDate) === comparableDate(write.endDate)
        ? confirmed(write, `${write.sourceConstituency} has the requested NXT end date.`)
        : needsReview(write, `${write.sourceConstituency} does not show the requested NXT end date.`);
    }
    if (write.action === "replace") {
      const source = codes.find((code) => normalizeText(code.label) === normalizeText(write.sourceConstituency));
      const target = findCode(write.targetConstituency);
      const requestedStartDate = cleanText(write.startDate);
      const startDateMatches =
        !requestedStartDate || comparableDate(target?.startDate) === comparableDate(requestedStartDate);
      return target && !source && comparableDate(target.endDate) === comparableDate(write.endDate) && startDateMatches
        ? confirmed(write, "NXT reflects the requested constituent-code replacement.")
        : needsReview(write, "NXT does not yet reflect the requested constituent-code replacement.");
    }
    const target = findCode(write.targetConstituency);
    const datesMatch = target && (!cleanText(write.startDate) || comparableDate(target.startDate) === comparableDate(write.startDate)) &&
      (cleanText(write.endDate) ? comparableDate(target.endDate) === comparableDate(write.endDate) :
        !cleanText(target.endDate) || comparableDate(target.endDate) >= new Date().toISOString().slice(0, 10));
    return target && datesMatch
      ? confirmed(write, `${write.targetConstituency} is present with the requested NXT dates.`)
      : needsReview(write, `${write.targetConstituency} or its requested dates could not be confirmed in NXT.`);
  }

  if (write.type === "education_relationship") {
    const educations = await reader.educations();
    const targetEducationId = cleanText(write?.targetEducationId);
    const matches = educations.filter((education) => (!targetEducationId || getEducationId(education) === targetEducationId) && educationMatchesWrite(write, education));
    if (verifyExisting && matches.length !== 1) return needsReview(write, "The requested education must match exactly one current NXT education record.");
    const match = matches[0];
    if (!match) {
      return needsReview(write, "The imported education relationship was not found on the current NXT record.");
    }
    const mismatches = educationDetailsMismatch(write, match);
    return mismatches.length
      ? needsReview(
          write,
          `The education relationship is present, but NXT differs for: ${mismatches.join(", ")}.`,
        )
      : confirmed(write, "The imported education relationship is present in NXT.");
  }

  if (write.type === "organization_relationship") {
    if (verifyExisting) return needsReview(write, "Organization relationship completion needs a separate record comparison; this row was not automatically closed.");
    const organizationName = normalizeText(write.name);
    const match = (await reader.relationships()).find(
      (relationship) => normalizeText(getRelationshipName(relationship)) === organizationName,
    );
    return match
      ? confirmed(write, "The imported organization relationship is present in NXT.")
      : needsReview(write, "The imported organization relationship was not found on the current NXT record.");
  }

  return needsReview(write, "This import write type does not have an automated NXT verification yet.");
}

async function reconcileRow({ request, user, row, verifyExisting = false }) {
  const constituentId = getMatchedConstituentId(row);
  const writes = getWritePlan(row);
  if (!constituentId) {
    return writes.map((write) => needsReview(write, "The matched NXT constituent ID is missing from this import row."));
  }
  if (verifyExisting) {
    const identity = await verifyImportTargetIdentity({ request, user, row });
    if (!identity.ok) return writes.map((write, writeIndex) => ({
      ...needsReview(write, "The saved NXT identity could not be verified. The review stays open; no NXT data was changed."), writeIndex,
    }));
  }
  const reader = createSnapshotReader({ request, user, constituentId });
  const results = [];
  for (const [writeIndex, write] of writes.entries()) {
    try {
      results.push({ ...(await reconcileWrite({ write, applyResult: getAppliedResult(row, writeIndex), reader, verifyExisting })), writeIndex });
    } catch (error) {
      results.push({
        ...needsReview(write, error instanceof Error ? error.message : "NXT could not be read for verification."),
        writeIndex,
      });
    }
  }
  return results;
}

function buildReconciliationAudit({ row, user, results }) {
  const prior = row.blackbaud_result && typeof row.blackbaud_result === "object" ? row.blackbaud_result : {};
  const attempts = Array.isArray(prior.reconciliation?.attempts) ? prior.reconciliation.attempts : [];
  const verifiedAt = new Date().toISOString();
  const attempt = {
    verifiedAt,
    verifiedByUserId: user.id,
    verifiedByEmail: user.email,
    results,
  };
  const confirmedCount = results.filter((result) => result.status === "confirmed").length;
  const needsReviewCount = results.filter((result) => result.status === "needs_review").length;
  return {
    ...prior,
    reconciliation: {
      verifiedAt,
      verifiedByUserId: user.id,
      verifiedByEmail: user.email,
      results,
      confirmedCount,
      needsReviewCount,
      attempts: [...attempts, attempt],
    },
  };
}

export async function POST(request, { params }) {
  try {
    await ensureAppSchema();
    const authResult = await requireReviewer(request);
    if (authResult.error) return authResult.error;

    const runId = cleanText(params?.id);
    if (!/^\d+$/.test(runId)) return Response.json({ error: "Invalid import run ID" }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const selection = parseRowIds(body?.rowIds);
    if (selection.error) return Response.json({ error: selection.error }, { status: 400 });
    const completeIfMatches = body.completeIfMatches === true;
    if (completeIfMatches && selection.rowIds.length !== 1) {
      return Response.json({ error: "Verify and finish one saved record at a time." }, { status: 400 });
    }

    const runs = await sql`
      SELECT id FROM constituency_import_runs WHERE id = ${runId} LIMIT 1
    `;
    if (!runs[0]) return Response.json({ error: "Import run not found" }, { status: 404 });

    const rows = await sql`
      SELECT *
      FROM constituency_import_rows
      WHERE run_id = ${runId}
        AND id = ANY(${selection.rowIds})
        AND ((status = 'Applied' AND applied_at IS NOT NULL)
          OR (${completeIfMatches} AND status IN ('Needs Review', 'Failed')))
      ORDER BY row_number ASC
    `;
    if (rows.length !== selection.rowIds.length) {
      return Response.json(
        { error: "One or more selected rows are no longer applied. Refresh the saved run before verifying NXT." },
        { status: 409 },
      );
    }
    if (completeIfMatches && rows.some((row) => !canFinishImportWithoutSending(row))) {
      return Response.json({ error: "This row is not eligible for verification-only completion. Its saved target, write history, or plan changed. No NXT changes were sent." }, { status: 409 });
    }

    const reconciledRows = [];
    for (const row of rows) {
      const results = await reconcileRow({ request, user: authResult.user, row,
        verifyExisting: completeIfMatches || row.blackbaud_result?.completion?.method === "verified_existing_nxt" });
      const audit = buildReconciliationAudit({ row, user: authResult.user, results });
      const completed = completeIfMatches && results.length === getWritePlan(row).length &&
        results.length > 0 && results.every((result) => result.status === "confirmed");
      if (completed) audit.completion = {
        method: "verified_existing_nxt", completedAt: audit.reconciliation.verifiedAt,
        completedByUserId: authResult.user.id, completedByEmail: authResult.user.email,
        previousStatus: row.status, previousError: row.blackbaud_error || null,
        nxtWritesSent: 0,
      };
      const saved = await saveImportVerification({ row, audit, complete: completed });
      reconciledRows.push({
        id: String(row.id),
        completed,
        status: saved.status,
        reconciliation: audit.reconciliation,
      });
    }
    if (completeIfMatches) await refreshVerifiedImportSummary(runId);

    const confirmed = reconciledRows.reduce(
      (count, row) => count + Number(row.reconciliation.confirmedCount || 0),
      0,
    );
    const needsReview = reconciledRows.reduce(
      (count, row) => count + Number(row.reconciliation.needsReviewCount || 0),
      0,
    );
    return Response.json({
      rows: reconciledRows,
      reconciliationSummary: {
        completedRows: reconciledRows.filter((row) => row.completed).length,
        verifiedRows: reconciledRows.length,
        confirmed,
        needsReview,
        message: completeIfMatches
          ? reconciledRows.every((row) => row.completed)
            ? "Verified in NXT and marked complete. No changes were sent to NXT. You can continue to the next record."
            : `This record stays in review: ${needsReview} change${needsReview === 1 ? "" : "s"} could not be confirmed. No changes were sent to NXT. See the verification results below.`
          : `Verified ${reconciledRows.length} applied row${reconciledRows.length === 1 ? "" : "s"} against current NXT data: ${confirmed} confirmed; ${needsReview} need review.`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to verify the import run in NXT" },
      { status: error?.status === 409 ? 409 : 500 },
    );
  }
}
