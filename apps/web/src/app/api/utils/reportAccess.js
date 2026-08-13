import sql from "@/app/api/utils/sql";
import { isAdminRole, isExecutiveRole } from "@/utils/workspaceRoles";

export const PORTFOLIO_GIVING_REPORT_KEY = "portfolio-fy-giving";

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

export function canUserViewReport({ user, visibility, specificUserIds }) {
  const userId = Number(user?.id);
  return (
    isAdminRole(user?.role) ||
    visibility === "all_users" ||
    (visibility === "executive" && isExecutiveRole(user?.role)) ||
    (visibility === "specific_users" && specificUserIds.includes(userId))
  );
}

export async function getReportAccessForUser(reportKey, user) {
  const records = await sql`
    SELECT visibility, specific_user_ids
    FROM report_configurations
    WHERE report_key = ${reportKey}
    LIMIT 1
  `;
  const record = records[0];
  const visibility = normalizeReportVisibility(record?.visibility);
  const specificUserIds = parseReportSpecificUserIds(record?.specific_user_ids);

  return {
    visibility,
    specificUserIds,
    canView: canUserViewReport({ user, visibility, specificUserIds }),
  };
}
