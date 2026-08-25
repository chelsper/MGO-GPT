import sql from "@/app/api/utils/sql";
import { normalizeAlumniDonorConfiguration } from "@/app/api/utils/alumniDonorConfiguration";
import { customFieldReportKey } from "@/app/api/utils/customFieldReports";
import {
  ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY,
  EXECUTIVE_TEAM_STANDINGS_REPORT_KEY,
  FUTURE_MADE_PHASE_TWO_REPORT_KEY,
  getReportConfigurationCapabilities,
  getReportDefinition,
  PORTFOLIO_GIVING_REPORT_KEY,
  supportsReportDataConfiguration,
} from "@/app/api/utils/reportRegistry";
import { isAdminRole, isExecutiveRole } from "@/utils/workspaceRoles";

export {
  ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY,
  EXECUTIVE_TEAM_STANDINGS_REPORT_KEY,
  FUTURE_MADE_PHASE_TWO_REPORT_KEY,
  PORTFOLIO_GIVING_REPORT_KEY,
};

const VISIBILITY_OPTIONS = new Set(["all_users", "executive", "specific_users"]);

export function normalizeReportVisibility(value) {
  return VISIBILITY_OPTIONS.has(value) ? value : "all_users";
}

export function parseReportSpecificUserIds(value) {
  let values = value;
  if (typeof values === "string") {
    try {
      values = JSON.parse(values);
    } catch {
      values = [];
    }
  }
  if (!Array.isArray(values)) return [];

  return [
    ...new Set(
      values
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry > 0),
    ),
  ];
}

export function canUserViewReport({ user, visibility, specificUserIds, accessPolicy = null }) {
  const allowedVisibilities = Array.isArray(accessPolicy?.allowedVisibilities)
    ? accessPolicy.allowedVisibilities
    : ["all_users", "executive", "specific_users"];
  const adminRoleBypass = accessPolicy?.adminRoleBypass !== false;
  const userId = Number(user?.id);

  if (!allowedVisibilities.includes(visibility)) return false;

  return (
    (adminRoleBypass && isAdminRole(user?.role)) ||
    visibility === "all_users" ||
    (visibility === "executive" && isExecutiveRole(user?.role)) ||
    (visibility === "specific_users" && specificUserIds.includes(userId))
  );
}

// Custom Field Reports intentionally have no role-based bypass. An
// Advancement Services user must explicitly enable the report and select each
// person who should see it, including administrators.
export function canUserViewCustomFieldReport({ user, active, specificUserIds }) {
  const userId = Number(user?.id);
  return Boolean(active) && Number.isInteger(userId) && specificUserIds.includes(userId);
}

export async function getCustomFieldReportAccessForUser(slug, user) {
  const normalizedSlug = String(slug || "").trim();
  if (!normalizedSlug) return null;

  const records = await sql`
    SELECT
      id,
      slug,
      title,
      description,
      field_category,
      field_description,
      source_query_id,
      source_query_name,
      specific_user_ids,
      active,
      created_at,
      updated_at
    FROM custom_field_reports
    WHERE slug = ${normalizedSlug}
    LIMIT 1
  `;
  const record = records[0] || null;
  if (!record) return null;

  const specificUserIds = parseReportSpecificUserIds(record.specific_user_ids);
  return {
    record,
    key: customFieldReportKey(record.slug),
    specificUserIds,
    canView: canUserViewCustomFieldReport({
      user,
      active: record.active,
      specificUserIds,
    }),
  };
}

export async function getReportAccessForUser(reportKey, user) {
  const records = await sql`
    SELECT
      title,
      description,
      visibility,
      specific_user_ids,
      data_configuration
    FROM report_configurations
    WHERE report_key = ${reportKey}
    LIMIT 1
  `;
  const record = records[0];
  const visibility = normalizeReportVisibility(record?.visibility);
  const specificUserIds = parseReportSpecificUserIds(record?.specific_user_ids);
  const definition = getReportDefinition(reportKey);
  const configurationCapabilities = getReportConfigurationCapabilities(definition);

  return {
    title: String(record?.title || "").trim(),
    description: String(record?.description || "").trim(),
    dataConfiguration:
      supportsReportDataConfiguration(definition)
        ? normalizeAlumniDonorConfiguration(record?.data_configuration)
        : null,
    visibility,
    specificUserIds,
    canView: canUserViewReport({
      user,
      visibility,
      specificUserIds,
      accessPolicy: configurationCapabilities.access,
    }),
  };
}
