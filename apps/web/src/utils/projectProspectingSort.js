import { parseImportDate } from "./importDate";
import { projectAmount, projectGroupKey, projectPrimaryPerson, isProjectGivingColumn } from "./projectProspectRanking";

const collator = new Intl.Collator("en-US", { sensitivity: "base", numeric: true });
export const PROJECT_QUERY_ORDER = Object.freeze({ key: "query", direction: "ascending" });

export function projectSortType(column) {
  if (column.format === "currency" || column.format === "number") return "number";
  const words = column.header.toLowerCase().replace(/[^a-z]+/g, " ").trim().split(/\s+/);
  if (words.includes("id")) return "text";
  if (words.includes("date")) return "date";
  if (words.includes("amount") || words.includes("balance")) return "number";
  return "text";
}

export function projectSortOptions(headers, columns, display) {
  return [
    { key: "ranking", label: "Prospect Ranking", type: "number" },
    { key: "query", label: "Original query order", type: "query" },
    { key: "name", label: "Name / organization", type: "text", header: headers[display.name] },
    ...(display.solicitor >= 0 ? [{ key: "solicitor", label: "Saved solicitor", type: "text", header: headers[display.solicitor] }] : []),
    { key: "tagCount", label: "Number of tags", type: "number" },
    ...columns.filter(c => c.visible && ![display.name, display.solicitor].includes(headers.indexOf(c.header)))
      .map(c => ({ key: `column:${c.header}`, label: c.label || c.header, type: headers.indexOf(c.header) === display.lifetime ? "number" : projectSortType(c), header: c.header })),
  ];
}

function typedValue(value, type) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (type === "number") return projectAmount(text);
  if (type !== "date") return text;
  // Only unambiguous, full-year query dates; never guess locale or partial dates.
  if (!/^\d{4}-\d{1,2}-\d{1,2}$|^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) return null;
  const date = parseImportDate(text);
  return date ? date.y * 10000 + date.m * 100 + date.d : null;
}

const compare = (a, b) => typeof a === "number" && typeof b === "number" ? a - b : collator.compare(a, b);

export function sortProjectGroups(groups, { sort, option, headers, display, assignments, solicitors, matchingPeople, tagsAvailable = true, rankings }) {
  if (!option || option.key === "query") return [...groups];
  const direction = sort.direction === "descending" ? -1 : 1;
  const column = headers.indexOf(option.header);
  function valueFor(group) {
    if (option.key === "ranking") return rankings?.get(projectGroupKey(group))?.score ?? null;
    const primaryGiving = group.members.length > 1 && isProjectGivingColumn(option.header, display, headers);
    const primary = primaryGiving ? projectPrimaryPerson(group, display) : null;
    const members = primaryGiving ? (primary ? [primary] : []) : group.members.filter(p => !matchingPeople || matchingPeople.has(p));
    if (option.key === "tagCount") return tagsAvailable
      ? new Set(members.flatMap(p => [...(assignments.get(p.id) || [])])).size : null;
    const raw = members.flatMap(p => option.key === "solicitor"
      ? (solicitors.get(p.id) || []).filter(s => ["Current in saved data", "Dates not verified"].includes(s.status)).map(s => s.name)
      : (p.values[option.key === "name" ? display.name : column] || []));
    const values = raw.map(value => typedValue(value, option.type)).filter(value => value !== null);
    // Sort by a real member value, never add repeated amounts or spouse totals.
    return values.length ? values.sort(compare)[direction === 1 ? 0 : values.length - 1] : null;
  }
  return groups.map((group, index) => ({ group, index, value: valueFor(group) }))
    .sort((a, b) => a.value === null && b.value !== null ? 1
      : b.value === null && a.value !== null ? -1
      : (a.value !== null && b.value !== null ? compare(a.value, b.value) * direction : 0)
        || collator.compare(a.group.name, b.group.name)
        || collator.compare(a.group.members.map(p => p.id || "").sort().join("/"), b.group.members.map(p => p.id || "").sort().join("/"))
        || a.index - b.index)
    .map(item => item.group);
}

export function orderedProjectPeople(groups, people) {
  const included = new Set(people);
  return groups.flatMap(group => group.members.filter(person => included.has(person)));
}
