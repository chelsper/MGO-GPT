export const IMPORT_MATCH_CRITERIA_VERSION = 2;
const text = (value) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
export const normalizeMatchName = (value) => text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const email = (value) => text(value?.address || value).toLowerCase();
const zip = (value) => text(value).match(/^\d{5}(?:-?\d{4})?$/)?.[0].slice(0, 5) || "";
const phone = (value) => {
  const digits = text(value?.number || value).replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.length === 10 ? digits : "";
};

function personNames(value) {
  const raw = { ...value.raw, ...value };
  const displayName = text(value.constituentName || value.name || raw.name);
  const parts = /^(?:Unnamed constituent|NXT constituent \d+)$/i.test(displayName) ? [] : displayName.replace(/\b(?:jr|sr|ii|iii|iv)\.?$/i, "").trim().split(/\s+/);
  return {
    firstName: text(value.firstName || raw.first_name || raw.first) || (parts.length > 1 ? parts[0] : ""),
    lastName: text(value.lastName || raw.last_name || raw.last) || (parts.length > 1 ? parts.at(-1) : ""),
  };
}

export function normalizeImportMatchCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const raw = { ...candidate.raw, ...candidate };
  const id = text(candidate.blackbaudConstituentId || candidate.constituentId || raw.record_id || raw.id);
  if (!id) return null;
  const names = personNames(candidate);
  return {
    blackbaudConstituentId: id,
    lookupId: text(candidate.lookupId || candidate.blackbaudLookupId || raw.lookup_id || raw.constituent_id),
    name: text(candidate.name) || [names.firstName, raw.middle_name || raw.middle, names.lastName].map(text).filter(Boolean).join(" ") || text(raw.display_name || raw.org_name) || "Unnamed constituent",
    ...names,
    preferredName: text(candidate.preferredName || raw.preferred_name),
    email: email(candidate.email || raw.primary_email),
    email2: email(candidate.email2 || raw.matched_email),
    phone: text(candidate.phone?.number || candidate.phone || raw.primary_phone || raw.matched_phone),
    address: text(candidate.address?.address_lines || candidate.address || candidate.addressLine1 || raw.address_block),
    postalCode: text(candidate.postalCode || candidate.address?.postal_code || raw.address_post_code),
    reason: text(candidate.reason),
    matchCategory: text(candidate.matchCategory),
    matchRank: Number(candidate.matchRank) || 0,
  };
}

export function streetParts(value) {
  const aliases = { street: "st", road: "rd", avenue: "ave", boulevard: "blvd", drive: "dr", lane: "ln", court: "ct", place: "pl", highway: "hwy", terrace: "ter", circle: "cir", north: "n", south: "s", east: "e", west: "w" };
  const line = text(value).toLowerCase();
  const unit = line.match(/(?:\s|\n)(?:apt\.?|apartment|suite|ste\.?|unit|#)\s*([\w-]+)/i);
  const street = line.slice(0, unit?.index ?? line.length).split(/\r?\n/)[0];
  const tokens = street.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).map((token) => aliases[token] || token);
  return { house: /^\d+[a-z]?$/.test(tokens[0] || "") ? tokens[0] : "", street: tokens.slice(1).join(" "), unit: normalizeMatchName(unit?.[1]), tokens };
}

export function matchingHouseholdAddress(left, right) {
  if (!zip(left.postalCode) || zip(left.postalCode) !== zip(right.postalCode)) return false;
  const a = streetParts([left.addressLine1 || left.address, left.addressLine2].filter(Boolean).join("\n"));
  const b = streetParts([right.addressLine1 || right.address, right.addressLine2].filter(Boolean).join("\n"));
  return Boolean(a.house && a.street && a.house === b.house && a.street === b.street && !(a.unit && b.unit && a.unit !== b.unit));
}

function similarFirstName(a, b, preferred) {
  if (!a || !b) return false;
  if (a === normalizeMatchName(preferred)) return true;
  const groups = ["robert bob rob bobby", "william bill will billy", "elizabeth liz beth betty", "james jim jimmy", "richard rick dick", "katherine kathryn kate kathy", "margaret meg maggie peggy", "jennifer jen jenny", "michael mike", "christopher chris", "joseph joe", "thomas tom", "patricia pat patty", "susan sue", "stephen steven steve"];
  if (groups.some((group) => { const names = group.split(" "); return names.includes(a) && names.includes(b); })) return true;
  // One edit only, and never broaden initials or very short first names.
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Search rank is not evidence. This classifier is shared by preview, final
// duplicate checks, local-file checks, and the review UI.
export function importMatchEvidence(input, value) {
  const candidate = normalizeImportMatchCandidate(value);
  if (!candidate) return { category: "", rank: 0, reasons: [], nameConflict: false };
  const a = personNames(input), b = personNames(candidate);
  const first = normalizeMatchName(a.firstName), last = normalizeMatchName(a.lastName);
  const otherFirst = normalizeMatchName(b.firstName), otherLast = normalizeMatchName(b.lastName);
  const sameName = Boolean(first && last && first === otherFirst && last === otherLast);
  const nameConflict = Boolean(first && last && otherFirst && otherLast && !sameName);
  const reasons = [];
  const sameId = text(input.blackbaudConstituentId) && text(input.blackbaudConstituentId) === candidate.blackbaudConstituentId;
  const sameLookup = text(input.lookupId) && text(input.lookupId) === candidate.lookupId;
  const identifierConflict = Boolean((sameId && text(input.lookupId) && candidate.lookupId && !sameLookup) || (sameLookup && text(input.blackbaudConstituentId) && !sameId));
  if (sameId) reasons.push("Exact NXT system ID");
  if (sameLookup) reasons.push("Exact Lookup ID");
  const emails = [input.email, input.email2].map(email).filter(Boolean);
  const sameEmail = [candidate.email, candidate.email2].some((value) => value && emails.includes(email(value)));
  if (sameEmail) reasons.push("Exact email address; shared addresses still need identity comparison");
  if (sameName) reasons.push("Exact first and last name (middle names ignored)");
  const household = matchingHouseholdAddress(input, candidate);
  if (household) reasons.push("Same house number, normalized street, and ZIP first five; possible household, not proof of identity");
  const samePhone = Boolean(phone(input.phone) && phone(input.phone) === phone(candidate.phone));
  const supportedName = last && last === otherLast && similarFirstName(first, otherFirst, candidate.preferredName) && (samePhone || household);
  if (!sameName && supportedName) reasons.push(`Similar first name and exact last name, supported by ${samePhone ? "exact phone" : "address and ZIP"}`);
  if ((sameId || sameLookup || sameEmail) && nameConflict) reasons.push("Names differ; compare before selecting this record");
  if (identifierConflict) reasons.push("The supplied system ID and Lookup ID do not identify the same record; resolve before updating");
  const rank = sameId || sameLookup ? 100 : sameEmail ? 90 : sameName ? 70 : supportedName ? 60 : household ? 40 : 0;
  return { category: rank >= 90 && !nameConflict && !identifierConflict ? "Strong match" : rank >= 60 ? "Needs comparison" : household ? "Possible household" : "", rank, reasons, nameConflict, identityConflict: nameConflict || identifierConflict };
}

export function qualifyImportMatchCandidates(input, values) {
  return values.map((value) => {
    const candidate = normalizeImportMatchCandidate(value);
    const evidence = importMatchEvidence(input, candidate);
    return candidate && evidence.rank ? { ...candidate, matchCategory: evidence.category, matchRank: evidence.rank, reason: evidence.reasons.join("; ") } : null;
  }).filter(Boolean).sort((a, b) => b.matchRank - a.matchRank || a.name.localeCompare(b.name));
}
