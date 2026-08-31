export const REPORT_TYPES = Object.freeze({
  QUERY_BASED: "query_based",
  CUSTOM_FIELD: "custom_field",
  MGO_GPT: "mgo_gpt",
});

const STANDARD_VISIBILITY_OPTIONS = Object.freeze([
  "all_users",
  "executive",
  "specific_users",
]);

const STANDARD_REPORT_CONFIGURATION_CAPABILITIES = Object.freeze({
  canEditTitle: true,
  canEditDescription: true,
  access: Object.freeze({
    enabled: true,
    mode: "visibility",
    allowedVisibilities: STANDARD_VISIBILITY_OPTIONS,
    requiresSpecificUsers: true,
    adminRoleBypass: true,
  }),
  dataConfiguration: null,
});

const CUSTOM_FIELD_REPORT_CONFIGURATION_CAPABILITIES = Object.freeze({
  canEditTitle: true,
  canEditDescription: true,
  access: Object.freeze({
    enabled: true,
    mode: "explicit_users",
    allowedVisibilities: Object.freeze(["specific_users"]),
    requiresSpecificUsers: true,
    adminRoleBypass: false,
  }),
  dataConfiguration: null,
});

const ALUMNI_FAMILY_DASHBOARD_CONFIGURATION_CAPABILITIES = Object.freeze({
  ...STANDARD_REPORT_CONFIGURATION_CAPABILITIES,
  dataConfiguration: "alumni_family_dashboard",
});

export const PORTFOLIO_GIVING_REPORT_KEY = "portfolio-fy-giving";
export const FUTURE_MADE_PHASE_TWO_REPORT_KEY = "future-made-phase-ii";
export const EXECUTIVE_TEAM_STANDINGS_REPORT_KEY = "executive-team-standings";
export const ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY = "alumni-family-engagement";

export const REPORT_TYPE_DEFINITIONS = Object.freeze({
  [REPORT_TYPES.QUERY_BASED]: Object.freeze({
    key: REPORT_TYPES.QUERY_BASED,
    label: "Query-Based Reports",
    description:
      "Reports backed by approved, count-only NXT Query API definitions and saved snapshots.",
  }),
  [REPORT_TYPES.CUSTOM_FIELD]: Object.freeze({
    key: REPORT_TYPES.CUSTOM_FIELD,
    label: "Custom Field Reports",
    description:
      "Reports defined by exact NXT custom-field category and description values.",
  }),
  [REPORT_TYPES.MGO_GPT]: Object.freeze({
    key: REPORT_TYPES.MGO_GPT,
    label: "MGO GPT Reports",
    description:
      "Built-in JUMGOGPT reports using portfolio and workspace data.",
  }),
});

// Legacy custom-field reports remain readable for audit purposes, but new report
// configuration is intentionally limited to supported query-backed and built-in reports.
const CONFIGURABLE_REPORT_TYPE_KEYS = Object.freeze([
  REPORT_TYPES.QUERY_BASED,
  REPORT_TYPES.MGO_GPT,
]);

export const STANDARD_REPORT_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: PORTFOLIO_GIVING_REPORT_KEY,
    reportType: REPORT_TYPES.MGO_GPT,
    adapterKey: "portfolio-fy-giving",
    configurationSchema: "standard-report-v1",
    configurationSchemaVersion: 1,
    href: "/reports",
    title: "My Reports",
    description: "Review current fiscal-year portfolio giving and shared engagement reports.",
    audienceMode: "portfolio",
    dataConfigurationType: null,
    configurationCapabilities: STANDARD_REPORT_CONFIGURATION_CAPABILITIES,
    presentationNote: "",
    presentationNoteTone: "neutral",
  }),
  Object.freeze({
    key: FUTURE_MADE_PHASE_TWO_REPORT_KEY,
    reportType: REPORT_TYPES.QUERY_BASED,
    adapterKey: "future-made-phase-ii",
    configurationSchema: "standard-report-v1",
    configurationSchemaVersion: 1,
    href: "/reports/future-made-phase-ii",
    title: "Future. Made. Phase II",
    description:
      "View every constituent returned by the saved Future. Made. Phase II NXT query.",
    audienceMode: "shared_snapshot",
    dataConfigurationType: null,
    configurationCapabilities: STANDARD_REPORT_CONFIGURATION_CAPABILITIES,
    presentationNote:
      "This report uses the saved Future. Made. Phase II NXT query and a shared snapshot. Standard report visits do not make a new NXT request.",
    presentationNoteTone: "info",
  }),
  Object.freeze({
    key: EXECUTIVE_TEAM_STANDINGS_REPORT_KEY,
    reportType: REPORT_TYPES.MGO_GPT,
    adapterKey: "executive-team-standings",
    configurationSchema: "standard-report-v1",
    configurationSchemaVersion: 1,
    href: "/reports/executive-team-standings",
    title: "Executive Team Standings",
    description:
      "Compare local portfolio health, pipeline, and follow-up coverage across active MGOs.",
    audienceMode: "team_standings",
    dataConfigurationType: null,
    configurationCapabilities: STANDARD_REPORT_CONFIGURATION_CAPABILITIES,
    presentationNote:
      "This report uses JUMGOGPT portfolio, opportunity, and next-step records. It does not load Blackbaud revenue data.",
    presentationNoteTone: "success",
  }),
  Object.freeze({
    key: ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY,
    reportType: REPORT_TYPES.QUERY_BASED,
    adapterKey: "alumni-family-dashboard",
    configurationSchema: "alumni-family-dashboard-v1",
    configurationSchemaVersion: 2,
    href: "/reports/alumni-family-engagement",
    title: "Alumni & Family Engagement",
    description:
      "View configurable Alumni & Family Engagement dashboard panels backed by saved NXT queries.",
    audienceMode: "shared_snapshot",
    dataConfigurationType: "alumni_family_dashboard",
    configurationCapabilities: ALUMNI_FAMILY_DASHBOARD_CONFIGURATION_CAPABILITIES,
    presentationNote:
      "This dashboard uses saved NXT query snapshots. Standard report visits do not make a new NXT request.",
    presentationNoteTone: "info",
  }),
]);

const STANDARD_REPORTS_BY_KEY = new Map(
  STANDARD_REPORT_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function getReportTypeDefinitions() {
  return CONFIGURABLE_REPORT_TYPE_KEYS.map((key) => REPORT_TYPE_DEFINITIONS[key]);
}

export function getReportTypeDefinition(reportType) {
  return REPORT_TYPE_DEFINITIONS[reportType] || null;
}

export function getReportDefinition(reportKey) {
  return STANDARD_REPORTS_BY_KEY.get(String(reportKey || "").trim()) || null;
}

export function supportsReportDataConfiguration(definition) {
  return Boolean(getReportConfigurationCapabilities(definition).dataConfiguration);
}

export function getReportConfigurationCapabilities(definition) {
  const capabilities = definition?.configurationCapabilities || STANDARD_REPORT_CONFIGURATION_CAPABILITIES;
  const access = capabilities.access || STANDARD_REPORT_CONFIGURATION_CAPABILITIES.access;

  return {
    canEditTitle: Boolean(capabilities.canEditTitle),
    canEditDescription: Boolean(capabilities.canEditDescription),
    dataConfiguration: capabilities.dataConfiguration || null,
    access: {
      enabled: Boolean(access.enabled),
      mode: access.mode === "explicit_users" ? "explicit_users" : "visibility",
      allowedVisibilities: Array.isArray(access.allowedVisibilities)
        ? [...access.allowedVisibilities]
        : [...STANDARD_VISIBILITY_OPTIONS],
      requiresSpecificUsers: Boolean(access.requiresSpecificUsers),
      adminRoleBypass: Boolean(access.adminRoleBypass),
    },
  };
}

export function isReportVisibilitySupported(definition, visibility) {
  const normalizedVisibility = String(visibility || "").trim();
  const capabilities = getReportConfigurationCapabilities(definition);
  return capabilities.access.allowedVisibilities.includes(normalizedVisibility);
}

export function getStandardReportMetadata(definition) {
  const reportType = getReportTypeDefinition(definition?.reportType);
  if (!definition || !reportType) return null;

  return {
    reportType: reportType.key,
    reportTypeLabel: reportType.label,
    reportTypeDescription: reportType.description,
    adapterKey: definition.adapterKey,
    configurationSchema: definition.configurationSchema,
    configurationSchemaVersion: definition.configurationSchemaVersion,
    href: definition.href,
    audienceMode: definition.audienceMode,
    presentationNote: definition.presentationNote,
    presentationNoteTone: definition.presentationNoteTone,
    supportsDataConfiguration: supportsReportDataConfiguration(definition),
    configurationCapabilities: getReportConfigurationCapabilities(definition),
  };
}

export function getCustomFieldReportMetadata(slug) {
  const reportType = getReportTypeDefinition(REPORT_TYPES.CUSTOM_FIELD);
  const normalizedSlug = String(slug || "").trim();

  return {
    reportType: reportType.key,
    reportTypeLabel: reportType.label,
    reportTypeDescription: reportType.description,
    adapterKey: "custom-field-report",
    configurationSchema: "custom-field-report-v1",
    configurationSchemaVersion: 1,
    href: normalizedSlug ? `/reports/custom-field/${encodeURIComponent(normalizedSlug)}` : "/reports",
    audienceMode: "global_custom_field",
    presentationNote: "",
    presentationNoteTone: "neutral",
    supportsDataConfiguration: false,
    configurationCapabilities: getReportConfigurationCapabilities({
      configurationCapabilities: CUSTOM_FIELD_REPORT_CONFIGURATION_CAPABILITIES,
    }),
  };
}

export function getReportHref(report) {
  const definition = getReportDefinition(report?.key);
  if (definition) return definition.href;

  const configuredHref = String(report?.href || "").trim();
  return configuredHref.startsWith("/reports/custom-field/") ? configuredHref : "/reports";
}

export function validateReportConfigurationPayload(definition, payload = {}) {
  if (!definition) return "Unknown report.";

  const capabilities = getReportConfigurationCapabilities(definition);

  if (Object.hasOwn(payload, "title") && !capabilities.canEditTitle) {
    return "This report title is not configurable.";
  }

  if (Object.hasOwn(payload, "description") && !capabilities.canEditDescription) {
    return "This report description is not configurable.";
  }

  if (
    (Object.hasOwn(payload, "visibility") || Object.hasOwn(payload, "specificUserIds")) &&
    !capabilities.access.enabled
  ) {
    return "This report access is not configurable.";
  }

  if (Object.hasOwn(payload, "visibility") && !isReportVisibilitySupported(definition, payload.visibility)) {
    return "The selected access setting is not supported for this report.";
  }

  if (Object.hasOwn(payload, "dataConfiguration") && !capabilities.dataConfiguration) {
    return "This report does not accept data configuration.";
  }

  return "";
}
