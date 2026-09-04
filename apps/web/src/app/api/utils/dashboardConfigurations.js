import { randomUUID } from "node:crypto";
import sql from "@/app/api/utils/sql";
import { parseReportSpecificUserIds } from "@/app/api/utils/reportAccess";
import {
  getDashboardReportMetadata,
  getReportDefinition,
} from "@/app/api/utils/reportRegistry";
import {
  normalizeDashboardConfiguration,
  validateDashboardConfiguration,
} from "@/app/api/utils/dashboardConfiguration";
import { canManageWorkspaceRole, isAdminRole } from "@/utils/workspaceRoles";

export function dashboardError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function canUserViewDashboard({ user, active, specificUserIds }) {
  return (
    user?.active === true &&
    active === true &&
    specificUserIds.includes(Number(user.id))
  );
}

export function serializeDashboardConfiguration(record, user) {
  const specificUserIds = parseReportSpecificUserIds(record.specific_user_ids);
  return {
    ...getDashboardReportMetadata(record.report_key),
    key: record.report_key,
    title: record.title,
    description: record.description || "",
    active: record.active === true,
    visibility: "specific_users",
    specificUserIds,
    dataConfiguration: normalizeDashboardConfiguration(
      record.data_configuration,
    ),
    canView: canUserViewDashboard({
      user,
      active: record.active,
      specificUserIds,
    }),
    canPreview: user?.active === true && canManageWorkspaceRole(user.role),
    canArrange: user?.active === true && isAdminRole(user.role),
    updatedAt: record.updated_at
      ? new Date(record.updated_at).toISOString()
      : null,
    updatedBy: record.updated_by
      ? { id: Number(record.updated_by), name: record.updated_by_name || null }
      : null,
    staticValueProvenance: record.value_provenance || {},
  };
}

export async function getDashboardConfiguration(reportKey) {
  const records = await sql`
    SELECT *, updated_at::text AS revision,
      (SELECT name FROM users WHERE users.id = report_configurations.updated_by) AS updated_by_name
    FROM report_configurations
    WHERE report_key = ${reportKey} AND configuration_kind = 'dashboard'
    LIMIT 1
  `;
  return records[0] || null;
}

export async function listDashboardConfigurations({ activeOnly = false } = {}) {
  return sql`
    SELECT *, (SELECT name FROM users WHERE users.id = report_configurations.updated_by) AS updated_by_name
    FROM report_configurations
    WHERE configuration_kind = 'dashboard' AND (${!activeOnly} OR active = TRUE)
    ORDER BY created_at, report_key
  `;
}

export async function deleteDashboardConfiguration({ reportKey }) {
  if (
    typeof reportKey !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(reportKey) ||
    getReportDefinition(reportKey)
  ) {
    throw dashboardError("Built-in and reserved reports cannot be deleted.");
  }
  const existing = await getDashboardConfiguration(reportKey);
  if (!existing) throw dashboardError("Unknown dashboard.", 404);

  const deleted = await sql`
    DELETE FROM report_configurations
    WHERE report_key = ${reportKey}
      AND configuration_kind = 'dashboard'
      AND updated_at::text = ${existing.revision}
    RETURNING report_key
  `;
  if (!deleted.length) {
    throw dashboardError(
      "Configuration changed while deleting. Reload and try again.",
      409,
    );
  }

  try {
    await sql`
      DELETE FROM report_snapshots_cache
      WHERE report_key = ${`report:dashboard:${reportKey}`}
    `;
  } catch (error) {
    // The report is already inaccessible once its configuration is deleted.
    // A stale orphaned cache row is safe and can be removed operationally.
    console.error("Deleted report snapshot cleanup failed:", error);
  }
  return { reportKey };
}

// Only supplied top-level fields are replaced; dataConfiguration is a whole schema document.
export function mergeDashboardConfigurationPatch(current, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw dashboardError("Expected a configuration object.");
  const allowed = new Set([
    "reportKey",
    "title",
    "description",
    "active",
    "visibility",
    "specificUserIds",
    "dataConfiguration",
  ]);
  if (Object.keys(patch).some((key) => !allowed.has(key)))
    throw dashboardError("Unknown dashboard configuration field.");
  const merged = { ...current };
  for (const key of allowed) {
    if (key !== "reportKey" && Object.hasOwn(patch, key))
      merged[key] = patch[key];
  }
  if (
    typeof merged.title !== "string" ||
    !merged.title.trim() ||
    merged.title.trim().length > 120
  )
    throw dashboardError("Report names must be between 1 and 120 characters.");
  if (
    typeof merged.description !== "string" ||
    merged.description.length > 1000
  )
    throw dashboardError(
      "Report descriptions must be at most 1,000 characters.",
    );
  if (typeof merged.active !== "boolean")
    throw dashboardError("active must be a boolean.");
  if (merged.visibility !== "specific_users")
    throw dashboardError("Dashboards require explicit specific-user access.");
  if (
    !Array.isArray(merged.specificUserIds) ||
    merged.specificUserIds.some(
      (id) =>
        !["number", "string"].includes(typeof id) ||
        !/^[1-9]\d*$/.test(String(id)) ||
        !Number.isSafeInteger(Number(id)),
    )
  )
    throw dashboardError("specificUserIds must contain positive user IDs.");
  merged.specificUserIds = [...new Set(merged.specificUserIds.map(Number))];
  if (merged.active && !merged.specificUserIds.length)
    throw dashboardError(
      "Choose at least one active user before enabling a dashboard.",
    );
  const schemaError = validateDashboardConfiguration(merged.dataConfiguration);
  if (schemaError) throw dashboardError(schemaError);
  return {
    ...merged,
    title: merged.title.trim(),
    description: merged.description.trim(),
    dataConfiguration: normalizeDashboardConfiguration(
      merged.dataConfiguration,
    ),
  };
}

export async function saveDashboardConfiguration({
  body,
  user,
  create = false,
}) {
  if (create && body?.active === true)
    throw dashboardError(
      "New dashboards must start disabled. Enable access after creating the draft.",
    );
  const reportKey =
    create && body?.reportKey === undefined
      ? `dashboard-${randomUUID()}`
      : body?.reportKey;
  if (
    typeof reportKey !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(reportKey) ||
    ["test-query", "test-query-results"].includes(reportKey) ||
    getReportDefinition(reportKey)
  )
    throw dashboardError("Invalid or reserved dashboard report key.");
  const existing = create ? null : await getDashboardConfiguration(reportKey);
  if (!create && !existing) throw dashboardError("Unknown dashboard.", 404);
  const current = existing
    ? serializeDashboardConfiguration(existing, user)
    : {
        title: "",
        description: "",
        active: false,
        visibility: "specific_users",
        specificUserIds: [],
        dataConfiguration: { version: 1, panels: [] },
      };
  const merged = mergeDashboardConfigurationPatch(current, body);
  const oldValues = new Map(
    current.dataConfiguration.panels.flatMap((panel) =>
      panel.values.map((cell) => [cell.key, cell]),
    ),
  );
  const provenance = Object.fromEntries(
    merged.dataConfiguration.panels.flatMap((panel) =>
      panel.values
        .filter((cell) => cell.source === "static")
        .map((cell) => {
          const old = oldValues.get(cell.key);
          const unchanged =
            old?.source === "static" && old.staticValue === cell.staticValue;
          return [
            cell.key,
            unchanged && existing?.value_provenance?.[cell.key]
              ? existing.value_provenance[cell.key]
              : {
                  updatedAt: new Date().toISOString(),
                  updatedBy: { id: Number(user.id), name: user.name || null },
                },
          ];
        }),
    ),
  );
  if (Object.hasOwn(body, "specificUserIds") || body.active === true) {
    const users = merged.specificUserIds.length
      ? await sql`
      SELECT id FROM users WHERE active = TRUE AND id = ANY(${merged.specificUserIds})
    `
      : [];
    if (users.length !== merged.specificUserIds.length)
      throw dashboardError(
        "One or more selected report users are inactive or no longer exist.",
      );
  }
  let records;
  if (create) {
    records = await sql`
      INSERT INTO report_configurations (report_key, configuration_kind, title, description, active, visibility, specific_user_ids, data_configuration, value_provenance, created_by, updated_by)
      VALUES (${reportKey}, 'dashboard', ${merged.title}, ${merged.description}, ${merged.active}, 'specific_users', ${JSON.stringify(merged.specificUserIds)}::jsonb, ${JSON.stringify(merged.dataConfiguration)}::jsonb, ${JSON.stringify(provenance)}::jsonb, ${user.id}, ${user.id})
      ON CONFLICT (report_key) DO NOTHING
      RETURNING *
    `;
    if (!records.length)
      throw dashboardError("This report key already exists.", 409);
  } else {
    records = await sql`
      UPDATE report_configurations SET
        title = CASE WHEN ${Object.hasOwn(body, "title")} THEN ${merged.title} ELSE title END,
        description = CASE WHEN ${Object.hasOwn(body, "description")} THEN ${merged.description} ELSE description END,
        active = CASE WHEN ${Object.hasOwn(body, "active")} THEN ${merged.active} ELSE active END,
        specific_user_ids = CASE WHEN ${Object.hasOwn(body, "specificUserIds")} THEN ${JSON.stringify(merged.specificUserIds)}::jsonb ELSE specific_user_ids END,
        data_configuration = CASE WHEN ${Object.hasOwn(body, "dataConfiguration")} THEN ${JSON.stringify(merged.dataConfiguration)}::jsonb ELSE data_configuration END,
        value_provenance = CASE WHEN ${Object.hasOwn(body, "dataConfiguration")} THEN ${JSON.stringify(provenance)}::jsonb ELSE value_provenance END,
        updated_by = ${user.id}, updated_at = NOW()
      WHERE report_key = ${reportKey} AND configuration_kind = 'dashboard'
        AND updated_at::text = ${existing.revision}
      RETURNING *
    `;
    if (!records.length)
      throw dashboardError(
        "Configuration changed while saving. Reload and try again.",
        409,
      );
  }
  return serializeDashboardConfiguration(
    { ...records[0], updated_by_name: user.name || null },
    user,
  );
}
