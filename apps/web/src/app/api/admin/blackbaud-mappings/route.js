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
        m.mapping_key,
        m.app_entity,
        m.app_field,
        m.blackbaud_object,
        m.blackbaud_field,
        m.selection_rule,
        m.direction,
        m.source_of_truth,
        m.notes,
        m.reviewed_by,
        m.reviewed_at,
        reviewer.name AS reviewed_by_name,
        m.updated_by,
        m.updated_at
      FROM blackbaud_field_mappings m
      LEFT JOIN users reviewer ON reviewer.id = m.reviewed_by
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
    const markReviewed = body?.mark_reviewed === true;
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
        reviewed_by,
        reviewed_at,
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
        ${markReviewed ? user.id : null},
        ${markReviewed ? new Date().toISOString() : null},
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
        reviewed_by = CASE
          WHEN ${markReviewed} THEN ${user.id}
          ELSE blackbaud_field_mappings.reviewed_by
        END,
        reviewed_at = CASE
          WHEN ${markReviewed} THEN NOW()
          ELSE blackbaud_field_mappings.reviewed_at
        END,
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
        reviewed_by,
        reviewed_at,
        updated_by,
        updated_at
    `;
    const mapping = rows[0];
    const reviewerRows =
      mapping?.reviewed_by
        ? await sql`
            SELECT name
            FROM users
            WHERE id = ${mapping.reviewed_by}
            LIMIT 1
          `
        : [];

    return Response.json({
      mapping: {
        ...mapping,
        reviewed_by_name: reviewerRows[0]?.name || null,
      },
    });
  } catch (error) {
    console.error("Blackbaud mappings PATCH error:", error);
    return Response.json(
      { error: error?.message || "Failed to save Blackbaud mapping" },
      { status: 500 },
    );
  }
}
