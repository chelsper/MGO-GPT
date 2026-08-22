const ADDRESS_TOKEN_ALIASES = new Map([
  ["avenue", "ave"],
  ["ave", "ave"],
  ["boulevard", "blvd"],
  ["blvd", "blvd"],
  ["circle", "cir"],
  ["cir", "cir"],
  ["court", "ct"],
  ["ct", "ct"],
  ["drive", "dr"],
  ["dr", "dr"],
  ["highway", "hwy"],
  ["hwy", "hwy"],
  ["lane", "ln"],
  ["ln", "ln"],
  ["parkway", "pkwy"],
  ["pkwy", "pkwy"],
  ["place", "pl"],
  ["pl", "pl"],
  ["road", "rd"],
  ["rd", "rd"],
  ["square", "sq"],
  ["sq", "sq"],
  ["street", "st"],
  ["st", "st"],
  ["terrace", "ter"],
  ["ter", "ter"],
  ["trail", "trl"],
  ["trl", "trl"],
  ["way", "way"],
  ["north", "n"],
  ["n", "n"],
  ["south", "s"],
  ["s", "s"],
  ["east", "e"],
  ["e", "e"],
  ["west", "w"],
  ["w", "w"],
  ["northeast", "ne"],
  ["ne", "ne"],
  ["northwest", "nw"],
  ["nw", "nw"],
  ["southeast", "se"],
  ["se", "se"],
  ["southwest", "sw"],
  ["sw", "sw"],
  ["apartment", "unit"],
  ["apt", "unit"],
  ["suite", "unit"],
  ["ste", "unit"],
  ["unit", "unit"],
]);

const STATE_ALIASES = new Map([
  ["florida", "fl"],
  ["fl", "fl"],
]);

export function normalizeContactText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizePostalCode(value) {
  return String(value || "").replace(/[^0-9a-z]/gi, "").toLowerCase();
}

export function normalizeAddressLine(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/\bp\.?\s*o\.?\s+box\b/g, "po box")
    .replace(/\bpost\s+office\s+box\b/g, "po box")
    .replace(/#\s*/g, " unit ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((token) => ADDRESS_TOKEN_ALIASES.get(token) || token)
    .join(" ");
}

function getAddressLines(address) {
  return [address?.addressLine1, address?.addressLine2]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function normalizeAddressState(value) {
  const normalized = normalizeContactText(value);
  return STATE_ALIASES.get(normalized) || normalized;
}

// Compare the complete street address so an NXT one-line address and a CSV
// two-line address (for example, a separate apartment number) are equivalent.
export function addressesEquivalent(currentAddress, proposedAddress) {
  if (!currentAddress || !proposedAddress) return false;

  const currentStreet = normalizeAddressLine(getAddressLines(currentAddress));
  const proposedStreet = normalizeAddressLine(getAddressLines(proposedAddress));
  if (!currentStreet || !proposedStreet || currentStreet !== proposedStreet) return false;

  const currentCity = normalizeContactText(currentAddress.city);
  const proposedCity = normalizeContactText(proposedAddress.city);
  if (currentCity && proposedCity && currentCity !== proposedCity) return false;

  const currentState = normalizeAddressState(currentAddress.state);
  const proposedState = normalizeAddressState(proposedAddress.state);
  if (currentState && proposedState && currentState !== proposedState) return false;

  const currentPostal = normalizePostalCode(currentAddress.postalCode).slice(0, 5);
  const proposedPostal = normalizePostalCode(proposedAddress.postalCode).slice(0, 5);
  if (currentPostal && proposedPostal && currentPostal !== proposedPostal) return false;

  return true;
}
