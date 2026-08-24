export const FAMILY_IMPORT_MAX_ROWS = 100;

export const FAMILY_IMPORT_TEMPLATE_HEADERS = [
  "Family Key",
  "Student NXT System ID",
  "Student Lookup ID",
  "Student First Name",
  "Student Last Name",
  "Parent 1 NXT System ID",
  "Parent 1 Lookup ID",
  "Parent 1 First Name",
  "Parent 1 Last Name",
  "Parent 1 Preferred Name",
  "Parent 1 Title",
  "Parent 1 Suffix",
  "Parent 1 Gender",
  "Parent 1 Birth Date",
  "Parent 1 Email",
  "Parent 1 Email Type",
  "Parent 1 Phone",
  "Parent 1 Phone Type",
  "Parent 1 Address Type",
  "Parent 1 Address Line 1",
  "Parent 1 Address Line 2",
  "Parent 1 City",
  "Parent 1 State",
  "Parent 1 ZIP/Postal Code",
  "Parent 1 Country",
  "Parent 1 Relation Code",
  "Parent 1 Reciprocal Relation Code",
  "Parent 2 NXT System ID",
  "Parent 2 Lookup ID",
  "Parent 2 First Name",
  "Parent 2 Last Name",
  "Parent 2 Preferred Name",
  "Parent 2 Title",
  "Parent 2 Suffix",
  "Parent 2 Gender",
  "Parent 2 Birth Date",
  "Parent 2 Email",
  "Parent 2 Email Type",
  "Parent 2 Phone",
  "Parent 2 Phone Type",
  "Parent 2 Address Type",
  "Parent 2 Address Line 1",
  "Parent 2 Address Line 2",
  "Parent 2 City",
  "Parent 2 State",
  "Parent 2 ZIP/Postal Code",
  "Parent 2 Country",
  "Parent 2 Relation Code",
  "Parent 2 Reciprocal Relation Code",
  "Spouse Relation Code",
  "Spouse Reciprocal Relation Code",
  "Household Head",
];

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeHeader(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeBoolean(value) {
  return ["true", "yes", "y", "1"].includes(cleanText(value).toLowerCase());
}

function buildValueMap(rawRow) {
  return Object.entries(rawRow || {}).reduce((map, [key, value]) => {
    const normalized = normalizeHeader(key);
    if (normalized && !map.has(normalized)) map.set(normalized, cleanText(value));
    return map;
  }, new Map());
}

function firstValue(values, keys) {
  for (const key of keys) {
    const value = values.get(normalizeHeader(key));
    if (value) return value;
  }
  return "";
}

function getPerson(values, label, key) {
  const value = (field, aliases = []) =>
    firstValue(values, [`${label} ${field}`, ...aliases.map((alias) => `${label} ${alias}`)]);

  return {
    key,
    systemId: value("NXT System ID", ["System ID", "Constituent ID"]),
    lookupId: value("Lookup ID", ["NXT Lookup ID"]),
    firstName: value("First Name"),
    lastName: value("Last Name"),
    preferredName: value("Preferred Name"),
    title: value("Title"),
    suffix: value("Suffix"),
    gender: value("Gender"),
    birthDate: value("Birth Date", ["Birthdate"]),
    email: value("Email", ["Email Address"]),
    emailType: value("Email Type"),
    phone: value("Phone", ["Phone Number"]),
    phoneType: value("Phone Type"),
    addressType: value("Address Type"),
    addressLine1: value("Address Line 1", ["Address 1"]),
    addressLine2: value("Address Line 2", ["Address 2"]),
    city: value("City"),
    state: value("State", ["State Province"]),
    postalCode: value("ZIP/Postal Code", ["Zip", "Zip Code", "Postal Code"]),
    country: value("Country"),
    relationCode: value("Relation Code"),
    reciprocalRelationCode: value("Reciprocal Relation Code", ["Recip Relation Code"]),
  };
}

function getStudent(values) {
  return {
    systemId: firstValue(values, ["Student NXT System ID", "Student System ID", "Student Constituent ID"]),
    lookupId: firstValue(values, ["Student Lookup ID", "Student NXT Lookup ID"]),
    firstName: firstValue(values, ["Student First Name"]),
    lastName: firstValue(values, ["Student Last Name"]),
  };
}

export function hasPersonData(person) {
  if (!person || typeof person !== "object") return false;
  return Boolean(
    [
      person.systemId,
      person.lookupId,
      person.firstName,
      person.lastName,
      person.preferredName,
      person.email,
      person.phone,
      person.addressLine1,
    ].some((value) => cleanText(value)),
  );
}

export function displayPersonName(person, fallback = "Unnamed parent") {
  const name = [cleanText(person?.firstName), cleanText(person?.lastName)].filter(Boolean).join(" ");
  return name || cleanText(person?.preferredName) || fallback;
}

export function normalizeFamilyImportRow(rawRow, rowNumber = 0) {
  const values = buildValueMap(rawRow);
  const parent1 = getPerson(values, "Parent 1", "parent1");
  const parent2 = getPerson(values, "Parent 2", "parent2");
  const spouseType = firstValue(values, ["Spouse Relation Code", "Spouse Relationship Type"]);
  const spouseReciprocalType = firstValue(values, [
    "Spouse Reciprocal Relation Code",
    "Spouse Recip Relation Code",
    "Spouse Reciprocal Relationship Type",
  ]);
  const householdHead = cleanText(firstValue(values, ["Household Head"])).toLowerCase();

  return {
    rowNumber: Number(rowNumber) || 0,
    familyKey: firstValue(values, ["Family Key", "Family ID", "Household ID"]),
    student: getStudent(values),
    parents: [parent1, parent2].filter(hasPersonData),
    relationships: {
      parent1: {
        type: parent1.relationCode,
        reciprocalType: parent1.reciprocalRelationCode,
      },
      parent2: {
        type: parent2.relationCode,
        reciprocalType: parent2.reciprocalRelationCode,
      },
      spouse: {
        enabled: Boolean(spouseType || spouseReciprocalType),
        type: spouseType,
        reciprocalType: spouseReciprocalType,
        householdHead: householdHead === "parent 2" || householdHead === "parent2" ? "parent2" : "parent1",
      },
    },
  };
}

function hasIdentifier(person) {
  return Boolean(cleanText(person?.systemId) || cleanText(person?.lookupId));
}

function hasSearchableName(person) {
  return Boolean(cleanText(person?.firstName) && cleanText(person?.lastName));
}

export function validateFamilyImportInput(input) {
  const errors = [];
  const warnings = [];
  const student = input?.student || {};
  const parents = Array.isArray(input?.parents) ? input.parents : [];

  if (!hasIdentifier(student) && !hasSearchableName(student)) {
    errors.push("Provide the student's NXT System ID or Lookup ID. A first and last name can be used for a manual search, but the student cannot be created by this import.");
  }
  if (!parents.length) {
    errors.push("Provide at least one parent.");
  }

  for (const parent of parents) {
    const label = parent.key === "parent2" ? "Parent 2" : "Parent 1";
    if (!hasIdentifier(parent) && !hasSearchableName(parent)) {
      errors.push(`${label} needs an NXT System ID, Lookup ID, or both first and last name.`);
    }
    if (!cleanText(parent.relationCode) || !cleanText(parent.reciprocalRelationCode)) {
      errors.push(`${label} needs both Relation Code and Reciprocal Relation Code for the student relationship.`);
    }
    if (cleanText(parent.email) && !cleanText(parent.emailType)) {
      warnings.push(`${label} has an email but no Email Type. The email will not be created until a valid type is provided.`);
    }
    if (cleanText(parent.phone) && !cleanText(parent.phoneType)) {
      warnings.push(`${label} has a phone number but no Phone Type. The phone will not be created until a valid type is provided.`);
    }
    if (cleanText(parent.addressLine1) && !cleanText(parent.addressType)) {
      warnings.push(`${label} has an address but no Address Type. The address will not be created until a valid type is provided.`);
    }
  }

  const parentKeys = new Set(parents.map((parent) => parent.key));
  const spouse = input?.relationships?.spouse || {};
  if (spouse.enabled) {
    if (!parentKeys.has("parent1") || !parentKeys.has("parent2")) {
      errors.push("A spouse relationship requires both Parent 1 and Parent 2.");
    }
    if (!cleanText(spouse.type) || !cleanText(spouse.reciprocalType)) {
      errors.push("A spouse relationship needs both Spouse Relation Code and Spouse Reciprocal Relation Code.");
    }
  }

  return { errors, warnings };
}

function getSelection(review, key) {
  const selection = review?.selections?.[key];
  return selection && typeof selection === "object" ? selection : null;
}

export function getFamilyRowReadiness(input, review) {
  const reviewedRelationships = review?.relationships || input?.relationships;
  const inputWithReviewedRelationships = {
    ...input,
    relationships: reviewedRelationships,
    // The reviewer may correct relation codes before saving. Validate the
    // reviewed values, not just the values that originally came from CSV.
    parents: (Array.isArray(input?.parents) ? input.parents : []).map((parent) => {
      const relationship = reviewedRelationships?.[parent?.key];
      return {
        ...parent,
        relationCode: relationship?.type ?? parent?.relationCode,
        reciprocalRelationCode: relationship?.reciprocalType ?? parent?.reciprocalRelationCode,
      };
    }),
  };
  const validation = validateFamilyImportInput(inputWithReviewedRelationships);
  const missing = [];
  const studentSelection = getSelection(review, "student");
  if (!studentSelection?.candidate?.blackbaudConstituentId) {
    missing.push("Select the existing NXT student record.");
  }

  for (const parent of Array.isArray(input?.parents) ? input.parents : []) {
    const label = parent.key === "parent2" ? "Parent 2" : "Parent 1";
    const selection = getSelection(review, parent.key);
    if (selection?.mode === "existing" && selection?.candidate?.blackbaudConstituentId) continue;
    if (selection?.mode === "create" && selection?.confirmed === true) continue;
    missing.push(`Choose an existing NXT record or explicitly approve creating ${label}.`);
  }

  return {
    ready: validation.errors.length === 0 && missing.length === 0,
    errors: validation.errors,
    warnings: validation.warnings,
    missing,
  };
}

export function createInitialFamilyReview(input) {
  return {
    selections: {
      student: null,
      parent1: null,
      parent2: null,
    },
    relationships: input?.relationships || {
      parent1: { type: "", reciprocalType: "" },
      parent2: { type: "", reciprocalType: "" },
      spouse: { enabled: false, type: "", reciprocalType: "", householdHead: "parent1" },
    },
    notes: "",
  };
}

export function isFamilyImportCsvRowEmpty(rawRow) {
  return !Object.values(rawRow || {}).some((value) => cleanText(value));
}

export function createFamilyImportTemplateRow() {
  return {
    "Family Key": "FAMILY-001",
    "Student NXT System ID": "",
    "Student Lookup ID": "",
    "Student First Name": "",
    "Student Last Name": "",
    "Parent 1 NXT System ID": "",
    "Parent 1 Lookup ID": "",
    "Parent 1 First Name": "",
    "Parent 1 Last Name": "",
    "Parent 1 Relation Code": "Parent",
    "Parent 1 Reciprocal Relation Code": "Child",
    "Parent 2 First Name": "",
    "Parent 2 Last Name": "",
    "Parent 2 Relation Code": "Parent",
    "Parent 2 Reciprocal Relation Code": "Child",
    "Spouse Relation Code": "Spouse",
    "Spouse Reciprocal Relation Code": "Spouse",
    "Household Head": "Parent 1",
  };
}

export function getFamilySearchQuery(person) {
  if (cleanText(person?.email)) return cleanText(person.email);
  return [cleanText(person?.firstName), cleanText(person?.lastName)].filter(Boolean).join(" ");
}

export function summarizeFamilyImportRows(rows) {
  return (Array.isArray(rows) ? rows : []).reduce(
    (summary, row) => {
      summary.total += 1;
      switch (cleanText(row?.status)) {
        case "Ready":
          summary.ready += 1;
          break;
        case "Skipped":
          summary.skipped += 1;
          break;
        case "Applied":
          summary.applied += 1;
          break;
        case "Failed":
          summary.failed += 1;
          break;
        default:
          summary.needsReview += 1;
      }
      return summary;
    },
    { total: 0, ready: 0, needsReview: 0, skipped: 0, applied: 0, failed: 0 },
  );
}

export function normalizeFamilyCreateConfirmation(value) {
  return normalizeBoolean(value);
}
