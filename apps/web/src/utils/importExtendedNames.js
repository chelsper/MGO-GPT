const text = (value) => String(value ?? "").trim();

export const EXTENDED_IMPORT_NAMES = [
  { key: "middleName", label: "Middle name", nxt: "middle", limit: 50 },
  { key: "maidenName", label: "Maiden/former name", nxt: "former_name", limit: 100 },
];

export function extendedNameValidation(values) {
  for (const field of EXTENDED_IMPORT_NAMES) {
    if (text(values?.[field.key]).length > field.limit) {
      return `${field.label} must be ${field.limit} characters or fewer. Correct the source value; it will not be truncated.`;
    }
  }
  return "";
}

export function extendedNamePayload(values) {
  return Object.fromEntries(EXTENDED_IMPORT_NAMES
    .filter(({ key }) => text(values?.[key]))
    .map(({ key, nxt }) => [nxt, text(values[key])]));
}

export function extendedNamesMatch(values, constituent) {
  return EXTENDED_IMPORT_NAMES.every(({ key, nxt }) => !text(values?.[key]) ||
    text(values[key]).toLowerCase() === text(constituent?.[nxt]).toLowerCase());
}
