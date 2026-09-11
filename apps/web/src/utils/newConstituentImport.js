import { importMatchEvidence, matchingHouseholdAddress, streetParts } from "./importMatchEvidence";
export const cleanImportText = (value) => String(value ?? "").trim();
export class ImportReviewRequired extends Error {}
const text = cleanImportText;

export function addressSearchTerms(value) {
  const withoutUnit = text(value).split(/\s+(?:apt\.?|apartment|suite|unit|#)\s*/i)[0];
  return [...new Set([withoutUnit, streetParts(withoutUnit).tokens.join(" ")])];
}

export function mostlySameAddress(left, right) {
  return matchingHouseholdAddress(left, right);
}

export function duplicateReason(left, right) {
  const evidence = importMatchEvidence(left, { ...right, blackbaudConstituentId: right.blackbaudConstituentId || "local-row" });
  if (evidence.rank === 100) return cleanImportText(left.blackbaudConstituentId) && cleanImportText(left.blackbaudConstituentId) === cleanImportText(right.blackbaudConstituentId)
    ? "matching NXT system ID" : "matching NXT Lookup ID";
  if (evidence.rank === 90) return "matching email address";
  if (evidence.rank === 70) return "matching first and last name";
  if (evidence.rank === 60) return "similar name with supporting contact information";
  if (evidence.rank === 40) return "similar address line 1 and matching ZIP first five";
  return null;
}

export function quickImportCandidates(rows) {
  return (rows || []).filter((row) =>
    ["ready_new", "potential_new"].includes(row.intentDisposition?.key) &&
    ["Ready", "Needs Review"].includes(row.status) &&
    !row.createdBlackbaudConstituentId && !row.createRequestStartedAt &&
    (!row.quickCreateStatus || isLegacyContactHold(row)),
  );
}

export function isLegacyContactHold(row) {
  return (row.quickCreateStatus || row.quick_create_status) === "review" &&
    /Multiple contacts of one kind need individual review before quick creation\./.test(row.blackbaudError || row.blackbaud_error || "");
}

// Validate every contact before any NXT lookup. Additional contacts are applied
// through the checkpointed write pipeline, not silently discarded at creation.
export function validateNewRecordContacts(input) {
  for (const [key, label, field] of [["emailUpdates", "email", "address"], ["phoneUpdates", "phone", "number"], ["addressUpdates", "address", "addressLine1"]]) {
    const values = input[key] || [];
    if (!Array.isArray(values)) throw new ImportReviewRequired(`Review the ${label} values before continuing.`);
    if (values.filter((value) => value?.makePrimary === true).length > 1 ||
      (values.length > 1 && !values.some((value) => value?.makePrimary === true) && values.some((value) => value?.makePrimary == null))) {
      throw new ImportReviewRequired(`Choose one primary ${label}, or explicitly mark all as non-primary, before continuing.`);
    }
    const seen = new Set();
    for (const value of values) {
      if (!value || !text(value.type) || !text(value[field])) throw new ImportReviewRequired(`Select an NXT type and value for every ${label}.`);
      if (value.makePrimary != null && typeof value.makePrimary !== "boolean") throw new ImportReviewRequired(`Review the primary selection for each ${label}.`);
      if (label === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value.address))) throw new ImportReviewRequired("The email address needs review.");
      const keyValue = label === "phone" ? text(value.number).replace(/\D/g, "") :
        label === "address" ? [value.addressLine1, value.addressLine2, value.city, value.state, value.postalCode, value.country].map(text).join("|").toLowerCase() : text(value.address).toLowerCase();
      if (!keyValue || seen.has(keyValue)) throw new ImportReviewRequired(`Repeated or invalid ${label} values need review; no duplicate contact will be added.`);
      seen.add(keyValue);
      if (label === "address" && text(value.validFrom)) {
        const match = text(value.validFrom).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match || new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])).toISOString().slice(0, 10) !== text(value.validFrom)) {
          throw new ImportReviewRequired("Address Valid From needs a valid YYYY-MM-DD date before automatic completion.");
        }
      }
    }
  }
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
