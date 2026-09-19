import { randomUUID } from "node:crypto";
import sql from "@/app/api/utils/sql";
import {
  listMetadata,
  normalizeListSource,
  validateListSource,
} from "@/utils/constituentLists";
import {
  canManageWorkspaceRole,
  isExecutiveRole,
} from "@/utils/workspaceRoles";
import { parseReportSpecificUserIds } from "@/app/api/utils/reportAccess";

export const listError = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export const validListKey = (key) =>
  typeof key === "string" && /^list-[a-z0-9-]{1,70}$/.test(key);

export function serializeList(record, user) {
  const specificUserIds = parseReportSpecificUserIds(record.specific_user_ids);
  const canView =
    user?.active === true &&
    record.active === true &&
    specificUserIds.includes(Number(user.id));
  return {
    ...listMetadata(record.report_key),
    title: record.title,
    description: record.description || "",
    active: record.active === true,
    visibility: "specific_users",
    specificUserIds,
    dataConfiguration: record.data_configuration,
    canView,
    canManageMembers:
      canView &&
      (canManageWorkspaceRole(user.role) || isExecutiveRole(user.role)),
    revision: record.revision || String(record.updated_at),
  };
}

export async function getListRecord(key) {
  if (!validListKey(key)) return null;
  const rows =
    await sql`SELECT *, updated_at::text AS revision FROM report_configurations
    WHERE report_key = ${key} AND configuration_kind = 'constituent_list' LIMIT 1`;
  return rows[0] || null;
}

export async function listConfigurations(user) {
  const rows =
    await sql`SELECT *, updated_at::text AS revision FROM report_configurations
    WHERE configuration_kind = 'constituent_list' ORDER BY created_at, report_key`;
  return rows
    .map((record) => serializeList(record, user))
    .filter((item) => canManageWorkspaceRole(user.role) || item.canView);
}

export async function saveListConfiguration({ body, user, create = false }) {
  const allowed = [
    "reportKey",
    "configurationSchema",
    "title",
    "description",
    "active",
    "visibility",
    "specificUserIds",
    "dataConfiguration",
    "revision",
  ];
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    throw listError("Unknown list configuration field.");
  const key = create ? `list-${randomUUID()}` : body.reportKey;
  const existing = create ? null : await getListRecord(key);
  if (!create && !existing) throw listError("List not found.", 404);
  if (!create && body.revision !== existing.revision)
    throw listError(
      "This list changed. Reload before saving your changes.",
      409,
    );
  const current = existing
    ? serializeList(existing, user)
    : {
        title: "",
        description: "",
        active: false,
        visibility: "specific_users",
        specificUserIds: [],
      };
  const merged = { ...current, ...body };
  if (create && merged.active)
    throw listError(
      "Create a disabled list first, then select viewers and enable it.",
    );
  if (
    typeof merged.title !== "string" ||
    !merged.title.trim() ||
    merged.title.trim().length > 120
  )
    throw listError("Enter a list title between 1 and 120 characters.");
  if (
    typeof merged.description !== "string" ||
    merged.description.length > 1000
  )
    throw listError("List descriptions must be 1,000 characters or fewer.");
  if (
    typeof merged.active !== "boolean" ||
    merged.visibility !== "specific_users"
  )
    throw listError("Lists require explicit selected-user access.");
  if (
    !Array.isArray(merged.specificUserIds) ||
    merged.specificUserIds.some(
      (id) =>
        !/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id)),
    )
  )
    throw listError("Select valid user IDs.");
  const ids = [...new Set(merged.specificUserIds.map(Number))];
  if (merged.active && !ids.length)
    throw listError(
      "Select at least one active viewer before enabling this list.",
    );
  const sourceError = validateListSource(merged.dataConfiguration);
  if (sourceError) throw listError(sourceError);
  const source = normalizeListSource(merged.dataConfiguration);
  if (Object.hasOwn(body, "specificUserIds") || body.active === true) {
    const users = ids.length
      ? await sql`SELECT id FROM users WHERE active = TRUE AND id = ANY(${ids})`
      : [];
    if (users.length !== ids.length)
      throw listError(
        "One or more selected users are inactive or unavailable.",
      );
  }
  const rows = create
    ? await sql`
    INSERT INTO report_configurations (report_key, configuration_kind, title, description, active, visibility, specific_user_ids, data_configuration, created_by, updated_by)
    VALUES (${key}, 'constituent_list', ${merged.title.trim()}, ${merged.description.trim()}, FALSE, 'specific_users', ${JSON.stringify(ids)}::jsonb, ${JSON.stringify(source)}::jsonb, ${user.id}, ${user.id})
    RETURNING *, updated_at::text AS revision
  `
    : await sql`
    UPDATE report_configurations SET title = ${merged.title.trim()}, description = ${merged.description.trim()},
      active = ${merged.active}, specific_user_ids = ${JSON.stringify(ids)}::jsonb, data_configuration = ${JSON.stringify(source)}::jsonb,
      updated_by = ${user.id}, updated_at = NOW()
    WHERE report_key = ${key} AND configuration_kind = 'constituent_list' AND updated_at::text = ${existing.revision}
    RETURNING *, updated_at::text AS revision
  `;
  if (!rows.length)
    throw listError(
      "This list changed while saving. Reload and try again.",
      409,
    );
  return serializeList(rows[0], user);
}
