import { parseImportDate } from "./importDate";

export const customFieldText = (value) => String(value ?? "").trim();
export const customFieldKey = (value) => customFieldText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
export const protectedImportCategory = (value) => ["relationshiporiginator", "mgogpt"].includes(customFieldKey(value));
export function customFieldType(value) {
  const key = customFieldKey(value);
  return ({ text: "text", string: "text", table: "table", codetable: "table", codetableentry: "table",
    boolean: "boolean", yesno: "boolean", date: "date", number: "number", currency: "currency" })[key] || "";
}
export function customFieldDate(value) {
  if (!customFieldText(value)) return "";
  const parsed = parseImportDate(value);
  if (!parsed) throw new Error("Use a complete date (MM/DD/YYYY or YYYY-MM-DD) for the custom field.");
  return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
}
export function customFieldInput(row, mappings, defaults) {
  const read = (key) => customFieldText(row?.[mappings?.[key]]);
  const value = read("customFieldValue"), date = read("customFieldDate"), comment = read("customFieldComment");
  return value || date || comment ? { category: customFieldText(defaults?.customFieldCategory), value, date, comment } : null;
}
export function customFieldInputError(input) {
  if (!input || typeof input !== "object") return "Custom-field values are missing.";
  if (!customFieldText(input.category) || customFieldText(input.category).length > 100) return "Choose an existing NXT custom-field category.";
  if (protectedImportCategory(input.category)) return "Relationship Originator and MGOGPT must use their existing workflows, not imports.";
  if (!customFieldText(input.value)) return "A custom-field value is required when a date or comment is supplied.";
  if (customFieldText(input.value).length > 250) return "Custom-field imports accept values up to 250 characters; nothing is truncated.";
  if (customFieldText(input.comment).length > 50) return "Custom-field comments must be 50 characters or fewer; nothing is truncated.";
  if ([input.category, input.value, input.comment].some((value) => /[\x00-\x1f]/.test(customFieldText(value)))) return "Custom-field values cannot contain control characters.";
  try { customFieldDate(input.date); } catch (error) { return error.message; }
  return "";
}
export function deferredCustomFieldWrite(input) {
  if (!input?.customField) return null;
  const message = customFieldInputError(input.customField);
  return { type: "constituent_custom_field", action: "load_current", ...input.customField,
    requiresReview: true, deferredHydration: true,
    validationMessage: message || "Open this row to load the current NXT custom fields and validate the category before adding it." };
}
export function customFieldPayload(input, category, values = []) {
  const error = customFieldInputError(input);
  if (error) throw new Error(error);
  if (!category || customFieldText(category.name).toLowerCase() !== customFieldText(input.category).toLowerCase() || protectedImportCategory(category.name)) throw new Error("The selected custom-field category could not be verified in NXT.");
  const type = customFieldType(category.dataType);
  if (!type) throw new Error("This category type is not supported by imports. Use NXT for this field.");
  const value = customFieldText(input.value);
  const payload = { category: category.name };
  if (type === "text") payload.text_value = value;
  if (type === "table") {
    const matches = values.filter((entry) => customFieldText(entry).toLowerCase() === value.toLowerCase());
    if (matches.length !== 1) throw new Error("Choose an existing, unambiguous NXT table value. Import does not create table entries.");
    payload.codetableentry_value = matches[0];
  }
  if (type === "boolean") {
    if (!["yes", "no", "true", "false", "1", "0"].includes(value.toLowerCase())) throw new Error("Use Yes or No for this custom-field value.");
    payload.boolean_value = ["yes", "true", "1"].includes(value.toLowerCase());
  }
  if (type === "date") payload.date_value = customFieldDate(value);
  if (type === "number" || type === "currency") {
    const pattern = type === "number" ? /^-?\d+$/ : /^-?\d+(?:\.\d{1,2})?$/;
    const number = Number(value);
    if (!pattern.test(value) || !Number.isSafeInteger(type === "number" ? number : Math.round(number * 100))) throw new Error("Use a plain number without commas or currency symbols; currency supports up to two decimal places.");
    payload[type === "number" ? "number_value" : "currency_value"] = number;
  }
  if (input.date) payload.date = customFieldDate(input.date);
  if (input.comment) payload.comment = customFieldText(input.comment);
  return { payload, dataType: type };
}
function readDate(value) {
  if (!value) return "";
  if (typeof value !== "string") return null;
  try { return customFieldDate(value.replace(/T00:00:00(?:\.000)?Z$/, "")); } catch { return null; }
}
export function matchingCustomFields(fields, payload, dataType) {
  const property = { text: "text_value", table: "codetableentry_value", boolean: "boolean_value", date: "date_value", number: "number_value", currency: "currency_value" }[dataType];
  if (!property) return [];
  return fields.filter((field) => {
    if (customFieldText(field.category).toLowerCase() !== customFieldText(payload.category).toLowerCase()) return false;
    const actual = field[property] ?? field.value;
    const expected = payload[property];
    const equal = dataType === "date" ? readDate(actual) === expected
      : ["number", "currency"].includes(dataType) ? (typeof actual === "number" && actual === expected)
      : dataType === "boolean" ? typeof actual === "boolean" && actual === expected
      : typeof actual === "string" && actual.trim() === expected;
    return equal && readDate(field.date) === (payload.date || "") && customFieldText(field.comment) === (payload.comment || "");
  });
}
export function customFieldWrite(input, category, values, fields) {
  const base = { type: "constituent_custom_field", ...input };
  try {
    const { payload, dataType } = customFieldPayload(input, category, values);
    const existing = fields.filter((field) => customFieldText(field.category).toLowerCase() === payload.category.toLowerCase());
    const exact = matchingCustomFields(existing, payload, dataType);
    if (existing.length && (existing.length !== 1 || exact.length !== 1)) return { ...base, action: "review_existing", requiresReview: true,
      validationMessage: "NXT already has a different or repeated field in this category. Existing values are unchanged; resolve this category in NXT or skip this import row." };
    return { ...base, category: payload.category, payload, dataType, action: exact.length ? "skip_existing" : "add", requiresReview: false };
  } catch (error) { return { ...base, action: "review_existing", requiresReview: true, validationMessage: error.message }; }
}
export function describeCustomField(write) {
  return `${write.action === "skip_existing" ? "Already in NXT" : write.requiresReview ? "Review custom field" : "Add custom field"}: ${write.category || "Category needed"} = ${write.value ?? ""}${write.date ? `; date ${write.date}` : ""}${write.comment ? `; comment ${write.comment}` : ""}`;
}
