// USPS Publication 28, Appendix B: https://pe.usps.com/text/pub28/pub28apb.htm
const US_STATES = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};
const normalize = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[,\s]+/g, " ")
    .trim();
const US_COUNTRIES = new Set([
  "united states",
  "united states of america",
  "us",
  "usa",
  "u.s.",
  "u.s.a.",
]);

export function matchesPreferredLetterAddress(savedAddress, address) {
  const saved = normalize(savedAddress);
  if (!saved || !address) return false;
  const states = [address.state];
  // Vary only NXT's structured state field, never words in the saved street or
  // city. Unknown/foreign countries keep the original exact-text comparison.
  if (US_COUNTRIES.has(normalize(address.country))) {
    const state = normalize(address.state);
    const pair = Object.entries(US_STATES).find(([code, name]) =>
      [normalize(code), normalize(name)].includes(state),
    );
    if (pair) states.push(...pair);
  }
  const candidates = [address.formatted_address];
  for (const state of states) {
    const composed = [
      address.address_lines,
      [address.city, state, address.postal_code].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join("\n");
    candidates.push(
      composed,
      [composed, address.country].filter(Boolean).join("\n"),
    );
  }
  return candidates.filter(Boolean).some((value) => normalize(value) === saved);
}
