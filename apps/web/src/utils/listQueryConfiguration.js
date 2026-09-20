export const LEAD_COLUMN = "Current lead fundraiser";
export const isQueryList = (source) =>
  ["query_json", "saved_query"].includes(source?.source);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;

export function parseListQuery(text) {
  if (typeof text !== "string" || text.length > 64000)
    throw new Error("Query JSON must be 64,000 characters or fewer.");
  let query;
  try {
    query = JSON.parse(text);
  } catch {
    throw new Error(
      "Paste valid query JSON, not a query result or an escaped HTML copy.",
    );
  }
  const allowed = [
    "advanced_processing_options",
    "category_id",
    "constituent_filters",
    "filter_fields",
    "format",
    "gift_processing_options",
    "name",
    "others_can_execute",
    "others_can_modify",
    "select_fields",
    "sort_fields",
    "suppress_duplicates",
    "type_id",
    "sql_generation_mode",
    "result_layout",
  ];
  if (
    !object(query) ||
    Object.keys(query).some((key) => !allowed.includes(key)) ||
    query.type_id !== 18 ||
    query.format !== "Dynamic"
  )
    throw new Error(
      "Use a Dynamic constituent query (type_id 18). Raw SQL and unknown definition fields are not supported.",
    );
  if (query.sql_generation_mode && query.sql_generation_mode !== "Query")
    throw new Error("Only Query generation mode is supported.");
  if (query.result_layout && query.result_layout !== "MultiRow")
    throw new Error("Use MultiRow query results.");
  if (
    !Array.isArray(query.select_fields) ||
    !query.select_fields.length ||
    query.select_fields.length > 24 ||
    query.select_fields.some(
      (field) =>
        !object(field) ||
        !positive(field.query_field_id) ||
        Object.keys(field).some((key) => key !== "query_field_id"),
    )
  )
    throw new Error(
      "Select 1 to 24 query output fields, each with a numeric query_field_id.",
    );
  if (
    !Array.isArray(query.filter_fields) ||
    query.filter_fields.length > 100 ||
    query.filter_fields.some(
      (field) =>
        !object(field) ||
        !positive(field.query_field_id) ||
        typeof field.operator !== "string" ||
        !Array.isArray(field.filter_values) ||
        field.filter_values.some(
          (value) => !["string", "number", "boolean"].includes(typeof value),
        ),
    )
  )
    throw new Error(
      "Query filters must include field IDs, operators, and simple filter values.",
    );
  if (
    query.sort_fields !== undefined &&
    (!Array.isArray(query.sort_fields) ||
      query.sort_fields.length > 25 ||
      query.sort_fields.some(
        (field) =>
          !object(field) ||
          !positive(field.query_field_id) ||
          !["Ascending", "Descending"].includes(field.sort_order),
      ))
  )
    throw new Error(
      "Query sort fields must use field IDs and Ascending or Descending order.",
    );
  // Sharing flags never control app permissions or modify the saved NXT query.
  const { others_can_execute, others_can_modify, ...execution } = query;
  return execution;
}

export function validateListPresentation(source) {
  const columns = source.columns;
  if (
    columns !== undefined &&
    (!Array.isArray(columns) ||
      columns.length > 25 ||
      new Set(columns.map((column) => column?.header)).size !==
        columns.length ||
      columns.some(
        (column) =>
          !object(column) ||
          Object.keys(column).some(
            (key) => !["header", "label", "visible", "format"].includes(key),
          ) ||
          typeof column.header !== "string" ||
          !column.header.trim() ||
          column.header.length > 200 ||
          typeof column.label !== "string" ||
          column.label.length > 200 ||
          typeof column.visible !== "boolean" ||
          !["text", "number", "currency"].includes(column.format),
      ))
  )
    return "Choose valid, unique display columns (25 maximum).";
  const lead = source.leadFundraiser;
  if (
    lead !== undefined &&
    (!object(lead) ||
      Object.keys(lead).some(
        (key) =>
          !["enabled", "systemIdColumn", "assignmentTypes"].includes(key),
      ) ||
      typeof lead.enabled !== "boolean" ||
      typeof lead.systemIdColumn !== "string" ||
      lead.systemIdColumn.length > 200 ||
      !Array.isArray(lead.assignmentTypes) ||
      lead.assignmentTypes.length > 10 ||
      lead.assignmentTypes.some(
        (role) => typeof role !== "string" || !role.trim() || role.length > 200,
      ))
  )
    return "Choose valid current lead fundraiser settings.";
  if (lead?.enabled && !lead.assignmentTypes.length)
    return "Enter the exact NXT lead assignment type.";
  // Mapping can be chosen after the first output preview; enrichment still fails closed.
  return "";
}

// Scope discovered headers to the query, not display settings or ID mapping edits.
export function listOutputSourceKey(source) {
  if (!source) return null;
  try {
    const definition =
      source.source === "query_json"
        ? parseListQuery(source.queryJson)
        : source.source === "saved_query"
          ? { queryId: source.queryId }
          : {
              fieldCategory: source.fieldCategory,
              fieldDescription: source.fieldDescription,
            };
    const canonical = (value) =>
      Array.isArray(value)
        ? value.map(canonical)
        : object(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, canonical(value[key])]),
            )
          : value;
    return JSON.stringify([source.source, canonical(definition)]);
  } catch {
    return null;
  }
}

export const defaultLegacyListSource = () => ({
  version: 1,
  source: "custom_field",
  fieldCategory: "Prospect Research",
  fieldDescription: "Future. Made. Phase II",
});

export function orderedListColumns(headers, settings = []) {
  const byHeader = new Map(settings.map((column) => [column.header, column]));
  return [
    ...settings
      .map((column) => column.header)
      .filter((header) => headers.includes(header)),
    ...headers.filter((header) => !byHeader.has(header)),
  ]
    .filter((header) => header.toLowerCase() !== "qrecid")
    .map((header) => ({
      header,
      label: header,
      visible: true,
      format: "text",
      ...byHeader.get(header),
    }));
}
