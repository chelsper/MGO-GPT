import { IMPORT_FIELDS, FIELD_BY_KEY } from "./importFieldDefinitions";
import { IMPORT_CONTACT_GROUPS, importContactMappingKey } from "./importContactPreflight";

const FLAGS = ["useHierarchy", "updateNameFields", "updateIndividualProfileFields", "updateNameFormatFields", "buildNameFormats", "updateEmailFields", "updatePhoneFields", "updateAddressFields"];
const CHOICES = {
  importIntent: ["updates", "new", "mixed"],
  defaultAction: ["add", "replace"],
  educationRelationshipAction: ["add", "review-update"],
  addresseeFormat: ["title-preferred-last-suffix", "title-first-last-suffix", "preferred-last", "first-last"],
  salutationFormat: ["dear-preferred", "dear-first", "title-last", "preferred", "first"],
};
const record = (value) => value && typeof value === "object" && !Array.isArray(value);
function boundedText(value, label, limit, optional = false) {
  if (optional && value == null) return "";
  if (typeof value !== "string" || value.length > limit || /[\x00-\x1f]/.test(value) || (!optional && !value.trim())) {
    throw new Error(`${label} must be ${optional ? "blank or " : ""}text of ${limit} characters or fewer.`);
  }
  return value.trim();
}

// Only reusable configuration crosses this boundary, never row data, targets,
// previous decisions, write plans, or approval tokens.
export function normalizeImportSetup(value) {
  if (!record(value) || (value.version != null && value.version !== 1)) throw new Error("This import setup format is not supported.");
  const name = boundedText(value.name, "Setup name", 80);
  if (!record(value.mappings) || !Object.keys(value.mappings).length) throw new Error("Select at least one column before saving a setup.");
  const mappings = {};
  for (const [key, header] of Object.entries(value.mappings)) {
    if (!Object.hasOwn(FIELD_BY_KEY, key)) throw new Error("This setup contains an unsupported import field.");
    mappings[key] = boundedText(header, `${FIELD_BY_KEY[key].label} column`, 200);
  }
  if (new Set(Object.values(mappings)).size !== Object.keys(mappings).length) throw new Error("Map each CSV column to only one import field.");
  const source = record(value.defaults) ? value.defaults : {};
  const defaults = {};
  for (const [key, options] of Object.entries(CHOICES)) {
    if (source[key] != null && !options.includes(source[key])) throw new Error("Choose a supported import option before saving.");
    defaults[key] = source[key] ?? options[0];
  }
  for (const key of FLAGS) {
    if (source[key] != null && typeof source[key] !== "boolean") throw new Error("Import options must be true or false.");
    defaults[key] = source[key] === true;
  }
  for (const key of ["defaultEmailType", "defaultPhoneType"]) defaults[key] = boundedText(source[key], "Contact type", 100, true);
  defaults.newRecordNameFormats = {};
  for (const key of ["addressee", "salutation"]) {
    const id = boundedText(source.newRecordNameFormats?.[key], "NXT name format ID", 40, true);
    if (id && !/^\d+$/.test(id)) throw new Error("Select a configured NXT name format.");
    defaults.newRecordNameFormats[key] = id;
  }
  defaults.contactMatchingOnly = {};
  for (const group of IMPORT_CONTACT_GROUPS) {
    const key = importContactMappingKey(mappings, group);
    if (!defaults[group.flag] && source.contactMatchingOnly?.[group.key] === key) defaults.contactMatchingOnly[group.key] = key;
  }
  return { version: 1, name, mappings, defaults };
}

export function importSetupFileBlockers(rows, mappings, defaults, rowOffset = 0) {
  if (!defaults?.reusableSetup) return [];
  const blockers = [];
  const entries = Object.entries(mappings || {});
  if (!entries.length) blockers.push("Select the columns to use for this file.");
  for (const [key, header] of entries) {
    if (!header || rows.some((row) => !Object.hasOwn(row || {}, header))) {
      blockers.push(`Choose an available column for ${FIELD_BY_KEY[key]?.label || key}${header ? ` (expected ${header})` : ""}.`);
    }
    if (/MakePrimary$/.test(key) && header) rows.forEach((row, index) => {
      const value = String(row?.[header] ?? "").trim().toLowerCase();
      if (value && !["yes", "no", "true", "false", "y", "n", "1", "0"].includes(value)) blockers.push(`Row ${rowOffset + index + 1}: use Yes or No for ${FIELD_BY_KEY[key]?.label || key}, or leave it blank.`);
    });
  }
  const mapped = entries.map(([, header]) => header).filter(Boolean);
  if (new Set(mapped).size !== mapped.length) blockers.push("Map each CSV column to only one import field.");
  if (defaults.importIntent === "updates") {
    rows.forEach((row, index) => {
      const hasId = ["blackbaudConstituentId", "lookupId"].some((key) => {
        const header = mappings[key];
        return header && Object.hasOwn(row || {}, header) && String(row[header] ?? "").trim();
      });
      if (!hasId) blockers.push(`Row ${rowOffset + index + 1}: update-only setups require an NXT System ID or NXT Lookup ID. Add an ID or use a different import purpose.`);
    });
  }
  return blockers;
}

export function importSetupActiveFields(setup) {
  return Object.fromEntries(IMPORT_FIELDS.map((field) => [field.key, Object.hasOwn(setup.mappings, field.key)]));
}
