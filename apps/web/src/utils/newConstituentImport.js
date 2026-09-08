export const cleanImportText = (value) => String(value ?? "").trim();
export class ImportReviewRequired extends Error {}
const text = cleanImportText;
const name = (value) => text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const email = (value) => text(value).toLowerCase();
const zip = (value) => text(value).match(/^\d{5}/)?.[0] || "";

function streetTokens(value) {
  const aliases = { street: "st", road: "rd", avenue: "ave", boulevard: "blvd", drive: "dr", lane: "ln", court: "ct", place: "pl", highway: "hwy", north: "n", south: "s", east: "e", west: "w" };
  return text(value).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).map((token) => aliases[token] || token);
}

export function addressSearchTerms(value) {
  const withoutUnit = text(value).split(/\s+(?:apt\.?|apartment|suite|unit|#)\s*/i)[0];
  return [...new Set([withoutUnit, streetTokens(withoutUnit).join(" ")])];
}

export function mostlySameAddress(left, right) {
  if (!zip(left.postalCode) || zip(left.postalCode) !== zip(right.postalCode)) return false;
  const a = streetTokens(left.addressLine1);
  const b = streetTokens(right.addressLine1);
  if (a.length < 2 || b.length < 2 || a[0] !== b[0]) return false;
  const overlap = a.filter((token) => b.includes(token)).length;
  return overlap / Math.min(a.length, b.length) >= 0.8;
}

export function duplicateReason(left, right) {
  const ids = [left.blackbaudConstituentId, left.lookupId].map((value) => text(value).toLowerCase()).filter(Boolean);
  if ([right.blackbaudConstituentId, right.lookupId].some((value) => text(value) && ids.includes(text(value).toLowerCase()))) return "matching NXT ID";
  const leftEmails = [left.email, left.email2].map(email).filter(Boolean);
  if ([right.email, right.email2].some((value) => email(value) && leftEmails.includes(email(value)))) return "matching email address";
  if (name(left.firstName) && name(left.lastName) && name(left.firstName) === name(right.firstName) && name(left.lastName) === name(right.lastName)) return "matching first and last name";
  if (mostlySameAddress(left, right)) return "similar address line 1 and matching ZIP first five";
  return null;
}

export function quickImportCandidates(rows) {
  return (rows || []).filter((row) =>
    ["ready_new", "potential_new"].includes(row.intentDisposition?.key) &&
    ["Ready", "Needs Review"].includes(row.status) &&
    !row.createdBlackbaudConstituentId && !row.createRequestStartedAt &&
    !row.quickCreateStatus,
  );
}

// One request creates identity plus the selected single contact of each kind.
// Ambiguous contact selections stay in review rather than being silently dropped.
export function newRecordContactPayload(input) {
  const payload = {};
  for (const [key, target, field] of [["emailUpdates", "email", "address"], ["phoneUpdates", "phone", "number"], ["addressUpdates", "address", "addressLine1"]]) {
    const values = input[key] || [];
    if (!Array.isArray(values) || values.length > 1) throw new ImportReviewRequired("Multiple contacts of one kind need individual review before quick creation.");
    if (!values.length) continue;
    const value = values[0];
    if (!text(value.type) || !text(value[field])) throw new ImportReviewRequired("Select an NXT type for each contact before quick creation.");
    if (target === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value.address))) throw new ImportReviewRequired("The email address needs review.");
    if (target === "address") {
      if (value.makePrimary === false) throw new ImportReviewRequired("A non-primary address needs individual review; quick creation adds a preferred address.");
      if (text(value.validFrom)) throw new ImportReviewRequired("An address with a valid-from date needs individual review.");
      payload.address = { type: text(value.type), address_lines: [value.addressLine1, value.addressLine2].map(text).filter(Boolean).join("\n") };
      for (const [source, destination] of [["city", "city"], ["state", "state"], ["postalCode", "postal_code"], ["country", "country"]]) {
        if (text(value[source])) payload.address[destination] = text(value[source]);
      }
    } else {
      payload[target] = { type: text(value.type), [field]: text(value[field]), primary: value.makePrimary !== false };
    }
  }
  return payload;
}
