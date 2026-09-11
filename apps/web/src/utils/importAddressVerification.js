import { normalizeAddressLine, normalizeContactText, normalizePostalCode } from "./contactMatching";

const text = (value) => String(value ?? "").trim();
const state = (value) => {
  const normalized = normalizeContactText(value);
  return normalized === "florida" ? "fl" : normalized;
};
const country = (value) => {
  const normalized = normalizeContactText(value);
  return ["us", "usa", "united states", "united states of america"].includes(normalized) ? "us" : normalized;
};

export function importAddressMatches(current, write) {
  const lines = current?.address_lines ?? current?.addressLines ?? current?.lines;
  const street = Array.isArray(lines) ? lines.join(" ") : typeof lines === "string" ? lines :
    [current?.addressLine1 ?? current?.address_line1 ?? current?.line1,
      current?.addressLine2 ?? current?.address_line2 ?? current?.line2].map(text).filter(Boolean).join(" ");
  const expected = [write?.addressLine1, write?.addressLine2].map(text).filter(Boolean).join(" ");
  if (!expected || normalizeAddressLine(street) !== normalizeAddressLine(expected)) return false;
  const fields = [
    ["city", current?.city, normalizeContactText],
    ["state", current?.state, state],
    ["postalCode", current?.postal_code ?? current?.postalCode ?? current?.zip, normalizePostalCode],
    ["country", current?.country, country],
  ];
  return fields.every(([key, actual, normalize]) => write[key] === undefined || normalize(actual) === normalize(write[key]));
}
