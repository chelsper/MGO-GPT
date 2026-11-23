import { LEAD_COLUMN } from "./listQueryConfiguration";
import { parseImportDate } from "./importDate";

export const PROJECT_DISPLAY_FIELDS = ["nameColumn", "lookupIdColumn", "spouseIdColumn", "maritalStatusColumn", "solicitorColumn", "solicitorTypeColumn", "solicitorFromColumn", "solicitorToColumn", "headOfHouseholdColumn", "constituencyColumn", "spouseConstituencyColumn", "lifetimeGivingColumn", "keyIndicatorColumn"];
const key = value => String(value || "").toLowerCase().replace(/\b\d+\b/g, "").replace(/[^a-z]/g, "");
const married = value => ["married", "alummarriedtoalum", "alumnimarriedtoalumni"].includes(key(value));
const one = values => values?.length === 1 ? values[0].trim() : "";

export function projectDisplayColumns(headers, source) {
  const config = source?.projectDisplay || {};
  function column(field, aliases) {
    if (Object.hasOwn(config, field)) return config[field] && headers.filter(h => h === config[field]).length === 1 ? headers.indexOf(config[field]) : -1;
    const matches = headers.map((h, i) => aliases.includes(key(h)) ? i : -1).filter(i => i >= 0);
    return matches.length === 1 ? matches[0] : -1;
  }
  const spouseType = config.spouseIdType || "lookup";
  return {
    name: column("nameColumn", ["name", "constituentname", "constituentfullname"]),
    lookup: column("lookupIdColumn", ["constituentid", "lookupid"]),
    spouse: column("spouseIdColumn", spouseType === "system" ? ["spousesystemrecordid", "spouseconstituentsystemrecordid"] : ["spouseconstituentid", "spouseid"]),
    marital: column("maritalStatusColumn", ["maritalstatus", "constituentmaritalstatus"]),
    solicitor: column("solicitorColumn", [key(LEAD_COLUMN), "assignedfundraisersname", "assignedfundraisername", "solicitorname", "solicitorassignment"]),
    solicitorType: column("solicitorTypeColumn", ["assignedfundraisertype", "assignedfundraiserstype"]),
    solicitorFrom: column("solicitorFromColumn", ["assignedfundraiserdatefrom", "assignedfundraisersdatefrom"]),
    solicitorTo: column("solicitorToColumn", ["assignedfundraiserdateto", "assignedfundraisersdateto"]),
    indicator: column("keyIndicatorColumn", ["keyindicator", "constituentkeyindicator"]),
    head: column("headOfHouseholdColumn", ["headofhousehold", "constituentheadofhousehold", "isheadofhousehold"]),
    constituency: column("constituencyColumn", ["constituency", "constituencycode", "constituencydescription", "constituentconstituency", "constituentconstituencycode", "constituentcode", "constituentcodes"]),
    spouseConstituency: column("spouseConstituencyColumn", ["spouseconstituency", "spouseconstituencycode", "spouseconstituencydescription", "spouseconstituentcode", "spouseconstituentcodes"]),
    lifetime: column("lifetimeGivingColumn", ["lifetimegiving", "lifetimegivingamount", "totallifetimegiving", "lifetimegivingtotal", "constituentlifetimegiving"]),
    spouseType,
  };
}

export const projectPersonName = (person, display) => person.values[display.name]?.[0] || (person.id ? `Constituent ${person.id}` : "Unidentified query row");

export function projectSolicitors(snapshot, identity, display, today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })) {
  const byPerson = new Map();
  const date = value => {
    const parsed = /^\d{4}-\d{1,2}-\d{1,2}$|^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value) && parseImportDate(value);
    return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}` : null;
  };
  for (const [index, row] of snapshot.tableRows.entries()) {
    const id = identity.rowIds?.[index], name = row[display.solicitor]?.trim();
    if (!id || !name) continue;
    const type = row[display.solicitorType]?.trim() || "";
    const from = row[display.solicitorFrom]?.trim() || "", to = row[display.solicitorTo]?.trim() || "";
    const start = date(from), end = date(to);
    const uncertain = display.solicitorFrom < 0 || display.solicitorTo < 0 || (from && !start) || (to && !end) || (start && end && start > end);
    const status = uncertain ? "Dates not verified" : start && start > today ? "Future" : end && end < today ? "Ended" : "Current in saved data";
    if (!byPerson.has(id)) byPerson.set(id, new Map());
    // Preserve each original row's name/type/date association before deduplication.
    byPerson.get(id).set(JSON.stringify([name, type, from, to]), { name, type, from, to, status });
  }
  return new Map([...byPerson].map(([id, entries]) => [id, [...entries.values()]]));
}

export function projectHouseholds(people, display, enabled = true) {
  const byId = new Map(people.filter(p => p.id).map(p => [p.id, p]));
  const groups = new Map(), used = new Set(), warnings = new Set();
  const missing = display.spouse < 0 || display.marital < 0 || (display.spouseType === "lookup" && display.lookup < 0);
  if (enabled && !missing) {
    const lookup = new Map();
    for (const p of people) {
      const id = display.spouseType === "system" ? p.id : one(p.values[display.lookup]);
      if (id) lookup.set(id, lookup.has(id) ? null : p);
    }
    const targets = new Map(), neighbors = new Map();
    const eligible = p => p.id && lookup.get(display.spouseType === "system" ? p.id : one(p.values[display.lookup])) === p &&
      p.values[display.marital]?.length === 1 && married(p.values[display.marital][0]) &&
      !p.values[display.indicator]?.some(v => ["organization", "organisation", "o"].includes(key(v)));
    for (const p of people) {
      if (!p.id) continue;
      const values = p.values[display.spouse] || [];
      const target = values.length === 1 ? lookup.get(values[0].trim()) : null;
      targets.set(p.id, values.length ? target?.id || "unresolved" : null);
      if (values.length > 1 || target?.id === p.id) warnings.add(p.id);
      if (target?.id && target.id !== p.id) {
        for (const [a, b] of [[p.id, target.id], [target.id, p.id]]) {
          if (!neighbors.has(a)) neighbors.set(a, new Set());
          neighbors.get(a).add(b);
        }
      }
    }
    // Only isolated pairs are households. Never transitively combine relationship chains.
    for (const p of people) {
      if (!p.id || used.has(p.id) || !neighbors.has(p.id)) continue;
      const links = neighbors.get(p.id);
      if (links.size !== 1) { warnings.add(p.id); continue; }
      const other = byId.get([...links][0]);
      if (!other || neighbors.get(other.id)?.size !== 1 || warnings.has(p.id) || warnings.has(other.id) ||
        !eligible(p) || !eligible(other) || ![other.id, null].includes(targets.get(p.id)) || ![p.id, null].includes(targets.get(other.id))) {
        warnings.add(p.id); warnings.add(other?.id); continue;
      }
      const members = [p, other];
      groups.set(p.id, members); used.add(p.id); used.add(other.id);
    }
  }
  const emitted = new Set(), rows = [];
  for (const p of people) {
    if (p.id && emitted.has(p.id)) continue;
    const members = groups.get(p.id) || (used.has(p.id) ? null : [p]);
    if (!members) continue;
    members.forEach(m => { if (m.id) emitted.add(m.id); });
    rows.push({ members, name: members.map(m => projectPersonName(m, display)).join(" & ") });
  }
  return { rows, missing: enabled && missing, grouped: rows.filter(r => r.members.length > 1).length, warnings: [...warnings].filter(Boolean).length };
}

// Export individuals, with household context, so a spouse never inherits another's tags.
export function projectExportData({ people, households, columns, headers, tags, assignments, archivedIds, display }) {
  const membership = new Map();
  households.forEach(group => group.members.forEach(p => membership.set(p, group)));
  return {
    headers: [...columns.map(c => c.label || c.header), "Project tags", "Household", "Household system IDs", "Project status", ...tags.map(tag => `Tag: ${tag.name}`)],
    rows: people.map(p => {
      const group = membership.get(p);
      const ownTags = assignments.get(p.id);
      return [...columns.map(c => p.values[headers.indexOf(c.header)].join("\n")),
        tags.filter(t => ownTags?.has(t.id)).map(t => t.name).join("; "),
        group?.members.length > 1 ? group.name : "", group?.members.length > 1 ? group.members.map(m => m.id).join("; ") : "",
        archivedIds.has(p.id) ? "Archived" : "Active", ...tags.map(t => ownTags?.has(t.id) ? "Yes" : "")];
    }),
  };
}
