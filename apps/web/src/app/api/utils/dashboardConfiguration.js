// Pure, browser-safe schema helpers. Validation precedes normalization at API boundaries.
export const DASHBOARD_SCHEMA = "query-count-dashboard-v1";
export const DASHBOARD_LIMITS = Object.freeze({
  panels: 12,
  values: 100,
  queries: 12,
  queriesPerRefresh: 2,
});
export const QUERY_RESULTS_LIMITS = Object.freeze({
  panels: 4,
  rows: 1000,
  columns: 25,
  bytes: 524288,
  cellCharacters: 2000,
});

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const validKey = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
const validText = (value, max, required = true) =>
  typeof value === "string" &&
  value.length <= max &&
  (!required || Boolean(value.trim()));

export function validateDashboardQueryId(value) {
  return ["string", "number"].includes(typeof value) &&
    /^(?:[1-9]\d*)$/.test(String(value ?? "")) &&
    Number.isSafeInteger(Number(value))
    ? ""
    : "Use a positive numeric saved NXT query system record ID.";
}

export function validateDashboardConfiguration(value) {
  if (!isObject(value) || value.version !== 1)
    return "Dashboard schema version must be 1.";
  if (
    !Array.isArray(value.panels) ||
    value.panels.length > DASHBOARD_LIMITS.panels
  )
    return "Dashboard panels must be an array with at most 12 panels.";
  const panelKeys = new Set();
  const valueKeys = new Set();
  let queries = 0;
  let resultTables = 0;
  for (const panel of value.panels) {
    if (!isObject(panel) || !validKey(panel.key) || panelKeys.has(panel.key))
      return "Panel keys must be valid and unique.";
    panelKeys.add(panel.key);
    if (!validText(panel.title, 120))
      return "Each panel needs a title of at most 120 characters.";
    if (!["rows", "table", "metric", "query_results"].includes(panel.layout))
      return "Unsupported panel layout.";
    if (!["half", "full"].includes(panel.width))
      return "Panel width must be half or full.";
    if (panel.layout === "query_results") {
      resultTables += 1;
      queries += 1;
      if (resultTables > QUERY_RESULTS_LIMITS.panels)
        return "A dashboard accepts at most 4 query results tables.";
      if (queries > DASHBOARD_LIMITS.queries)
        return "A dashboard accepts at most 12 saved-query sources.";
      const queryError = validateDashboardQueryId(panel.queryId);
      if (queryError) return queryError;
      if (
        panel.refreshPolicy !== undefined &&
        !["refreshable", "frozen"].includes(panel.refreshPolicy)
      )
        return "Unsupported refresh policy.";
      for (const dimension of ["rows", "columns", "values"]) {
        if (
          panel[dimension] !== undefined &&
          (!Array.isArray(panel[dimension]) || panel[dimension].length)
        )
          return "Query results tables get their rows and columns from NXT, not manual values.";
      }
      if (
        panel.columnSettings !== undefined &&
        (!Array.isArray(panel.columnSettings) ||
          panel.columnSettings.length > QUERY_RESULTS_LIMITS.columns)
      )
        return "Query results tables accept at most 25 column display settings.";
      const headers = new Set();
      for (const column of panel.columnSettings || []) {
        if (
          !isObject(column) ||
          !validText(column.header, 200) ||
          headers.has(column.header)
        )
          return "Column settings need unique, exact query header names.";
        if (column.label !== undefined && !validText(column.label, 120, false))
          return "Column labels must be at most 120 characters.";
        if (
          column.format !== undefined &&
          !["text", "number", "currency"].includes(column.format)
        )
          return "Unsupported query column display format.";
        headers.add(column.header);
      }
      continue;
    }
    for (const dimension of ["rows", "columns"]) {
      if (
        !Array.isArray(panel[dimension]) ||
        panel[dimension].length > DASHBOARD_LIMITS.values
      )
        return `Panel ${dimension} must be an array with at most 100 entries.`;
      const keys = new Set();
      for (const entry of panel[dimension]) {
        if (
          !isObject(entry) ||
          !validKey(entry.key) ||
          keys.has(entry.key) ||
          !validText(entry.label, 120)
        )
          return `Panel ${dimension} need unique keys and labels of at most 120 characters.`;
        keys.add(entry.key);
      }
    }
    if (!Array.isArray(panel.values)) return "Panel values must be an array.";
    if (panel.layout === "metric" && panel.values.length > 1)
      return "Metric panels accept at most one value.";
    if (
      panel.layout === "metric" &&
      (panel.rows.length !== 1 || panel.columns.length !== 1)
    )
      return "Metric panels require exactly one row and one column.";
    if (
      panel.layout === "rows" &&
      (panel.columns.length !== 1 || !panel.rows.length)
    )
      return "Rows panels require rows and exactly one column.";
    if (
      panel.layout === "table" &&
      (!panel.rows.length || !panel.columns.length)
    )
      return "Table panels require rows and columns.";
    const cells = new Set();
    for (const cell of panel.values) {
      if (!isObject(cell) || !validKey(cell.key) || valueKeys.has(cell.key))
        return "Value keys must be valid and unique across the dashboard.";
      valueKeys.add(cell.key);
      if (valueKeys.size > DASHBOARD_LIMITS.values)
        return "A dashboard accepts at most 100 values.";
      const rowKey = cell.rowKey ?? "";
      const columnKey = cell.columnKey ?? "";
      if (panel.rows.length && !panel.rows.some((row) => row.key === rowKey))
        return "Each value must reference a configured row.";
      if (rowKey && !panel.rows.some((row) => row.key === rowKey))
        return "Unknown value rowKey.";
      if (
        panel.columns.length &&
        !panel.columns.some((column) => column.key === columnKey)
      )
        return "Each value must reference a configured column.";
      if (
        columnKey &&
        !panel.columns.some((column) => column.key === columnKey)
      )
        return "Unknown value columnKey.";
      const position = JSON.stringify([rowKey, columnKey]);
      if (cells.has(position))
        return "A panel cannot have multiple values in the same cell.";
      cells.add(position);
      if (!["query_count", "static"].includes(cell.source))
        return "Value source must be query_count or static.";
      if (cell.note !== undefined && !validText(cell.note, 1000, false))
        return "Value notes must be at most 1,000 characters.";
      if (
        cell.refreshPolicy !== undefined &&
        !["refreshable", "frozen"].includes(cell.refreshPolicy)
      )
        return "Unsupported refresh policy.";
      if (cell.source === "query_count") {
        const error = validateDashboardQueryId(cell.queryId);
        if (error) return error;
        queries += 1;
        if (queries > DASHBOARD_LIMITS.queries)
          return "A dashboard accepts at most 12 saved-query values.";
      } else if (
        cell.staticValue !== null &&
        (typeof cell.staticValue !== "number" ||
          !Number.isFinite(cell.staticValue))
      ) {
        return "Static values must be finite numbers or null for unknown (zero is supported).";
      }
    }
  }
  return "";
}

export function normalizeDashboardConfiguration(value) {
  if (value === undefined || value === null) return { version: 1, panels: [] };
  const error = validateDashboardConfiguration(value);
  if (error) throw new Error(error);
  return {
    version: 1,
    panels: value.panels.map((panel) =>
      panel.layout === "query_results"
        ? {
            key: panel.key,
            title: panel.title.trim(),
            layout: "query_results",
            width: panel.width,
            queryId: String(panel.queryId),
            refreshPolicy: panel.refreshPolicy ?? "refreshable",
            columnSettings: (panel.columnSettings || []).map((column) => ({
              header: column.header,
              label: column.label?.trim() || "",
              format: column.format || "text",
            })),
            rows: [],
            columns: [],
            values: [],
          }
        : {
            key: panel.key,
            title: panel.title.trim(),
            layout: panel.layout,
            width: panel.width,
            rows: panel.rows.map(({ key, label }) => ({
              key,
              label: label.trim(),
            })),
            columns: panel.columns.map(({ key, label }) => ({
              key,
              label: label.trim(),
            })),
            values: panel.values.map((cell) => ({
              key: cell.key,
              rowKey: cell.rowKey ?? "",
              columnKey: cell.columnKey ?? "",
              source: cell.source,
              queryId:
                cell.source === "query_count" ? String(cell.queryId) : "",
              refreshPolicy: cell.refreshPolicy ?? "refreshable",
              staticValue: cell.source === "static" ? cell.staticValue : null,
              note: cell.note?.trim() || "",
            })),
          },
    ),
  };
}

export function getDashboardTableFingerprint(panel) {
  return JSON.stringify([
    1,
    "query_results",
    String(panel.queryId),
    "query-results-csv-v1",
  ]);
}

// Shared by cache publication and rendering; never treat a missing table as an empty one.
export function isValidDashboardTableData(value) {
  if (
    !value ||
    !Array.isArray(value.headers) ||
    !value.headers.length ||
    value.headers.length > QUERY_RESULTS_LIMITS.columns
  )
    return false;
  if (
    value.headers.some((header) => !validText(header, 200)) ||
    new Set(value.headers).size !== value.headers.length
  )
    return false;
  return (
    Array.isArray(value.rows) &&
    value.rows.length <= QUERY_RESULTS_LIMITS.rows &&
    value.rows.every(
      (row) =>
        Array.isArray(row) &&
        row.length === value.headers.length &&
        row.every(
          (cell) =>
            typeof cell === "string" &&
            cell.length <= QUERY_RESULTS_LIMITS.cellCharacters,
        ),
    ) &&
    new TextEncoder().encode(JSON.stringify([value.headers, value.rows]))
      .byteLength <=
      QUERY_RESULTS_LIMITS.bytes * 2
  );
}

// Stable source identity deliberately excludes labels, layout, position, notes and access.
// Refresh policy is not a source change: freezing an existing result must reuse it.
export function getDashboardValueFingerprint(value) {
  return JSON.stringify(
    value.source === "query_count"
      ? [1, "query_count", String(value.queryId), "strict-csv-row-count-v1"]
      : [1, "static", value.staticValue],
  );
}
