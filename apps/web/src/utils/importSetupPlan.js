import { IMPORT_FIELDS } from "./importFieldDefinitions";

const DESCRIPTIONS = {
  updates: "Update existing records only. Unmatched people stay in review; this mode does not create constituents.",
  new: "Review potential new individuals. Possible duplicates need review, and creation requires separate approval.",
  mixed: "Review existing-record updates and potential new individuals separately. Creation requires separate approval.",
};

// A local description of the requested plan, not a prediction of NXT matches or writes.
export function importSetupPlan({ rows = [], headers = [], mappings = {}, defaults = {} } = {}) {
  const intent = defaults.importIntent || "updates";
  const allowsNew = intent === "new" || intent === "mixed";
  const fields = IMPORT_FIELDS.filter((field) => Object.hasOwn(mappings, field.key));
  const groups = [...new Set(fields.map((field) => field.group))]
    .filter((group) => group !== "Email fields" && group !== "Phone fields")
    .map((group) => {
      const selected = fields.filter((field) => field.group === group);
      const found = selected.filter((field) => headers.includes(mappings[field.key]));
      const populatedRows = rows.filter((row) => found.some((field) => String(row[mappings[field.key]] ?? "").trim())).length;
      const item = { group, fields: selected.map((field) => field.label), populatedRows, status: "For review", description: "", choice: null };
      if (group === "Match fields") {
        item.status = "Identification";
        item.description = "NXT System ID and Lookup ID identify records. External Constituent ID is an audit reference only, never an NXT match or write.";
      } else if (group === "Name fields" || group === "Individual profile fields") {
        const names = group === "Name fields";
        item.choice = names ? "updateNameFields" : "updateIndividualProfileFields";
        item.choiceLabel = names ? "Update matched NXT name fields" : "Review and update matched individual fields";
        item.checked = Boolean(defaults[item.choice]);
        item.status = item.checked ? "For review" : allowsNew ? "New individuals only" : "Unchanged in NXT";
        item.description = `${allowsNew ? "Populated values are included for eligible new individuals. " : ""}${item.checked ? "Matched-record changes will be compared with NXT before approval." : `Existing values will not be changed.${names ? " Names can still help find possible matches." : ""}`}`;
      } else if (group === "Address fields") {
        item.choice = "updateAddressFields";
        item.choiceLabel = "Review and import addresses";
        item.checked = Boolean(defaults.updateAddressFields);
        item.status = item.checked ? "For review" : "Matching only";
        item.description = item.checked
          ? "Compare with current NXT addresses before adding or replacing an address. Primary requests still need review."
          : "Address values may help find matches, but no address or primary setting will be imported.";
      } else if (group === "Addressee and salutation fields") {
        item.status = defaults.updateNameFormatFields ? "For review" : "Unchanged in NXT";
        item.description = defaults.updateNameFormatFields
          ? `Review custom primary addressee/salutation changes.${defaults.buildNameFormats ? " The name builder supplies defaults for blank values." : ""}`
          : "Mapped addressee and salutation values will not be imported. Enable them in name-format options if needed.";
      } else if (group === "Constituent code fields") {
        item.description = defaults.defaultAction === "replace"
          ? "Review replacement of the selected current constituent code and its dates."
          : `Review adding an additional constituent code.${defaults.useHierarchy ? " Code hierarchy rules are enabled." : " Existing codes are preserved."}`;
        if (!found.some((field) => field.key === "targetConstituency")) {
          item.status = "Needs a new code column";
          item.description = "Map New Constituent Code to request a code change; dates and current codes alone do not add a code.";
        }
      } else if (group === "Education relationship fields") {
        item.description = defaults.educationRelationshipAction === "review-update"
          ? "Choose the exact existing NXT education row during review. No relationship is matched for update automatically."
          : "Review adding an additional education relationship. Existing education rows are not edited.";
      } else if (group === "Organization relationship fields") {
        item.description = "Review adding an organization relationship to the individual, not creating an organization constituent.";
      }
      if (!found.length) {
        item.status = "Needs a column";
        item.description = "Map an available column or remove these fields. Nothing is read from a missing column.";
        item.choice = null;
      } else if (!populatedRows && !(group === "Addressee and salutation fields" && defaults.updateNameFormatFields && defaults.buildNameFormats)) {
        item.status = "No populated values";
        item.description = "These columns are blank in this file; blanks do not clear existing NXT values.";
      }
      return item;
    });
  const extras = [];
  const nameBuilderEnabled = Boolean(defaults.updateNameFormatFields && defaults.buildNameFormats);
  if (nameBuilderEnabled) extras.push("Name builder enabled: generated addressee/salutation values will be reviewed even when no name-format column is supplied.");
  if (allowsNew && (defaults.newRecordNameFormats?.addressee || defaults.newRecordNameFormats?.salutation)) extras.push("NXT name-format defaults are selected for new individuals. Their table values are checked before creation. Change these defaults in step 2.");
  return {
    rowCount: rows.length,
    description: DESCRIPTIONS[intent] || DESCRIPTIONS.updates,
    groups,
    extras,
    nameBuilderEnabled,
    unusedHeaders: headers.filter((header) => !Object.values(mappings).includes(header)),
  };
}
