import sql from "./sql";
import { isMgoRole } from "@/utils/workspaceRoles";
import { activityWorkspaceIds } from "./portfolioActivityData";

export function activityEnrollmentConfig() {
  const mode = process.env.PORTFOLIO_ACTIVITY_ENROLLMENT_MODE?.trim() || "allowlist";
  const workspaceIds = activityWorkspaceIds();
  const excludedValue = process.env.PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS?.trim() || "";
  const excludedIds = activityWorkspaceIds(excludedValue);
  // A malformed exclusion must not accidentally enroll the workspace it was meant to stop.
  const enabled = !(excludedValue && !excludedIds.length)
    && (mode === "active_mgos" || (mode === "allowlist" && workspaceIds.length > 0));
  return { mode, enabled, workspaceIds, excludedIds };
}

// Re-evaluate membership every batch. This reads local account metadata only;
// assignment discovery and all NXT requests remain in their existing workflows.
export async function resolveActivityEnrollment(config = activityEnrollmentConfig()) {
  if (!config.enabled) return { mode: config.mode, workspaceIds: [], awaitingAssignments: 0 };
  const rows = await sql`
    SELECT id, role, active,
      (jsonb_typeof(blackbaud_portfolio_cache -> 'leadSolicitor') = 'array'
        AND jsonb_typeof(blackbaud_portfolio_cache -> 'supportingSolicitor') = 'array') AS has_portfolio
    FROM users WHERE active = TRUE
      AND (${config.mode} = 'active_mgos' OR id = ANY(${config.workspaceIds}::bigint[]))
    ORDER BY id
  `;
  const eligible = rows.filter(row => {
    const id = String(row.id);
    return row.active === true && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))
      && !config.excludedIds.includes(id)
      && (config.mode === "active_mgos" ? isMgoRole(row.role) : config.workspaceIds.includes(id));
  });
  return { mode: config.mode, workspaceIds: [...new Set(eligible.map(row => String(row.id)))],
    awaitingAssignments: eligible.filter(row => row.has_portfolio !== true).length };
}
