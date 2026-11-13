import { IMPORT_FIELDS, FIELD_BY_KEY, getUploadedHeaderForField } from "./importFieldDefinitions";
import { normalizeImportSetup } from "./importSetups";

export const IMPORT_PRESETS = [
  { id: "new", label: "Add new people", description: "Names, emails, phones, and constituent codes. Possible duplicates stay in review.",
    help: "Includes recognized names, emails, phones, and new constituent codes for review. Addresses are used for matching unless you choose to import them. Primary requests come only from your CSV. Existing names are not overwritten." },
  { id: "updates", label: "Update existing people", description: "Use NXT IDs to add contact details or constituent codes. No new people are created.",
    help: "Every row needs an NXT System ID or Lookup ID. Includes recognized emails, phones, addresses, and new codes for review; names help confirm identity but are not changed." },
  { id: "custom", label: "Add custom fields", description: "Use NXT IDs and choose one existing category. Duplicates are skipped; conflicts are held.",
    help: "Every row needs an NXT System ID or Lookup ID. Choose the category in Your import plan. Other contact, code, and relationship columns are not included by this starting point." },
];

// Presets supply configuration only. No identities, row values, or approvals are reused.
export function importPresetConfiguration(id, headers = []) {
  const preset = IMPORT_PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error("Choose a supported import starting point.");
  const groups = new Set(["Match fields", "Name fields", ...(id === "custom"
    ? ["Custom field additions"]
    : ["Email fields", "Phone fields", "Constituent code fields", "Address fields"])]);
  const mappings = {};
  for (const field of IMPORT_FIELDS) {
    if (!groups.has(field.group) || field.key === "sourceConstituency") continue;
    const header = getUploadedHeaderForField(field.key, headers);
    if (header) mappings[field.key] = header;
  }
  const required = id === "new" ? ["firstName", "lastName"] : [];
  if (id !== "new" && !mappings.blackbaudConstituentId && !mappings.lookupId) required.push("blackbaudConstituentId");
  if (id === "custom") required.push("customFieldValue");
  const missing = required.filter((key) => !mappings[key]);
  for (const key of missing) mappings[key] = FIELD_BY_KEY[key].header;
  const configuration = normalizeImportSetup({ name: preset.label, mappings, defaults: {
    importIntent: id === "new" ? "new" : "updates",
    defaultAction: "add",
    updateEmailFields: Boolean(mappings.email || mappings.email2),
    updatePhoneFields: Boolean(mappings.phoneNumber || mappings.phone2Number),
    updateAddressFields: id === "updates" && Boolean(mappings.addressLine1),
  } });
  // An uploaded file needs an explicit choice for missing/ambiguous required columns.
  // Before upload, canonical headers remain available for the optional template.
  if (headers.length) for (const key of missing) configuration.mappings[key] = "";
  return configuration;
}
