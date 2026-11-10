export const PROJECT_SECTION = "project-prospecting";
export const PROJECT_HREF = "/reports/project-prospecting";
export const PROJECT_TAG_LIMIT = 100;
export const PROJECT_SELECTION_LIMIT = 100;
export const isProjectProspecting = (report) =>
  report?.dataConfiguration?.section === PROJECT_SECTION;

export function projectSource() {
  return { version: 1, source: "saved_query", queryId: "31110",
    fieldCategory: "", fieldDescription: "", section: PROJECT_SECTION, systemIdColumn: "" };
}

export function normalizeProjectTag(value) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name && name.length <= 50 && !/[\u0000-\u001f\u007f]/.test(name)
    ? { name, key: name.toLocaleLowerCase("en-US") } : null;
}

export function projectConstituentId(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[1-9]\d{0,18}$/.test(text) ? text : null;
}

// Only the explicitly mapped NXT system ID identifies a person. Names, lookup
// IDs and query row IDs are never used as a fallback.
export function projectIdentity(snapshot, source) {
  const column = source?.systemIdColumn;
  const headers = snapshot?.headers || [];
  const index = column && column.toLowerCase() !== "qrecid" && headers.filter(h => h === column).length === 1
    ? headers.indexOf(column) : -1;
  if (index < 0) return { index: -1, ids: [], invalidRows: 0,
    error: "You can create tags now. To apply them to people, map the constituent system record ID in project settings. Do not use Lookup ID or qrecid." };
  const rowIds = (snapshot?.tableRows || []).map(row => projectConstituentId(row[index]));
  return { index, rowIds, ids: [...new Set(rowIds.filter(Boolean))],
    invalidRows: rowIds.filter(id => !id).length, error: null };
}

export function projectCsv(headers, rows) {
  const cell = value => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + [headers, ...rows].map(row => row.map(cell).join(",")).join("\r\n");
}
