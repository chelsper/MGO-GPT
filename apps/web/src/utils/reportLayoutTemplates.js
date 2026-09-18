import { validateDashboardConfiguration } from "@/app/api/utils/dashboardConfiguration";

export const REPORT_LAYOUT_FORMAT = "fundraising-report-layout";
export const REPORT_LAYOUT_MAX_BYTES = 131072;
const object = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).every((key) => keys.includes(key));
const text = (value, max) => typeof value === "string" && value.length <= max;

function validateTemplate(template) {
  if (!exactKeys(template, ["format", "version", "title", "description", "panels"]) ||
      template.format !== REPORT_LAYOUT_FORMAT || template.version !== 1) {
    throw new Error("Choose a version 1 report layout exported by this app, not a report data file.");
  }
  if (!text(template.title, 120) || !text(template.description, 1000)) {
    throw new Error("The layout needs a title of at most 120 characters and a description of at most 1,000 characters.");
  }
  if (!Array.isArray(template.panels) || template.panels.length > 12) {
    throw new Error("A report layout can contain at most 12 panels.");
  }
  for (const panel of template.panels) {
    const fields = ["key", "title", "layout", "width"];
    if (panel?.layout !== "query_results") fields.push("rows", "columns", "values");
    if (!exactKeys(panel, fields)) throw new Error("The layout contains unsupported panel fields. Export a layout without data or connections.");
    if (panel.layout === "query_results") continue;
    if (!["rows", "columns", "values"].every((key) => Array.isArray(panel[key]) && panel[key].length <= 100) ||
        !panel.rows.every((entry) => exactKeys(entry, ["key", "label"])) ||
        !panel.columns.every((entry) => exactKeys(entry, ["key", "label"])) ||
        !panel.values.every((entry) => exactKeys(entry, ["key", "rowKey", "columnKey", "source"]))) {
      throw new Error("The layout contains unsupported dimensions or values. Data values are not accepted in a layout.");
    }
  }
  // Validate layout relationships with a temporary ID; it is never returned or saved.
  const error = validateDashboardConfiguration(materialize(template, "1"));
  if (error) throw new Error(error);
}

function materialize(template, queryId = "") {
  return {
    version: 1,
    panels: template.panels.map((panel) => {
      const base = { key: panel.key, title: panel.title, layout: panel.layout, width: panel.width };
      return panel.layout === "query_results"
        ? { ...base, queryId, refreshPolicy: "refreshable", columnSettings: [], rows: [], columns: [], values: [] }
        : {
            ...base,
            rows: panel.rows.map(({ key, label }) => ({ key, label })),
            columns: panel.columns.map(({ key, label }) => ({ key, label })),
            values: panel.values.map(({ key, rowKey, columnKey, source }) => ({
              key, rowKey, columnKey, source,
              queryId: source === "query_count" ? queryId : "",
              refreshPolicy: "refreshable", staticValue: null, note: "",
            })),
          };
    }),
  };
}

export function buildReportLayoutTemplate(draft) {
  const data = draft?.dataConfiguration;
  if (!data || data.version !== 1 || !Array.isArray(data.panels)) throw new Error("This report does not have a supported dashboard layout.");
  const template = {
    format: REPORT_LAYOUT_FORMAT, version: 1,
    title: draft.title, description: draft.description,
    panels: data.panels.map((panel) => ({
      key: panel.key, title: panel.title, layout: panel.layout, width: panel.width,
      ...(panel.layout === "query_results" ? {} : {
        rows: panel.rows?.map(({ key, label }) => ({ key, label })),
        columns: panel.columns?.map(({ key, label }) => ({ key, label })),
        values: panel.values?.map(({ key, rowKey, columnKey, source }) => ({ key, rowKey, columnKey, source })),
      }),
    })),
  };
  validateTemplate(template);
  if (new TextEncoder().encode(JSON.stringify(template, null, 2)).byteLength > REPORT_LAYOUT_MAX_BYTES) throw new Error("This layout exceeds the 128 KB transfer limit.");
  return template;
}

export function parseReportLayoutTemplate(contents) {
  if (typeof contents !== "string" || new TextEncoder().encode(contents).byteLength > REPORT_LAYOUT_MAX_BYTES) throw new Error("Choose a report layout file no larger than 128 KB.");
  let template;
  try { template = JSON.parse(contents); } catch { throw new Error("The file is not valid JSON. Choose an exported report layout."); }
  validateTemplate(template);
  return {
    title: template.title, description: template.description,
    dataConfiguration: materialize(template),
    visibility: "specific_users", specificUserIds: [], active: false,
  };
}

export const REPORT_STARTERS = [
  { key: "query_results", title: "Query results list", description: "Show the rows and columns from one saved NXT query." },
  { key: "query_count", title: "Key metric", description: "Show a saved query's row count as a single number. Not a gift total." },
  { key: "static", title: "Manual comparison", description: "Enter your own values in two side-by-side columns." },
];

export function createReportStarter(kind) {
  let panel;
  if (kind === "query_results") {
    panel = { key: "results", title: "Query results", layout: "query_results", width: "full", queryId: "", refreshPolicy: "refreshable", columnSettings: [], rows: [], columns: [], values: [] };
  } else if (kind === "query_count" || kind === "static") {
    const columns = kind === "query_count"
      ? [{ key: "count", label: "Count" }]
      : [{ key: "current", label: "Current period" }, { key: "previous", label: "Previous period" }];
    panel = {
      key: "summary", title: kind === "query_count" ? "Query row count" : "Period comparison",
      layout: kind === "query_count" ? "metric" : "table", width: kind === "query_count" ? "half" : "full",
      rows: [{ key: "metric", label: "Metric" }], columns,
      values: columns.map(({ key }) => ({ key: `value-${key}`, rowKey: "metric", columnKey: key, source: kind, queryId: "", staticValue: null, note: "", refreshPolicy: "refreshable" })),
    };
  } else { throw new Error("Unknown report starter."); }
  return { version: 1, panels: [panel] };
}
