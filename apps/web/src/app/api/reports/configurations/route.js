import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import sql from "@/app/api/utils/sql";
import {
  canManageWorkspaceRole,
} from "@/utils/workspaceRoles";
import {
  canUserViewReport,
  normalizeReportVisibility,
  parseReportSpecificUserIds,
} from "@/app/api/utils/reportAccess";
import {
  normalizeAlumniFamilyEngagementDashboard,
  validateAlumniFamilyEngagementDashboard,
} from "@/app/api/utils/alumniDonorConfiguration";
import {
  getReportDefinition,
  getStandardReportMetadata,
  STANDARD_REPORT_DEFINITIONS,
  supportsReportDataConfiguration,
  validateReportConfigurationPayload,
} from "@/app/api/utils/reportRegistry";

const STANDARD_REPORT_KEYS = STANDARD_REPORT_DEFINITIONS.map((definition) => definition.key);

function serializeConfiguration(definition, record, currentUser) {
  const metadata = getStandardReportMetadata(definition);
  const visibility = normalizeReportVisibility(record?.visibility);
  const specificUserIds = parseReportSpecificUserIds(record?.specific_user_ids);
  const canView = canUserViewReport({
    user: currentUser,
    visibility,
    specificUserIds,
  });

  return {
    ...metadata,
    key: definition.key,
    title: record?.title || definition.title,
    description: record?.description || definition.description,
    visibility,
    specificUserIds,
    sourceQueryId: "",
    sourceQueryName: "",
    dataConfiguration:
      metadata.supportsDataConfiguration
        ? normalizeAlumniFamilyEngagementDashboard(record?.data_configuration)
        : null,
    canView,
  };
}

async function requireSessionUser() {
  await ensureAppSchema();
  const session = await auth();
  if (!session?.user?.email) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user: await getOrCreateUser(session, "admin") };
}

export async function GET() {
  try {
    const { user, error } = await requireSessionUser();
    if (error) return error;

    const records = await sql`
      SELECT
        report_key,
        title,
        description,
        visibility,
        specific_user_ids,
        source_query_id,
        source_query_name,
        data_configuration
      FROM report_configurations
      WHERE report_key = ANY(${STANDARD_REPORT_KEYS})
    `;
    const canManage = canManageWorkspaceRole(user.role);
    const recordsByKey = new Map(records.map((record) => [record.report_key, record]));
    const users = canManage
      ? await sql`
          SELECT id, name, email, role
          FROM users
          WHERE active = TRUE
          ORDER BY LOWER(name) ASC, LOWER(email) ASC
        `
      : [];

    return Response.json({
      canManage,
      configurations: STANDARD_REPORT_DEFINITIONS.map((definition) =>
        serializeConfiguration(definition, recordsByKey.get(definition.key), user),
      ),
      users,
    });
  } catch (error) {
    console.error("Report configurations GET error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load report configuration." },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const { user, error } = await requireSessionUser();
    if (error) return error;
    if (!canManageWorkspaceRole(user.role)) {
      return Response.json(
        { error: "Only Admin and Advancement Services users can configure report access." },
        { status: 403 },
      );
    }

    const body = await request.json();
    if (String(body?.customFieldReportSlug || "").trim()) {
      return Response.json(
        { error: "Custom Field Reports are retired. Configure an approved Query-Based Report instead." },
        { status: 410 },
      );
    }

    const definition = getReportDefinition(body?.reportKey);
    if (!definition) {
      return Response.json({ error: "Unknown report." }, { status: 400 });
    }

    const configurationPayloadError = validateReportConfigurationPayload(definition, body);
    if (configurationPayloadError) {
      return Response.json({ error: configurationPayloadError }, { status: 400 });
    }

    const visibility = normalizeReportVisibility(body?.visibility);
    const requestedUserIds = parseReportSpecificUserIds(body?.specificUserIds);
    if (visibility === "specific_users" && requestedUserIds.length === 0) {
      return Response.json(
        { error: "Choose at least one active user for a specific-user report." },
        { status: 400 },
      );
    }

    const activeUsers = requestedUserIds.length
      ? await sql`
          SELECT id
          FROM users
          WHERE active = TRUE
            AND id = ANY(${requestedUserIds})
        `
      : [];
    const activeUserIds = activeUsers.map((activeUser) => Number(activeUser.id));
    if (visibility === "specific_users" && activeUserIds.length !== requestedUserIds.length) {
      return Response.json(
        { error: "One or more selected report users are inactive or no longer exist." },
        { status: 400 },
      );
    }

    const hasTitleUpdate = Object.hasOwn(body || {}, "title");
    const hasDescriptionUpdate = Object.hasOwn(body || {}, "description");
    const title = String(body?.title ?? definition.title).trim();
    const description = String(body?.description ?? definition.description).trim();
    if (!title || title.length > 120) {
      return Response.json(
        { error: "Report names must be between 1 and 120 characters." },
        { status: 400 },
      );
    }
    if (description.length > 1000) {
      return Response.json(
        { error: "Report descriptions must be 1,000 characters or fewer." },
        { status: 400 },
      );
    }

    const hasDataConfigurationUpdate = Object.hasOwn(body || {}, "dataConfiguration");
    const shouldUpdateDataConfiguration =
      supportsReportDataConfiguration(definition) && hasDataConfigurationUpdate;
    const dataConfiguration = shouldUpdateDataConfiguration
      ? normalizeAlumniFamilyEngagementDashboard(body?.dataConfiguration)
      : null;
    const dataConfigurationError = shouldUpdateDataConfiguration
      ? validateAlumniFamilyEngagementDashboard(dataConfiguration)
      : "";
    if (dataConfigurationError) {
      return Response.json({ error: dataConfigurationError }, { status: 400 });
    }

    const sourceQueryId = "";
    const sourceQueryName = "";
    if (sourceQueryId.length > 200 || sourceQueryName.length > 200) {
      return Response.json(
        { error: "The saved NXT query ID and name must each be 200 characters or fewer." },
        { status: 400 },
      );
    }
    const shouldUpdateSourceQuery =
      supportsReportDataConfiguration(definition) && shouldUpdateDataConfiguration;

    const saved = await sql`
      INSERT INTO report_configurations (
        report_key,
        title,
        description,
        visibility,
        specific_user_ids,
        source_query_id,
        source_query_name,
        data_configuration,
        created_by,
        updated_by
      )
      VALUES (
        ${definition.key},
        ${title},
        ${description},
        ${visibility},
        ${JSON.stringify(activeUserIds)}::jsonb,
        ${sourceQueryId || null},
        ${sourceQueryName || null},
        ${JSON.stringify(dataConfiguration || {})}::jsonb,
        ${user.id},
        ${user.id}
      )
      ON CONFLICT (report_key)
      DO UPDATE SET
        title = CASE
          WHEN ${hasTitleUpdate} THEN EXCLUDED.title
          ELSE report_configurations.title
        END,
        description = CASE
          WHEN ${hasDescriptionUpdate} THEN EXCLUDED.description
          ELSE report_configurations.description
        END,
        visibility = EXCLUDED.visibility,
        specific_user_ids = EXCLUDED.specific_user_ids,
        source_query_id = CASE
          WHEN ${shouldUpdateSourceQuery} THEN EXCLUDED.source_query_id
          ELSE report_configurations.source_query_id
        END,
        source_query_name = CASE
          WHEN ${shouldUpdateSourceQuery} THEN EXCLUDED.source_query_name
          ELSE report_configurations.source_query_name
        END,
        data_configuration = CASE
          WHEN ${shouldUpdateDataConfiguration} THEN EXCLUDED.data_configuration
          ELSE report_configurations.data_configuration
        END,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING
        report_key,
        title,
        description,
        visibility,
        specific_user_ids,
        source_query_id,
        source_query_name,
        data_configuration
    `;

    return Response.json({
      configuration: serializeConfiguration(definition, saved[0], user),
      message: "Report configuration saved.",
    });
  } catch (error) {
    console.error("Report configurations PATCH error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save report configuration." },
      { status: Number(error?.status) || 500 },
    );
  }
}

export async function POST() {
  return Response.json(
    { error: "Custom Field Reports are retired. Configure an approved Query-Based Report instead." },
    { status: 410 },
  );
}

export async function DELETE() {
  return Response.json(
    { error: "Custom Field Reports are retired. Configure an approved Query-Based Report instead." },
    { status: 410 },
  );
}
