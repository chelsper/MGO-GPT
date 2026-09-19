import {
  isQueryList,
  parseListQuery,
  validateListPresentation,
} from "./listQueryConfiguration";
export const LIST_SCHEMA = "constituent-list-v1";
export const LEGACY_LIST_KEY = "future-made-phase-ii";
export const isConstituentList = (report) =>
  report?.configurationSchema === LIST_SCHEMA ||
  report?.key === LEGACY_LIST_KEY;

export function validateListSource(value) {
  if (
    !value ||
    value.version !== 1 ||
    !["custom_field", "query_json", "saved_query"].includes(value.source) ||
    Object.keys(value).some(
      (key) =>
        ![
          "version",
          "source",
          "fieldCategory",
          "fieldDescription",
          "queryJson",
          "queryId",
          "columns",
          "leadFundraiser",
        ].includes(key),
    )
  ) {
    return "Choose a custom-field or query list source.";
  }
  if (
    (value.source !== "saved_query" && Object.hasOwn(value, "queryId")) ||
    (value.source !== "query_json" && Object.hasOwn(value, "queryJson"))
  )
    return "Query fields must match the chosen list source.";
  if (
    typeof value.fieldCategory !== "string" ||
    (!isQueryList(value) && !value.fieldCategory.trim()) ||
    value.fieldCategory.trim().length > 200
  )
    return "Select an NXT custom field category (200 characters or fewer).";
  if (
    typeof value.fieldDescription !== "string" ||
    value.fieldDescription.trim().length > 200
  )
    return "The optional description must be 200 characters or fewer.";
  if (
    value.source === "saved_query" &&
    (typeof value.queryId !== "string" ||
      !/^[1-9]\d*$/.test(value.queryId) ||
      !Number.isSafeInteger(Number(value.queryId)))
  )
    return "Enter a saved NXT query system record ID.";
  if (value.source === "query_json") {
    try {
      parseListQuery(value.queryJson);
    } catch (error) {
      return error.message;
    }
  }
  return validateListPresentation(value);
}

export function normalizeListSource(value) {
  return {
    version: 1,
    source: value.source,
    fieldCategory: value.fieldCategory.trim(),
    fieldDescription: value.fieldDescription.trim(),
    ...(value.source === "saved_query" ? { queryId: value.queryId } : {}),
    ...(value.source === "query_json"
      ? { queryJson: JSON.stringify(parseListQuery(value.queryJson)) }
      : {}),
    ...(value.columns ? { columns: value.columns } : {}),
    ...(value.leadFundraiser ? { leadFundraiser: value.leadFundraiser } : {}),
  };
}

export function listMetadata(key) {
  return {
    key,
    reportType: "constituent_list",
    reportTypeLabel: "Lists",
    configurationSchema: LIST_SCHEMA,
    href: `/reports/lists/${encodeURIComponent(key)}`,
    supportsDataConfiguration: true,
    configurationCapabilities: {
      canEditTitle: true,
      canEditDescription: true,
      dataConfiguration: "constituent_list",
      access: {
        enabled: true,
        mode: "explicit_users",
        allowedVisibilities: ["specific_users"],
        requiresSpecificUsers: true,
        adminRoleBypass: false,
      },
    },
  };
}

export function reportNavigation(reports) {
  const entries = [];
  for (const report of reports) {
    if (isConstituentList(report)) {
      if (!entries.some((entry) => entry.key === "lists"))
        entries.push({ key: "lists", title: "Lists", href: "/reports/lists" });
    } else entries.push(report);
  }
  return entries;
}
