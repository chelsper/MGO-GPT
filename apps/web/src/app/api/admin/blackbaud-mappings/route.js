import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import sql from "@/app/api/utils/sql";
import {
  getDefaultBlackbaudFieldMappings,
  mergeBlackbaudFieldMappings,
} from "@/app/api/utils/blackbaudFieldMappings";
import { isAdminRole } from "@/utils/workspaceRoles";

async function requireAdminSession() {
  await ensureAppSchema();

  const session = await auth();
  if (!session?.user?.email) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await getOrCreateUser(session, "admin");
  if (!isAdminRole(user.role)) {
    return {
      error: Response.json({ error: "Forbidden — admins only" }, { status: 403 }),
    };
  }

  return { user };
}

export async function GET() {
  try {
    const { user, error } = await requireAdminSession();
    if (error) return error;

    const overrides = await sql`
      SELECT
        mapping_key,
        app_entity,
        app_field,
        blackbaud_object,
        blackbaud_field,
        selection_rule,
        direction,
        source_of_truth,
        notes,
        updated_by,
        updated_at
      FROM blackbaud_field_mappings
      ORDER BY app_entity ASC, app_field ASC
    `;

    return Response.json({
      currentUser: user,
      defaults: getDefaultBlackbaudFieldMappings(),
      mappings: mergeBlackbaudFieldMappings(overrides),
    });
  } catch (error) {
    console.error("Blackbaud mappings GET error:", error);
    return Response.json(
      { error: error?.message || "Failed to load Blackbaud mappings" },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const { user, error } = await requireAdminSession();
    if (error) return error;

    const body = await request.json();
    const mappingKey = body?.mapping_key?.trim();
    const appEntity = body?.app_entity?.trim();
    const appField = body?.app_field?.trim();

    if (!mappingKey || !appEntity || !appField) {
      return Response.json(
        { error: "mapping_key, app_entity, and app_field are required" },
        { status: 400 },
      );
    }

    const defaultMappings = getDefaultBlackbaudFieldMappings();
    const defaultMapping = defaultMappings.find(
      (mapping) => mapping.mapping_key === mappingKey,
    );
    if (defaultMapping?.direction === "pull") {
      return Response.json(
        { error: "Pull-only mappings are read-only in the admin UI" },
        { status: 403 },
      );
    }

    const rows = await sql`
      INSERT INTO blackbaud_field_mappings (
        mapping_key,
        app_entity,
        app_field,
        blackbaud_object,
        blackbaud_field,
        selection_rule,
        direction,
        source_of_truth,
        notes,
        updated_by,
        updated_at
      ) VALUES (
        ${mappingKey},
        ${appEntity},
        ${appField},
        ${body?.blackbaud_object?.trim() || null},
        ${body?.blackbaud_field?.trim() || null},
        ${body?.selection_rule?.trim() || null},
        ${body?.direction?.trim() || "local only"},
        ${body?.source_of_truth?.trim() || null},
        ${body?.notes?.trim() || null},
        ${user.id},
        NOW()
      )
      ON CONFLICT (mapping_key) DO UPDATE
      SET
        app_entity = EXCLUDED.app_entity,
        app_field = EXCLUDED.app_field,
        blackbaud_object = EXCLUDED.blackbaud_object,
        blackbaud_field = EXCLUDED.blackbaud_field,
        selection_rule = EXCLUDED.selection_rule,
        direction = EXCLUDED.direction,
        source_of_truth = EXCLUDED.source_of_truth,
        notes = EXCLUDED.notes,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING
        mapping_key,
        app_entity,
        app_field,
        blackbaud_object,
        blackbaud_field,
        selection_rule,
        direction,
        source_of_truth,
        notes,
        updated_by,
        updated_at
    `;

    return Response.json({ mapping: rows[0] });
  } catch (error) {
    console.error("Blackbaud mappings PATCH error:", error);
    return Response.json(
      { error: error?.message || "Failed to save Blackbaud mapping" },
      { status: 500 },
    );
  }
}
