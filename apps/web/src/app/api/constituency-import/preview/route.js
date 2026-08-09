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

function parseBoolean(value) {
  const normalized = normalizeText(value);
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  return null;
}

function normalizeAction(value, fallback = "replace") {
  const normalized = normalizeText(value || fallback);
  return ACTION_ALIASES.get(normalized) || ACTION_ALIASES.get(normalizeText(fallback)) || "replace";
}

function normalizeImportIntent(value) {
  const normalized = normalizeText(value);
  if (normalized === "new" || normalized === "new records") return "new";
  if (normalized === "both" || normalized === "mixed" || normalized === "new and updates") {
    return "mixed";
  }
  return "updates";
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

function formatBirthDate(value) {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value);
  const year = Number(value.y ?? value.year);
  const month = Number(value.m ?? value.month);
  const day = Number(value.d ?? value.day);
  if (!year || !month || !day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// NXT can return partial dates such as { y: 2026 } for constituency history.
// Keep them as scalar display values in preview payloads so React never receives
// a structured date object as a child.
function formatPreviewDate(value) {
  if (!value) return "";
  if (typeof value !== "object") return cleanText(value);

  const nestedValue =
    value.date ||
    value.value ||
    value.date_value ||
    value.formatted_value ||
    value.formatted ||
    value.iso ||
    value.text;
  if (nestedValue && nestedValue !== value) return formatPreviewDate(nestedValue);

  const year = Number(value.y ?? value.year);
  const month = Number(value.m ?? value.month);
  const day = Number(value.d ?? value.day);
  if (year && month && day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (year && month) return `${year}-${String(month).padStart(2, "0")}`;
  return year ? String(year) : "";
}

function formatEducationDate(value) {
  const source = typeof value === "object" ? formatBirthDate(value) : cleanText(value);
  const parsed = parseBirthDate(source);
  return parsed ? formatBirthDate(parsed) : source;
}

function joinNameParts(parts) {
  return parts.map(cleanText).filter(Boolean).join(" ");
}

function buildNameFormatValue(kind, pattern, values) {
  const firstName = cleanText(values?.firstName);
  const preferredName = cleanText(values?.preferredName) || firstName;
  const lastName = cleanText(values?.lastName);
  const title = cleanText(values?.title);
  const suffix = cleanText(values?.suffix);

  if (kind === "salutation") {
    if (pattern === "title-last") {
      return joinNameParts([title, lastName]);
    }
    const salutationName = pattern === "first" ? firstName : preferredName;
    if (!salutationName) return "";
    if (pattern === "preferred") return salutationName;
    return `Dear ${salutationName}`;
  }

  if (pattern === "preferred-last") {
    return joinNameParts([preferredName, lastName]);
  }
  if (pattern === "first-last") {
    return joinNameParts([firstName, lastName]);
  }
  if (pattern === "title-first-last-suffix") {
    return joinNameParts([title, firstName, lastName, suffix]);
  }
  return joinNameParts([title, preferredName, lastName, suffix]);
}

function getRowInput(row, mappings, defaults = {}) {
  const defaultAction = cleanText(defaults.defaultAction) || "replace";
  const defaultEducationAction =
    cleanText(defaults.educationRelationshipAction) === "review-update"
      ? "review-update"
      : "add";
  const firstName = getMappedValue(row, mappings, "firstName");
  const lastName = getMappedValue(row, mappings, "lastName");
  const preferredName = getMappedValue(row, mappings, "preferredName");
  const title = getMappedValue(row, mappings, "title");
  const gender = getMappedValue(row, mappings, "gender");
  const ethnicity = getMappedValue(row, mappings, "ethnicity");
  const birthDate = getMappedValue(row, mappings, "birthDate");
  const suffix = getMappedValue(row, mappings, "suffix");
  const legacyConstituentName = getMappedValue(row, mappings, "constituentName");
  const derivedName =
    legacyConstituentName ||
    [preferredName || firstName, lastName].filter(Boolean).join(" ").trim() ||
    [firstName, lastName].filter(Boolean).join(" ").trim();

  const input = {
    firstName,
    lastName,
    preferredName,
    title,
    gender,
    ethnicity,
    birthDate,
    suffix,
    constituentName: derivedName,
    blackbaudConstituentId: getMappedValue(row, mappings, "blackbaudConstituentId"),
    lookupId: getMappedValue(row, mappings, "lookupId"),
    email: getMappedValue(row, mappings, "email"),
    addressLine1: getMappedValue(row, mappings, "addressLine1"),
    sourceConstituency: getMappedValue(row, mappings, "sourceConstituency"),
    targetConstituency: getMappedValue(row, mappings, "targetConstituency"),
    action: normalizeAction(getMappedValue(row, mappings, "action"), defaultAction),
    startDate: getMappedValue(row, mappings, "startDate") || cleanText(defaults.startDate),
    endDate: getMappedValue(row, mappings, "endDate") || cleanText(defaults.endDate),
  };

  const educationRelationship = {
    action: defaultEducationAction,
    duplicatePolicy: "skip_if_matching",
    institution: getMappedValue(row, mappings, "educationInstitution"),
    degree: getMappedValue(row, mappings, "educationDegree"),
    major: getMappedValue(row, mappings, "educationMajor"),
    minor: getMappedValue(row, mappings, "educationMinor"),
    schoolType: getMappedValue(row, mappings, "educationSchoolType"),
    campus: getMappedValue(row, mappings, "educationCampus"),
    fraternitySorority: getMappedValue(row, mappings, "educationFraternitySorority"),
    gpa: getMappedValue(row, mappings, "educationGpa"),
    classYear: getMappedValue(row, mappings, "educationClassYear"),
    status: getMappedValue(row, mappings, "educationStatus"),
    dateGraduated: getMappedValue(row, mappings, "educationDateGraduated"),
    dateEntered: getMappedValue(row, mappings, "educationDateEntered"),
    dateLeft: getMappedValue(row, mappings, "educationDateLeft"),
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

  if (
    hasAnyValue(educationRelationship, [
      "institution",
      "degree",
      "major",
      "minor",
      "schoolType",
      "campus",
      "fraternitySorority",
      "gpa",
      "classYear",
      "status",
      "dateGraduated",
      "dateEntered",
      "dateLeft",
    ])
  ) {
    input.educationRelationship = educationRelationship;
  }
  if (hasAnyValue(organizationRelationship, ["name", "relationshipType", "title"])) {
    input.organizationRelationship = organizationRelationship;
  }
  if (
    defaults.updateNameFields === true &&
    [firstName, lastName, preferredName].some(Boolean)
  ) {
    input.nameUpdate = {
      firstName,
      lastName,
      preferredName,
    };
  }
  if (
    defaults.updateIndividualProfileFields === true &&
    [title, gender, ethnicity, birthDate, suffix].some(Boolean)
  ) {
    input.individualProfileUpdate = { title, gender, ethnicity, birthDate, suffix };
  }

  const csvAddressee = getMappedValue(row, mappings, "addressee");
  const csvSalutation = getMappedValue(row, mappings, "salutation");
  const canBuildNameFormats = defaults.buildNameFormats === true;
  const addressee =
    csvAddressee ||
    (canBuildNameFormats
      ? buildNameFormatValue("addressee", defaults.addresseeFormat, input)
      : "");
  const salutation =
    csvSalutation ||
    (canBuildNameFormats
      ? buildNameFormatValue("salutation", defaults.salutationFormat, input)
      : "");
  if (defaults.updateNameFormatFields === true && (addressee || salutation)) {
    input.nameFormatUpdate = {
      addressee,
      salutation,
      source: csvAddressee || csvSalutation ? "CSV" : "file default",
    };
  }
  if (defaults.updateEmailFields === true) {
    const emailUpdates = [
      {
        address: getMappedValue(row, mappings, "email"),
        type: getMappedValue(row, mappings, "emailType"),
        makePrimary: parseBoolean(getMappedValue(row, mappings, "emailMakePrimary")),
      },
      {
        address: getMappedValue(row, mappings, "email2"),
        type: getMappedValue(row, mappings, "email2Type"),
        makePrimary: parseBoolean(getMappedValue(row, mappings, "email2MakePrimary")),
      },
    ].filter((email) => email.address);

    if (emailUpdates.length) {
      input.emailUpdates = emailUpdates;
    }
  }

  if (defaults.updatePhoneFields === true) {
    const phoneUpdates = [
      {
        number: getMappedValue(row, mappings, "phoneNumber"),
        type: getMappedValue(row, mappings, "phoneType"),
        makePrimary: parseBoolean(getMappedValue(row, mappings, "phoneMakePrimary")),
      },
      {
        number: getMappedValue(row, mappings, "phone2Number"),
        type: getMappedValue(row, mappings, "phone2Type"),
        makePrimary: parseBoolean(getMappedValue(row, mappings, "phone2MakePrimary")),
      },
    ].filter((phone) => phone.number);

    if (phoneUpdates.length) {
      input.phoneUpdates = phoneUpdates;
    }
  }

  if (defaults.updateAddressFields === true) {
    const addressLine1 = getMappedValue(row, mappings, "addressLine1");
    if (addressLine1) {
      input.addressUpdates = [
        {
          type: getMappedValue(row, mappings, "addressType"),
          validFrom: getMappedValue(row, mappings, "addressValidFrom"),
          addressLine1,
          addressLine2: getMappedValue(row, mappings, "addressLine2"),
          city: getMappedValue(row, mappings, "city"),
          state: getMappedValue(row, mappings, "state"),
          postalCode: getMappedValue(row, mappings, "postalCode"),
          country: getMappedValue(row, mappings, "country"),
          makePrimary: parseBoolean(getMappedValue(row, mappings, "addressMakePrimary")),
        },
      ];
    }
  }

  return input;
}

function getMatchedNameValues(match) {
  const raw = match?.raw && typeof match.raw === "object" ? match.raw : {};
  return {
    firstName: cleanText(raw.first || raw.first_name),
    lastName: cleanText(raw.last || raw.last_name),
    preferredName: cleanText(raw.preferred_name || raw.preferredName),
  };
}

function getMatchedIndividualValues(match) {
  const raw = match?.raw && typeof match.raw === "object" ? match.raw : {};
  return {
    title: cleanText(raw.title),
    gender: cleanText(raw.gender),
    ethnicity: cleanText(raw.ethnicity?.description || raw.ethnicity?.name || raw.ethnicity?.value || raw.ethnicity),
    birthDate: formatBirthDate(raw.birthdate || raw.birth_date),
    suffix: cleanText(raw.suffix),
  };
}

function getFieldDecision(decisions, writeType, field) {
  const value = decisions?.[writeType]?.[field];
  return value && typeof value === "object" ? value : {};
}

function shouldSkipField(decisions, writeType, field) {
  return getFieldDecision(decisions, writeType, field).mode === "skip";
}

function buildIndividualProfileWrite(input, match, fieldDecisions = {}) {
  if (!input.individualProfileUpdate || !match) return null;

  const current = getMatchedIndividualValues(match);
  const requestedBirthDate = cleanText(input.individualProfileUpdate.birthDate);
  const parsedBirthDate = requestedBirthDate ? parseBirthDate(requestedBirthDate) : null;
  const changes = {
    title:
      !shouldSkipField(fieldDecisions, "constituent_profile", "title") &&
      cleanText(input.individualProfileUpdate.title) &&
      normalizeText(input.individualProfileUpdate.title) !== normalizeText(current.title)
        ? cleanText(input.individualProfileUpdate.title)
        : "",
    gender:
      !shouldSkipField(fieldDecisions, "constituent_profile", "gender") &&
      cleanText(input.individualProfileUpdate.gender) &&
      normalizeText(input.individualProfileUpdate.gender) !== normalizeText(current.gender)
        ? cleanText(input.individualProfileUpdate.gender)
        : "",
    ethnicity:
      !shouldSkipField(fieldDecisions, "constituent_profile", "ethnicity") &&
      cleanText(input.individualProfileUpdate.ethnicity) &&
      normalizeText(input.individualProfileUpdate.ethnicity) !== normalizeText(current.ethnicity)
        ? cleanText(input.individualProfileUpdate.ethnicity)
        : "",
    suffix:
      !shouldSkipField(fieldDecisions, "constituent_profile", "suffix") &&
      cleanText(input.individualProfileUpdate.suffix) &&
      normalizeText(input.individualProfileUpdate.suffix) !== normalizeText(current.suffix)
        ? cleanText(input.individualProfileUpdate.suffix)
        : "",
    birthDate:
      !shouldSkipField(fieldDecisions, "constituent_profile", "birthDate") &&
      requestedBirthDate &&
      parsedBirthDate &&
      formatBirthDate(parsedBirthDate) !== formatBirthDate(current.birthDate)
        ? formatBirthDate(parsedBirthDate)
        : "",
  };

  if (
    !Object.values(changes).some(Boolean) &&
    !(
      requestedBirthDate &&
      !parsedBirthDate &&
      !shouldSkipField(fieldDecisions, "constituent_profile", "birthDate")
    )
  ) {
    return null;
  }

  const write = {
    type: "constituent_profile",
    action: "update",
    recordType: cleanText(match?.raw?.type),
    ...changes,
    current,
    blankValuePolicy: "leave_unchanged",
  };
  if (requestedBirthDate && !parsedBirthDate) {
    write.requiresReview = true;
    write.validationMessage = "Birth Date must use a valid MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD value before it can be imported.";
  }
  return write;
}

function serializeNameFormat(value) {
  if (!value || typeof value !== "object") return { id: "", value: "" };
  return {
    id: cleanText(value.id || value.name_format_id),
    value: cleanText(value.formatted_name || value.name || value.value),
  };
}

function buildNameFormatWrites(input, currentNameFormats, fieldDecisions = {}) {
  if (!input.nameFormatUpdate) return [];

  return ["addressee", "salutation"]
    .map((kind) => {
      if (shouldSkipField(fieldDecisions, "constituent_name_format", kind)) return null;
      const value = cleanText(input.nameFormatUpdate[kind]);
      if (!value) return null;
      const current = currentNameFormats?.[kind] || { id: "", value: "" };
      if (normalizeText(value) === normalizeText(current.value)) return null;
      const write = {
        type: "constituent_name_format",
        action: "update_primary",
        kind,
        value,
        targetId: current.id || "",
        currentValue: current.value || "",
        source: input.nameFormatUpdate.source || "CSV",
        blankValuePolicy: "leave_unchanged",
      };
      if (!write.targetId) {
        write.requiresReview = true;
        write.validationMessage = `Could not identify the current primary ${kind} format in NXT.`;
      }
      return write;
    })
    .filter(Boolean);
}

function buildNameUpdateWrite(input, match, fieldDecisions = {}) {
  if (!input.nameUpdate || !match) return null;

  const current = getMatchedNameValues(match);
  const changes = {
    firstName:
      !shouldSkipField(fieldDecisions, "constituent_name", "firstName") &&
      cleanText(input.nameUpdate.firstName) &&
      normalizeText(input.nameUpdate.firstName) !== normalizeText(current.firstName)
        ? cleanText(input.nameUpdate.firstName)
        : "",
    lastName:
      !shouldSkipField(fieldDecisions, "constituent_name", "lastName") &&
      cleanText(input.nameUpdate.lastName) &&
      normalizeText(input.nameUpdate.lastName) !== normalizeText(current.lastName)
        ? cleanText(input.nameUpdate.lastName)
        : "",
    preferredName:
      !shouldSkipField(fieldDecisions, "constituent_name", "preferredName") &&
      cleanText(input.nameUpdate.preferredName) &&
      normalizeText(input.nameUpdate.preferredName) !== normalizeText(current.preferredName)
        ? cleanText(input.nameUpdate.preferredName)
        : "",
  };

  if (!Object.values(changes).some(Boolean)) return null;

  return {
    type: "constituent_name",
    action: "update",
    recordType: cleanText(match?.raw?.type),
    firstName: changes.firstName,
    lastName: changes.lastName,
    preferredName: changes.preferredName,
    current,
    blankValuePolicy: "leave_unchanged",
  };
}

function getContactId(value, kind) {
  if (!value || typeof value !== "object") return "";
  const idKeys =
    kind === "email"
      ? ["id", "email_address_id"]
      : kind === "phone"
        ? ["id", "phone_id"]
        : ["id", "address_id"];
  return cleanText(idKeys.map((key) => value[key]).find(Boolean));
}

function getContactType(value) {
  return cleanText(value?.type || value?.type_name || value?.type_description);
}

function isPrimaryContact(value) {
  return parseBoolean(value?.primary ?? value?.is_primary ?? value?.preferred) === true;
}

function getEmailAddress(value) {
  return cleanText(value?.address || value?.email || value?.email_address);
}

function getPhoneNumber(value) {
  return cleanText(value?.number || value?.phone || value?.phone_number);
}

function getAddressLines(value) {
  const lines = value?.address_lines || value?.addressLines || value?.lines;
  if (Array.isArray(lines)) return lines.map(cleanText).filter(Boolean);
  if (typeof lines === "string") return lines.split("\n").map(cleanText).filter(Boolean);
  return [cleanText(value?.address_line1 || value?.line1), cleanText(value?.address_line2 || value?.line2)].filter(Boolean);
}

function serializeContactSnapshot(payload = {}) {
  const mapEmails = (payload.emails || []).map((email) => ({
    id: getContactId(email, "email"),
    address: getEmailAddress(email),
    type: getContactType(email),
    primary: isPrimaryContact(email),
  })).filter((email) => email.id || email.address);
  const mapPhones = (payload.phones || []).map((phone) => ({
    id: getContactId(phone, "phone"),
    number: getPhoneNumber(phone),
    type: getContactType(phone),
    primary: isPrimaryContact(phone),
  })).filter((phone) => phone.id || phone.number);
  const mapAddresses = (payload.addresses || []).map((address) => {
    const lines = getAddressLines(address);
    const validFrom = formatEducationDate(address?.valid_from || address?.validFrom || address?.date_from);
    const validTo = formatEducationDate(address?.valid_to || address?.validTo || address?.date_to);
    return {
      id: getContactId(address, "address"),
      type: getContactType(address),
      addressLine1: lines[0] || "",
      addressLine2: lines.slice(1).join("\n"),
      city: cleanText(address?.city),
      state: cleanText(address?.state),
      postalCode: cleanText(address?.postal_code || address?.postalCode || address?.zip),
      country: cleanText(address?.country),
      ...(validFrom ? { validFrom } : {}),
      ...(validTo ? { validTo } : {}),
      primary: isPrimaryContact(address),
    };
  }).filter((address) => address.id || address.addressLine1);

  return { emails: mapEmails, phones: mapPhones, addresses: mapAddresses };
}

function getDecision(decisions, kind, index) {
  const value = decisions?.[kind]?.[String(index)] || decisions?.[kind]?.[index];
  return value && typeof value === "object" ? value : {};
}

function getSectionDecision(decisions, kind) {
  const value = decisions?.[kind]?.__section;
  return value && typeof value === "object" ? value : {};
}

function hasContactSectionAction(decisions) {
  return Boolean(
    cleanText(getSectionDecision(decisions, "email").existingPrimaryTargetId) ||
      cleanText(getSectionDecision(decisions, "phone").existingPrimaryTargetId) ||
      cleanText(getSectionDecision(decisions, "address").previousAddressTargetId),
  );
}

function getExistingPrimary(contacts) {
  return contacts.find((contact) => contact.primary) || null;
}

function buildContactWrites({
  input,
  kind,
  values,
  contacts = [],
  decisions = {},
}) {
  if (!Array.isArray(values)) return [];

  const config =
    kind === "email"
      ? { type: "email_address", valueKey: "address", typeKey: "emailType" }
      : kind === "phone"
        ? { type: "phone", valueKey: "number", typeKey: "phoneType" }
        : { type: "address", valueKey: "addressLine1", typeKey: "addressType" };
  const existingPrimary = getExistingPrimary(contacts);
  const defaultPrimaryIndex = values.findIndex((value) => value.makePrimary === true);

  return values.map((value, index) => {
    const decision = getDecision(decisions, kind, index);
    if (decision.mode === "skip") return null;
    const action = decision.mode === "replace" ? "replace" : "add";
    const targetId = cleanText(decision.targetId);
    const makePrimary =
      action === "replace"
        ? false
        : decision.makePrimary === undefined
          ? index === defaultPrimaryIndex
          : decision.makePrimary === true;
    const write = {
      type: config.type,
      action,
      [config.valueKey]: value[config.valueKey] || "",
      [config.typeKey]: value.type || "",
      makePrimary,
      existingPrimaryId: existingPrimary?.id || "",
      demotedPrimaryType: cleanText(decision.demotedPrimaryType),
      blankValuePolicy: "leave_unchanged",
    };

    if (kind === "address") {
      const requestedValidFrom = cleanText(value.validFrom);
      const parsedValidFrom = requestedValidFrom ? parseBirthDate(requestedValidFrom) : null;
      write.addressLine2 = value.addressLine2 || "";
      write.city = value.city || "";
      write.state = value.state || "";
      write.postalCode = value.postalCode || "";
      write.country = value.country || "";
      write.validFrom = parsedValidFrom ? formatBirthDate(parsedValidFrom) : requestedValidFrom;
      if (requestedValidFrom && !parsedValidFrom) {
        write.requiresReview = true;
        write.validationMessage = "Address Valid From must use a valid MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD value before it can be imported.";
      }
    }

    if (action === "replace") {
      write.targetId = targetId;
      write.preserveExistingSettings = true;
      if (!targetId) {
        write.requiresReview = true;
        write.validationMessage = `Choose the current NXT ${kind} value to replace.`;
      }
    }

    if (makePrimary && existingPrimary?.id && existingPrimary.id !== targetId) {
      write.demoteExistingPrimary = true;
    }

    return write;
  }).filter(Boolean);
}

function buildExistingPrimaryWrite({ kind, contacts = [], decisions = {}, contactWrites = [] }) {
  if (!["email", "phone"].includes(kind)) return null;

  // A CSV contact selected as primary takes precedence over a separate existing-contact choice.
  if (contactWrites.some((write) => write.action === "add" && write.makePrimary === true)) {
    return null;
  }

  const decision = getSectionDecision(decisions, kind);
  const targetId = cleanText(decision.existingPrimaryTargetId);
  if (!targetId) return null;

  const currentPrimary = getExistingPrimary(contacts);
  const target = contacts.find((contact) => contact.id === targetId);
  const type = kind === "email" ? "email_address" : "phone";
  if (!target) {
    return {
      type,
      action: "set_primary",
      targetId,
      requiresReview: true,
      validationMessage: `The selected current NXT ${kind} value is no longer available. Refresh the preview before applying.`,
    };
  }
  if (target.primary) return null;

  return {
    type,
    action: "set_primary",
    targetId,
    existingPrimaryId: currentPrimary?.id || "",
    demoteExistingPrimary: Boolean(currentPrimary?.id && currentPrimary.id !== targetId),
    demotedPrimaryType: cleanText(decision.demotedPrimaryType),
    blankValuePolicy: "leave_unchanged",
  };
}

function buildPreviousAddressWrite({ contacts = [], decisions = {}, addressWrites = [] }) {
  const decision = getSectionDecision(decisions, "address");
  const targetId = cleanText(decision.previousAddressTargetId);
  if (!targetId) return null;

  // An old address can only be closed when this same preview adds a new address.
  if (!addressWrites.some((write) => write.action === "add" && !write.requiresReview)) {
    return null;
  }

  const target = contacts.find((contact) => contact.id === targetId);
  const requestedValidTo = cleanText(decision.previousAddressEndDate);
  const parsedValidTo = requestedValidTo ? parseBirthDate(requestedValidTo) : null;
  if (!target) {
    return {
      type: "address",
      action: "mark_previous",
      targetId,
      requiresReview: true,
      validationMessage: "The selected current NXT address is no longer available. Refresh the preview before applying.",
    };
  }
  if (!requestedValidTo || !parsedValidTo) {
    return {
      type: "address",
      action: "mark_previous",
      targetId,
      requiresReview: true,
      validationMessage: "Enter a valid end date for the current address before marking it Previous Address.",
    };
  }

  return {
    type: "address",
    action: "mark_previous",
    targetId,
    addressType: "Previous Address",
    validTo: formatBirthDate(parsedValidTo),
    requiresSuccessfulAddressAdd: true,
    blankValuePolicy: "leave_unchanged",
  };
}

function buildContactUpdateWrites(input, currentContacts, contactDecisions) {
  const emailWrites = buildContactWrites({
    input,
    kind: "email",
    values: input.emailUpdates,
    contacts: currentContacts?.emails,
    decisions: contactDecisions,
  });
  const phoneWrites = buildContactWrites({
    input,
    kind: "phone",
    values: input.phoneUpdates,
    contacts: currentContacts?.phones,
    decisions: contactDecisions,
  });
  const addressWrites = buildContactWrites({
    input,
    kind: "address",
    values: input.addressUpdates,
    contacts: currentContacts?.addresses,
    decisions: contactDecisions,
  });
  const emailPrimaryWrite = buildExistingPrimaryWrite({
    kind: "email",
    contacts: currentContacts?.emails,
    decisions: contactDecisions,
    contactWrites: emailWrites,
  });
  const phonePrimaryWrite = buildExistingPrimaryWrite({
    kind: "phone",
    contacts: currentContacts?.phones,
    decisions: contactDecisions,
    contactWrites: phoneWrites,
  });
  const previousAddressWrite = buildPreviousAddressWrite({
    contacts: currentContacts?.addresses,
    decisions: contactDecisions,
    addressWrites,
  });

  return [
    ...emailWrites,
    emailPrimaryWrite,
    ...phoneWrites,
    phonePrimaryWrite,
    ...addressWrites,
    previousAddressWrite,
  ].filter(Boolean);
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

function serializeEducation(value) {
  return {
    id: getEducationId(value),
    school: getEducationSchool(value),
    degrees: getEducationValues(value, "degrees", ["degree", "degree_name"]),
    majors: getEducationValues(value, "majors", ["major", "major_name"]),
    minors: getEducationValues(value, "minors", ["minor", "minor_name"]),
    schoolType: getEducationValueText(value?.type ?? value?.school_type),
    campus: getEducationValueText(value?.campus),
    fraternitySorority: getEducationValueText(
      value?.social_organization ?? value?.fraternity_sorority,
    ),
    gpa: cleanText(value?.gpa),
    classYear: getEducationClassYear(value),
    status: getEducationValueText(value?.status),
    dateGraduated: formatEducationDate(value?.date_graduated ?? value?.graduation_date),
    dateEntered: formatEducationDate(value?.date_entered),
    dateLeft: formatEducationDate(value?.date_left),
    primary: parseBoolean(value?.primary ?? value?.is_primary) === true,
  };
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

function educationMatchesAllSuppliedWriteFields(write, education) {
  if (!educationMatchesWrite(write, education)) return false;

  const matchesValue = (expected, actual) => {
    const normalizedExpected = normalizeText(expected);
    return !normalizedExpected || normalizedExpected === normalizeText(actual);
  };
  const matchesListValue = (expected, values) => {
    const normalizedExpected = normalizeText(expected);
    return (
      !normalizedExpected ||
      values.some((value) => normalizeText(value) === normalizedExpected)
    );
  };
  const matchesDate = (expected, actual) => {
    const normalizedExpected = formatEducationDate(expected);
    return !normalizedExpected || normalizedExpected === formatEducationDate(actual);
  };

  return (
    matchesListValue(
      write?.minor,
      getEducationValues(education, "minors", ["minor", "minor_name"]),
    ) &&
    matchesValue(
      write?.schoolType,
      getEducationValueText(education?.type ?? education?.school_type),
    ) &&
    matchesValue(write?.campus, getEducationValueText(education?.campus)) &&
    matchesValue(
      write?.fraternitySorority,
      getEducationValueText(
        education?.social_organization ?? education?.fraternity_sorority,
      ),
    ) &&
    matchesValue(write?.gpa, cleanText(education?.gpa)) &&
    matchesValue(write?.status, getEducationValueText(education?.status)) &&
    matchesDate(
      write?.dateGraduated,
      education?.date_graduated ?? education?.graduation_date,
    ) &&
    matchesDate(write?.dateEntered, education?.date_entered) &&
    matchesDate(write?.dateLeft, education?.date_left) &&
    (parseBoolean(write?.makePrimary) === null ||
      parseBoolean(write?.makePrimary) ===
        parseBoolean(education?.primary ?? education?.is_primary))
  );
}

function findEducationUpdateCandidate(write, currentEducations) {
  const sameSchool = (Array.isArray(currentEducations) ? currentEducations : []).filter(
    (education) =>
      normalizeText(write?.institution) === normalizeText(getEducationSchool(education)),
  );
  if (sameSchool.length === 0) return { status: "missing" };

  let candidates = sameSchool;
  const narrowBy = (expected, getValues) => {
    const normalizedExpected = normalizeText(expected);
    if (!normalizedExpected) return;
    candidates = candidates.filter((education) =>
      getValues(education).some((value) => normalizeText(value) === normalizedExpected),
    );
  };

  narrowBy(write?.degree, (education) =>
    getEducationValues(education, "degrees", ["degree", "degree_name"]),
  );
  narrowBy(write?.major, (education) =>
    getEducationValues(education, "majors", ["major", "major_name"]),
  );
  narrowBy(write?.classYear, (education) => [getEducationClassYear(education)]);

  if (candidates.length === 0) return { status: "missing" };

  const identified = candidates.filter((education) => getEducationId(education));
  if (identified.length === 1) return { status: "matched", education: identified[0] };
  return { status: "ambiguous", count: candidates.length || sameSchool.length };
}

function buildEducationRelationshipWrite(input, match, currentEducations) {
  if (!input.educationRelationship) return null;

  const write = {
    type: "education_relationship",
    action: cleanText(input.educationRelationship.action) || "add",
    duplicatePolicy:
      cleanText(input.educationRelationship.action) === "review-update"
        ? "review_and_update_unique"
        : "skip_if_matching",
    recordType: cleanText(match?.raw?.type),
    institution: cleanText(input.educationRelationship.institution),
    degree: cleanText(input.educationRelationship.degree),
    major: cleanText(input.educationRelationship.major),
    minor: cleanText(input.educationRelationship.minor),
    schoolType: cleanText(input.educationRelationship.schoolType),
    campus: cleanText(input.educationRelationship.campus),
    fraternitySorority: cleanText(input.educationRelationship.fraternitySorority),
    gpa: cleanText(input.educationRelationship.gpa),
    classYear: cleanText(input.educationRelationship.classYear),
    status: cleanText(input.educationRelationship.status),
    dateGraduated: cleanText(input.educationRelationship.dateGraduated),
    dateEntered: cleanText(input.educationRelationship.dateEntered),
    dateLeft: cleanText(input.educationRelationship.dateLeft),
    makePrimary: input.educationRelationship.makePrimary || "",
  };

  if (!write.institution) {
    write.requiresReview = true;
    write.validationMessage = "An Education Institution is required before an education relationship can be added.";
    return write;
  }
  if (!normalizeText(write.recordType).includes("individual")) {
    write.requiresReview = true;
    write.validationMessage = "Education imports require a confirmed matched individual NXT constituent.";
    return write;
  }
  if (write.classYear && !/^\d{4}$/.test(write.classYear)) {
    write.requiresReview = true;
    write.validationMessage = "Education Class Year must be a four-digit year before it can be imported.";
    return write;
  }
  if (write.gpa && (!Number.isFinite(Number(write.gpa)) || Number(write.gpa) < 0)) {
    write.requiresReview = true;
    write.validationMessage = "Education GPA must be a non-negative number before it can be imported.";
    return write;
  }
  const invalidDate = [
    ["Education Date Graduated", write.dateGraduated],
    ["Education Date Entered", write.dateEntered],
    ["Education Date Left", write.dateLeft],
  ].find(([, value]) => cleanText(value) && !parseBirthDate(value));
  if (invalidDate) {
    write.requiresReview = true;
    write.validationMessage = `${invalidDate[0]} must use MM/DD/YY, MM/DD/YYYY, or YYYY-MM-DD before it can be imported.`;
    return write;
  }

  if (write.action === "review-update") {
    const existing = (Array.isArray(currentEducations) ? currentEducations : []).find(
      (education) => educationMatchesAllSuppliedWriteFields(write, education),
    );
    if (existing) {
      write.action = "skip_existing";
      write.existingEducation = serializeEducation(existing);
      return write;
    }

    const target = findEducationUpdateCandidate(write, currentEducations);
    if (target.status === "matched") {
      write.action = "update";
      write.targetEducationId = getEducationId(target.education);
      write.existingEducation = serializeEducation(target.education);
    } else {
      write.requiresReview = true;
      write.action = "review_existing";
      write.validationMessage =
        target.status === "ambiguous"
          ? `Found ${target.count} possible NXT education rows for ${write.institution}. Add degree, major, or class year to choose one before importing.`
          : `No current NXT education row matches the supplied school, degree, major, and class year. Choose Add New Education Relationship to create it.`;
    }
  } else {
    const existing = (Array.isArray(currentEducations) ? currentEducations : []).find(
      (education) => educationMatchesWrite(write, education),
    );
    if (existing) {
      write.action = "skip_existing";
      write.existingEducation = serializeEducation(existing);
    }
  }

  return write;
}

function buildOrganizationRelationshipWrite(input, match) {
  if (!input.organizationRelationship) return null;

  const write = {
    type: "organization_relationship",
    action: "add",
    // Never replace, end-date, or otherwise alter an existing organization link.
    duplicatePolicy: "skip_if_existing_organization",
    recordType: cleanText(match?.raw?.type),
    name: cleanText(input.organizationRelationship.name),
    relationshipType: cleanText(input.organizationRelationship.relationshipType),
    title: cleanText(input.organizationRelationship.title),
    startDate: cleanText(input.organizationRelationship.startDate),
    endDate: cleanText(input.organizationRelationship.endDate),
    makePrimary: input.organizationRelationship.makePrimary || "",
  };

  if (!write.name) {
    write.requiresReview = true;
    write.validationMessage =
      "An Organization Name is required before an organization relationship can be added.";
    return write;
  }
  if (!normalizeText(write.recordType).includes("individual")) {
    write.requiresReview = true;
    write.validationMessage =
      "Organization relationship imports require a confirmed matched individual NXT constituent.";
  }

  return write;
}

function buildWritePlan(
  input,
  changePreview,
  match = null,
  currentContacts = null,
  contactDecisions = {},
  fieldDecisions = {},
  currentNameFormats = null,
  currentEducations = null,
) {
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

  const educationRelationshipWrite = buildEducationRelationshipWrite(
    input,
    match,
    currentEducations,
  );
  if (educationRelationshipWrite) {
    writes.push(educationRelationshipWrite);
  }

  const organizationRelationshipWrite = buildOrganizationRelationshipWrite(input, match);
  if (organizationRelationshipWrite) {
    writes.push(organizationRelationshipWrite);
  }

  const nameUpdateWrite = buildNameUpdateWrite(input, match, fieldDecisions);
  if (nameUpdateWrite) {
    writes.push(nameUpdateWrite);
  }

  const individualProfileWrite = buildIndividualProfileWrite(input, match, fieldDecisions);
  if (individualProfileWrite) {
    writes.push(individualProfileWrite);
  }

  writes.push(...buildNameFormatWrites(input, currentNameFormats, fieldDecisions));

  writes.push(...buildContactUpdateWrites(input, currentContacts, contactDecisions));

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
  const candidateAddress = normalizeText(candidate?.address);
  const inputAddress = normalizeText(input.addressLine1);

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
  if (
    inputAddress &&
    candidateAddress &&
    (candidateAddress.includes(inputAddress) || inputAddress.includes(candidateAddress))
  ) {
    score += 25;
    reasons.push("Address line 1 match");
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
    const hasExactLookupId =
      match && String(match.lookupId || match.blackbaudLookupId || "").trim() === input.lookupId;
    return hasExactLookupId
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

  const query = input.constituentName || input.email || input.addressLine1;
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
      method: input.constituentName ? "name search" : input.email ? "email search" : "address search",
      confidence: 0,
      match: null,
      notes: ["No likely NXT match was found."],
    };
  }

  return {
    status: "needs_review",
    method: input.constituentName ? "name search" : input.email ? "email search" : "address search",
    confidence: Math.min(best.score, 85),
    match: best.candidate,
    notes: [
      ...best.reasons,
      "Name, email, and address matches are previewed for human review before import.",
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

function getCollection(payload) {
  return Array.isArray(payload?.value) ? payload.value : Array.isArray(payload) ? payload : [];
}

async function fetchCurrentContacts({ userId, authUserId, origin, constituentId, input }) {
  const requestedKinds = new Set([
    Array.isArray(input.emailUpdates) && input.emailUpdates.length ? "emails" : "",
    Array.isArray(input.phoneUpdates) && input.phoneUpdates.length ? "phones" : "",
    Array.isArray(input.addressUpdates) && input.addressUpdates.length ? "addresses" : "",
  ].filter(Boolean));
  const basePath = "/constituent/v1/constituents/" + encodeURIComponent(String(constituentId));
  // Load all contact categories so reviewers can compare the full NXT contact picture.
  // Only a failed category selected for import should block the row from being applied.
  const requests = [
    ["emails", `${basePath}/emailaddresses`],
    ["phones", `${basePath}/phones`],
    ["addresses", `${basePath}/addresses`],
  ];

  const results = await Promise.allSettled(
    requests.map(([, path]) => blackbaudApiFetch(path, { userId, authUserId, origin })),
  );
  const contacts = { emails: [], phones: [], addresses: [] };
  const errors = [];
  results.forEach((result, index) => {
    const [kind] = requests[index];
    if (result.status === "fulfilled") {
      contacts[kind] = getCollection(result.value);
      return;
    }
    if (requestedKinds.has(kind)) {
      errors.push(`Could not load current NXT ${kind}: ${
        result.reason instanceof Error ? result.reason.message : "Unknown error"
      }`);
    }
  });

  return { contacts: serializeContactSnapshot(contacts), errors };
}

async function fetchCurrentNameFormats({ userId, authUserId, origin, constituentId }) {
  const payload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}/nameformats/summary`,
    { userId, authUserId, origin },
  );
  const primaryAddressee = serializeNameFormat(
    payload?.primary_addressee || payload?.primaryAddressee,
  );
  const primarySalutation = serializeNameFormat(
    payload?.primary_salutation || payload?.primarySalutation,
  );
  return { addressee: primaryAddressee, salutation: primarySalutation };
}

async function fetchCurrentEducations({ userId, authUserId, origin, constituentId }) {
  const payload = await blackbaudApiFetch(
    `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}/educations`,
    { userId, authUserId, origin },
  );
  return getCollection(payload);
}

function deriveStatus(
  matchResult,
  codeFetchError,
  contactFetchErrors,
  nameFormatFetchError,
  educationFetchError,
  changePreview,
  writePlan = [],
) {
  const hasWritePlan = Array.isArray(writePlan) && writePlan.length > 0;
  const hasConstituentCodeWrite = writePlan.some((write) => write.type === "constituent_code");
  const hasContactWrite = writePlan.some((write) =>
    ["email_address", "phone", "address"].includes(write.type),
  );
  const hasNameFormatWrite = writePlan.some((write) => write.type === "constituent_name_format");
  const hasEducationWrite = writePlan.some((write) => write.type === "education_relationship");

  if (changePreview.status === STATUS.conflict) return STATUS.conflict;
  if (matchResult.status !== "matched") return STATUS.needsReview;
  if (codeFetchError && hasConstituentCodeWrite) return STATUS.needsReview;
  if (contactFetchErrors.length && hasContactWrite) return STATUS.needsReview;
  if (nameFormatFetchError && hasNameFormatWrite) return STATUS.needsReview;
  if (educationFetchError && hasEducationWrite) return STATUS.needsReview;
  if (writePlan.some((write) => write.requiresReview)) return STATUS.needsReview;
  if (hasWritePlan) return STATUS.ready;
  if (changePreview.status === STATUS.skipped) return STATUS.skipped;
  return changePreview.status;
}

function classifyImportRow(importIntent, matchResult, status) {
  if (status === STATUS.conflict) {
    return {
      key: "conflict",
      label: "Conflict",
      allowApply: false,
      message:
        "The CSV contains conflicting identifiers or validation errors. Resolve the conflict before this row can update an existing record or be reviewed as a potential new constituent.",
    };
  }

  if (importIntent === "new") {
    if (matchResult.status === "matched") {
      return {
        key: "possible_duplicate",
        label: "Possible duplicate",
        allowApply: false,
        message:
          "An existing NXT record was found. This row is held for duplicate review and will not update or create a record from the new-records workflow.",
      };
    }
    if (matchResult.status === "needs_review") {
      return {
        key: "needs_resolution",
        label: "Needs resolution",
        allowApply: false,
        message:
          "A possible NXT match was found. Resolve the duplicate check before treating this row as a new constituent.",
      };
    }
    return {
      key: "potential_new",
      label: "Potential new record",
      allowApply: false,
      message:
        "No likely NXT record was found. This row is a potential new constituent and remains in controlled review; this import does not create NXT records.",
    };
  }

  if (importIntent === "mixed") {
    if (matchResult.status === "matched") {
      return {
        key: status === STATUS.ready ? "ready_update" : "needs_resolution",
        label: status === STATUS.ready ? "Ready update" : "Needs resolution",
        allowApply: status === STATUS.ready,
        message:
          status === STATUS.ready
            ? "An existing NXT record was confirmed and the requested update is ready for the guarded apply step."
            : "An existing NXT record was found, but this row needs review before it can be updated.",
      };
    }
    if (matchResult.status === "needs_review") {
      return {
        key: "needs_resolution",
        label: "Needs resolution",
        allowApply: false,
        message:
          "A possible NXT match was found. Resolve the match before deciding whether this row updates an existing record or becomes a new-record candidate.",
      };
    }
    return {
      key: "potential_new",
      label: "Potential new record",
      allowApply: false,
      message:
        "No likely NXT record was found. This row is a potential new constituent and remains in controlled review; this import does not create NXT records.",
    };
  }

  return {
    key: status === STATUS.ready ? "ready_update" : status === STATUS.needsReview ? "needs_resolution" : "other",
    label: status === STATUS.ready ? "Ready update" : status,
    allowApply: status === STATUS.ready,
    message:
      status === STATUS.ready
        ? "An existing NXT record was confirmed and the requested update is ready for the guarded apply step."
        : "This row requires an existing NXT match before it can be updated.",
  };
}

function summarize(rows, warnings) {
  return rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.status === STATUS.ready) acc.ready += 1;
      if (row.status === STATUS.needsReview) acc.needsReview += 1;
      if (row.status === STATUS.skipped) acc.skipped += 1;
      if (row.status === STATUS.conflict) acc.conflict += 1;
      if (row.intentDisposition?.key === "potential_new") acc.potentialNew += 1;
      if (
        row.intentDisposition?.key === "needs_resolution" ||
        row.intentDisposition?.key === "possible_duplicate"
      ) {
        acc.needsResolution += 1;
      }
      return acc;
    },
    {
      total: 0,
      ready: 0,
      needsReview: 0,
      skipped: 0,
      conflict: 0,
      potentialNew: 0,
      needsResolution: 0,
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

  const persistedRowIds = new Map();
  for (const row of previewRows) {
    const rawRow = rawRows[row.rowNumber - 1] || {};
    const input = row.input || {};
    const insertedRows = await sql`
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
      RETURNING id, row_number
    `;
    const persistedRow = insertedRows?.[0];
    if (persistedRow?.id != null) {
      persistedRowIds.set(String(row.rowNumber), String(persistedRow.id));
    }
  }

  return {
    run: serializeRun(run),
    persistedRowIds,
  };
}

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser } = await getWorkspaceUser(session, request);
    const user = sessionUser;
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
    const contactDecisions =
      body?.contactDecisions && typeof body.contactDecisions === "object"
        ? body.contactDecisions
        : {};
    const fieldDecisions =
      body?.fieldDecisions && typeof body.fieldDecisions === "object"
        ? body.fieldDecisions
        : {};
    const useHierarchy = defaults.useHierarchy !== false;
    const importIntent = normalizeImportIntent(defaults.importIntent);
    const saveRun = Boolean(body?.saveRun);
    const origin = new URL(request.url).origin;
    const authUserId = user.id;

    const previewRows = [];
    for (let index = 0; index < rowsToPreview.length; index += 1) {
      const row = rowsToPreview[index];
      const input = getRowInput(row, mappings, defaults);
      let matchResult;
      let currentCodes = [];
      let codeFetchError = "";
      let currentContacts = { emails: [], phones: [], addresses: [] };
      let contactFetchErrors = [];
      let currentNameFormats = {
        addressee: { id: "", value: "" },
        salutation: { id: "", value: "" },
      };
      let nameFormatFetchError = "";
      let currentEducations = [];
      let educationFetchError = "";

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

      if (
        matchResult.match?.blackbaudConstituentId &&
        (
          input.nameUpdate ||
          input.individualProfileUpdate ||
          input.nameFormatUpdate ||
          input.educationRelationship
        )
      ) {
        try {
          const detailedMatch = await getBlackbaudConstituentById({
            userId: user.id,
            authUserId,
            origin,
            constituentId: matchResult.match.blackbaudConstituentId,
          });
          if (detailedMatch && typeof detailedMatch === "object") {
            matchResult.match = {
              ...matchResult.match,
              ...detailedMatch,
              raw: detailedMatch.raw || matchResult.match.raw || null,
            };
          }
        } catch {
          // Retain the matched record when a supplemental detail fetch is unavailable.
        }
      }

      if (
        matchResult.match?.blackbaudConstituentId &&
        (
          input.emailUpdates?.length ||
          input.phoneUpdates?.length ||
          input.addressUpdates?.length ||
          hasContactSectionAction(contactDecisions[String(index + 1)] || {})
        )
      ) {
        const contactPreview = await fetchCurrentContacts({
          userId: user.id,
          authUserId,
          origin,
          constituentId: matchResult.match.blackbaudConstituentId,
          input,
        });
        currentContacts = contactPreview.contacts;
        contactFetchErrors = contactPreview.errors;
      }

      if (matchResult.match?.blackbaudConstituentId && input.nameFormatUpdate) {
        try {
          currentNameFormats = await fetchCurrentNameFormats({
            userId: user.id,
            authUserId,
            origin,
            constituentId: matchResult.match.blackbaudConstituentId,
          });
        } catch (error) {
          nameFormatFetchError =
            error instanceof Error ? error.message : "Could not load the current primary name formats.";
        }
      }

      if (matchResult.match?.blackbaudConstituentId && input.educationRelationship) {
        try {
          currentEducations = await fetchCurrentEducations({
            userId: user.id,
            authUserId,
            origin,
            constituentId: matchResult.match.blackbaudConstituentId,
          });
        } catch (error) {
          educationFetchError =
            error instanceof Error
              ? error.message
              : "Could not load current NXT education relationships.";
        }
      }

      const changePreview = previewConstituencyChange(input, currentCodes, { useHierarchy });
      const writePlan = buildWritePlan(
        input,
        changePreview,
        matchResult.match,
        currentContacts,
        contactDecisions[String(index + 1)] || {},
        fieldDecisions[String(index + 1)] || {},
        currentNameFormats,
        currentEducations,
      );
      const reasons = [
        ...matchResult.notes,
        ...(codeFetchError ? [`Could not load current NXT constituencies: ${codeFetchError}`] : []),
        ...contactFetchErrors,
        ...(nameFormatFetchError
          ? [`Could not load current NXT addressee and salutation formats: ${nameFormatFetchError}`]
          : []),
        ...(educationFetchError
          ? [`Could not load current NXT education relationships: ${educationFetchError}`]
          : []),
        ...changePreview.reasons,
        ...(input.educationRelationship
          ? [
              input.educationRelationship.action === "review-update"
                ? "Education relationship data is staged for review. JUMGOGPT updates an existing NXT education row only when it identifies one unambiguous row; ambiguous or missing matches remain in review."
                : "Education relationship data is staged as a new NXT education record. Existing education records are never replaced or end-dated, and an identical record is skipped.",
            ]
          : []),
        ...(input.organizationRelationship
          ? [
              "Organization relationship data is add-only. The import will link a single exact existing NXT organization, skip an existing link, and keep missing or ambiguous organization matches in review.",
            ]
          : []),
        ...(writePlan.some((write) => write.type === "constituent_name")
          ? [
              "Selected name fields are staged to update the matched NXT constituent. Blank name cells will be left unchanged.",
            ]
          : []),
        ...(writePlan.some((write) => write.type === "constituent_profile")
          ? [
              "Selected title, gender, ethnicity, birth date, and suffix values are staged for the matched individual constituent. Blank CSV cells will be left unchanged.",
            ]
          : []),
        ...(writePlan.some((write) => write.type === "constituent_name_format")
          ? [
              "Primary addressee and salutation values are staged as custom NXT name formats. Review the current and proposed values before applying.",
            ]
          : []),
        ...(writePlan.some((write) => write.type === "email_address")
          ? [
              "Review the current NXT email address and the CSV value before saving. Add keeps existing values; replace preserves the selected NXT email type and primary setting.",
            ]
          : []),
        ...(writePlan.some((write) => write.type === "phone")
          ? [
              "Review the current NXT phone number and the CSV value before saving. Add keeps existing values; replace preserves the selected NXT phone type and primary setting.",
            ]
          : []),
        ...(writePlan.some((write) => write.type === "address")
          ? [
              "Review the current NXT address and the CSV value before saving. Add keeps existing values; replace preserves the selected NXT address type and primary setting. Address Valid From is included when provided.",
            ]
          : []),
        ...writePlan
          .filter((write) => write.validationMessage)
          .map((write) => write.validationMessage),
      ].filter(Boolean);

      const initialStatus = deriveStatus(
        matchResult,
        codeFetchError,
        contactFetchErrors,
        nameFormatFetchError,
        educationFetchError,
        changePreview,
        writePlan,
      );
      const intentDisposition = classifyImportRow(importIntent, matchResult, initialStatus);
      const status = intentDisposition.allowApply ? initialStatus :
        initialStatus === STATUS.conflict ? STATUS.conflict :
        initialStatus === STATUS.skipped && intentDisposition.key === "other" ? STATUS.skipped :
        STATUS.needsReview;

      previewRows.push({
        rowNumber: index + 1,
        status,
        importIntent,
        intentDisposition,
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
        currentCodeDetails: currentCodes.map((code) => ({
          label: code.label,
          startDate: formatPreviewDate(code.startDate),
          endDate: formatPreviewDate(code.endDate),
        })),
        currentContacts,
        currentNameFormats,
        currentEducations: currentEducations.map(serializeEducation),
        proposedCodes: changePreview.proposedCodes,
        writePlan,
        reasons,
      });
    }

    const summary = summarize(previewRows, warnings);
    const savedPreview = saveRun
      ? await savePreviewRun({
          sessionUser: user,
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
    const savedRun = savedPreview?.run || null;
    // A saved run needs its database row IDs immediately so the guarded NXT batch
    // can be selected without reloading the preview first.
    const responseRows = savedPreview
      ? previewRows.map((row) => ({
          ...row,
          id: savedPreview.persistedRowIds.get(String(row.rowNumber)) || null,
          runId: savedRun?.id || null,
        }))
      : previewRows;

    return Response.json({
      previewOnly: true,
      savedRun,
      warnings,
      summary,
      rows: responseRows,
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
