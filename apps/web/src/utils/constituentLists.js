export const LIST_SCHEMA = "constituent-list-v1";
export const LEGACY_LIST_KEY = "future-made-phase-ii";
export const isConstituentList = (report) =>
  report?.configurationSchema === LIST_SCHEMA ||
  report?.key === LEGACY_LIST_KEY;

export function validateListSource(value) {
  if (
    !value ||
    value.version !== 1 ||
    value.source !== "custom_field" ||
    Object.keys(value).some(
      (key) =>
        !["version", "source", "fieldCategory", "fieldDescription"].includes(
          key,
        ),
    )
  ) {
    return "Choose a custom-field list source.";
  }
  if (
    typeof value.fieldCategory !== "string" ||
    !value.fieldCategory.trim() ||
    value.fieldCategory.trim().length > 200
  )
    return "Select an NXT custom field category (200 characters or fewer).";
  if (
    typeof value.fieldDescription !== "string" ||
    value.fieldDescription.trim().length > 200
  )
    return "The optional description must be 200 characters or fewer.";
  return "";
}

export function normalizeListSource(value) {
  return {
    version: 1,
    source: "custom_field",
    fieldCategory: value.fieldCategory.trim(),
    fieldDescription: value.fieldDescription.trim(),
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
