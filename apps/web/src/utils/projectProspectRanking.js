const normalized = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const DEFAULT_PROSPECT_SORT = Object.freeze({ key: "ranking", direction: "descending" });
export const CONSTITUENCY_TIERS = [
  ["Alumni Bachelor's Degree"],
  ["Alumni Graduate Degree"],
  ["Trustee"],
  ["Parent - Current"],
  ["Trustee - Former"],
  ["Alumni non-graduate", "Friend", "Parent - Former", "Employee", "Employee - Former"],
];

export function projectAmount(value) {
  const text = String(value ?? "").trim();
  const match = /^(\()?([-+])?\$?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(\))?$/.exec(text);
  if (!match || Boolean(match[1]) !== Boolean(match[4]) || (match[1] && match[2])) return null;
  const amount = Number(`${match[1] ? "-" : match[2] || ""}${match[3].replaceAll(",", "")}`);
  return Number.isFinite(amount) && Math.abs(amount) <= Number.MAX_SAFE_INTEGER ? amount : null;
}

export function projectPrimaryPerson(group, display) {
  if (group.members.length === 1) return group.members[0];
  if (!(display.head >= 0)) return null;
  const flags = group.members.map(person => {
    const values = (person.values[display.head] || []).map(normalized);
    if (!values.length) return null;
    const parsed = values.map(value => ["yes", "true", "1", "y"].includes(value) ? true : ["no", "false", "0", "n"].includes(value) ? false : null);
    return parsed.includes(null) || new Set(parsed).size !== 1 ? "conflict" : parsed[0];
  });
  return flags.includes("conflict") || flags.filter(flag => flag === true).length !== 1
    ? null : group.members[flags.indexOf(true)];
}

export function isProjectGivingColumn(header, display, headers) {
  const name = normalized(header);
  return (display.lifetime >= 0 && headers.indexOf(header) === display.lifetime) || /^(last|largest|first)gift/.test(name)
    || ["lifetimegiving", "totallifetimegiving", "lifetimegivingamount", "lifetimegivingtotal"].includes(name);
}

export const projectGroupKey = group => JSON.stringify(group.members.map(p => p.id ? `id:${p.id}` : `row:${JSON.stringify(p.row)}`).sort());

function bestConstituency(group, display) {
  const fields = group.members.length > 1 ? [display.constituency, display.spouseConstituency] : [display.constituency];
  const values = group.members.flatMap(p => fields.flatMap(field => p.values[field] || []));
  for (const [index, names] of CONSTITUENCY_TIERS.entries()) {
    const match = values.find(value => names.some(name => normalized(value) === normalized(name)));
    if (match) return { tier: index + 1, label: match, score: (5 - index) * 20 };
  }
  return null;
}

// Midrank percentiles give tied values equal credit and keep dollar outliers
// from overwhelming the other two equally weighted components.
function percentile(value, population) {
  if (population.length <= 1) return 50;
  const below = population.filter(other => other < value).length;
  const tied = population.filter(other => other === value).length;
  return 100 * (below + (tied - 1) / 2) / (population.length - 1);
}

export function projectProspectRankings(groups, { display, assignments, tagsAvailable = true }) {
  const entries = groups.map(group => {
    const primary = projectPrimaryPerson(group, display);
    const constituency = bestConstituency(group, display);
    const types = group.members.map(p => {
      const values = (p.values[display.indicator] || []).map(normalized);
      const parsed = values.map(value => ["organization", "organisation", "o"].includes(value) ? "organization" : ["individual", "i"].includes(value) ? "individual" : null);
      return parsed.length && !parsed.includes(null) && new Set(parsed).size === 1 ? parsed[0] : null;
    });
    const organization = types.includes("organization");
    const raw = primary?.values[display.lifetime] || [];
    const amounts = raw.map(projectAmount);
    const lifetime = raw.length && !amounts.includes(null) && new Set(amounts).size === 1 ? amounts[0] : null;
    const tagCount = new Set(group.members.flatMap(p => [...(assignments.get(p.id) || [])])).size;
    const reason = group.members.some(p => !p.id) ? "Constituent identity is not verified."
      : !tagsAvailable ? "Tags are not available yet."
      : types.includes(null) || (group.members.length > 1 && organization) ? "Individual / organization indicator is missing or conflicting."
      : !primary ? "Head of household is missing or conflicting."
      : lifetime === null ? "Lifetime giving is missing or conflicting."
      : !organization && !constituency ? "No matching constituency in the saved output."
      : "";
    return { key: projectGroupKey(group), primary, constituency, lifetime, tagCount, organization, reason, score: null };
  });
  const eligible = entries.filter(entry => !entry.reason);
  const giving = eligible.map(entry => entry.lifetime), counts = eligible.map(entry => entry.tagCount);
  for (const entry of eligible) {
    entry.givingScore = percentile(entry.lifetime, giving);
    entry.tagScore = percentile(entry.tagCount, counts);
    entry.score = entry.organization ? (entry.givingScore + entry.tagScore) / 2
      : (entry.constituency.score + entry.givingScore + entry.tagScore) / 3;
  }
  return new Map(entries.map(entry => [entry.key, entry]));
}
