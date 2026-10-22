import { validateNewRecordContacts } from "./newConstituentImport";

const text = (value) => String(value ?? "").trim();
export const IMPORT_CONTACT_GROUPS = [
  { key: "email", label: "Email addresses", flag: "updateEmailFields", defaultType: "defaultEmailType", inputKey: "emailUpdates", valueKey: "address",
    fields: [["email", "emailType", "emailMakePrimary"], ["email2", "email2Type", "email2MakePrimary"]] },
  { key: "phone", label: "Phone numbers", flag: "updatePhoneFields", defaultType: "defaultPhoneType", inputKey: "phoneUpdates", valueKey: "number",
    fields: [["phoneNumber", "phoneType", "phoneMakePrimary"], ["phone2Number", "phone2Type", "phone2MakePrimary"]] },
];

function primaryFlag(value) {
  const flag = text(value).toLowerCase();
  if (!flag) return null;
  if (["yes", "true", "1", "y"].includes(flag)) return true;
  if (["no", "false", "0", "n"].includes(flag)) return false;
  return flag;
}

export function importContactMappingKey(mappings, group) {
  return JSON.stringify(group.fields.flat().map((key) => [key, mappings[key] || ""]));
}

export function mappedImportContacts(row, mappings, defaults, group) {
  const value = (key) => text(mappings[key] ? row?.[mappings[key]] : "");
  return group.fields.flatMap(([field, type, primary]) => value(field) ? [{
    [group.valueKey]: value(field),
    type: value(type) || text(defaults[group.defaultType]),
    makePrimary: primaryFlag(value(primary)),
  }] : []);
}

export function importContactPreflight(rows, mappings = {}, defaults = {}, rowOffset = 0) {
  const blockers = [];
  const groups = IMPORT_CONTACT_GROUPS.map((group) => {
    const mappingKey = importContactMappingKey(mappings, group);
    const imported = defaults[group.flag] === true;
    // An omission is intentional only for the exact set of selected columns.
    const excluded = defaults.contactMatchingOnly?.[group.key] === mappingKey;
    const result = { ...group, mappingKey, mode: imported ? "import" : excluded ? "matching" : "choose",
      count: 0, rowCount: 0, primaryCount: 0, blankTypeCount: 0, issues: [] };
    const fallback = defaults[group.defaultType];
    if (imported && fallback != null && (typeof fallback !== "string" || fallback.length > 100 || /[\r\n]/.test(fallback))) {
      blockers.push(`Use a valid default ${group.key} type of 100 characters or fewer.`);
    }
    rows.forEach((row, index) => {
      const values = mappedImportContacts(row, mappings, defaults, group);
      if (!values.length) return;
      result.rowCount += 1;
      result.count += values.length;
      result.primaryCount += values.filter((value) => value.makePrimary === true).length;
      result.blankTypeCount += mappedImportContacts(row, mappings, {}, group).filter((value) => !value.type).length;
      if (imported) {
        if (values.some((value) => value.makePrimary != null && typeof value.makePrimary !== "boolean")) {
          blockers.push(`Row ${rowOffset + index + 1}: use Yes or No for each ${group.key} primary flag, or leave it blank.`);
        }
        if (values.filter((value) => value.makePrimary === true).length > 1) {
          blockers.push(`Row ${rowOffset + index + 1}: only one ${group.key} can be marked primary.`);
        }
        try { validateNewRecordContacts({ [group.inputKey]: values }); }
        catch (error) { result.issues.push({ rowNumber: rowOffset + index + 1, message: error.message }); }
      }
    });
    if (result.count && result.mode === "choose") {
      blockers.push(`Choose whether to import ${group.label.toLowerCase()} or leave them out of contact updates.`);
    }
    return result;
  }).filter((group) => group.count > 0);
  return { groups, blockers };
}
