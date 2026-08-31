import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import sql from "@/app/api/utils/sql";
import {
  canManageWorkspaceRole,
} from "@/utils/workspaceRoles";
import {
  canUserViewCustomFieldReport,
  canUserViewReport,
  normalizeReportVisibility,
  parseReportSpecificUserIds,
} from "@/app/api/utils/reportAccess";
import {
  createCustomFieldReportSlug,
  customFieldReportCacheKey,
  normalizeCustomFieldReportInput,
  serializeCustomFieldReport,
  validateCustomFieldReportInput,
} from "@/app/api/utils/customFieldReports";
import { invalidateReportSnapshot } from "@/app/api/utils/reportCache";
import {
  normalizeAlumniDonorConfiguration,
  validateAlumniDonorConfiguration,
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
        ? normalizeAlumniDonorConfiguration(record?.data_configuration)
        : null,
    canView,
  };
}

function serializeCustomFieldConfiguration(record, currentUser) {
  const specificUserIds = parseReportSpecificUserIds(record?.specific_user_ids);
  return serializeCustomFieldReport(
    record,
    canUserViewCustomFieldReport({
      user: currentUser,
      active: record?.active,
      specificUserIds,
    }),
  );
}

function createRequestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function getActiveSelectedUserIds(requestedUserIds) {
  const normalizedIds = parseReportSpecificUserIds(requestedUserIds);
  if (!normalizedIds.length) return [];

  const activeUsers = await sql`
    SELECT id
    FROM users
    WHERE active = TRUE
      AND id = ANY(${normalizedIds})
  `;
  const activeUserIds = activeUsers.map((activeUser) => Number(activeUser.id));
  if (activeUserIds.length !== normalizedIds.length) {
    throw createRequestError("One or more selected report users are inactive or no longer exist.");
  }
  return activeUserIds;
}

async function saveCustomFieldReport({ body, currentUser, existingRecord = null }) {
  const input = normalizeCustomFieldReportInput(body);
  const validationError = validateCustomFieldReportInput(input);
  if (validationError) throw createRequestError(validationError);

  // Existing reports can continue using a saved NXT query. New reports are direct custom-field reports.
  const legacySourceQueryId = String(existingRecord?.source_query_id || "").trim() || null;
  const legacySourceQueryName = String(existingRecord?.source_query_name || "").trim() || null;

  const activeUserIds = await getActiveSelectedUserIds(input.specificUserIds);
  if (input.active && activeUserIds.length === 0) {
    throw createRequestError("Select at least one active user before enabling this report.");
  }

  const slug = existingRecord?.slug || createCustomFieldReportSlug(
    input.title,
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
  );
  const rows = existingRecord
    ? await sql`
        UPDATE custom_field_reports
        SET
          title = ${input.title},
          description = ${input.description || null},
          field_category = ${input.fieldCategory},
          field_description = ${input.fieldDescription},
          source_query_id = ${legacySourceQueryId},
          source_query_name = ${legacySourceQueryName},
          specific_user_ids = ${JSON.stringify(activeUserIds)}::jsonb,
          active = ${input.active},
          updated_by = ${currentUser.id},
          updated_at = NOW()
        WHERE slug = ${slug}
        RETURNING *
      `
    : await sql`
        INSERT INTO custom_field_reports (
          slug,
          title,
          description,
          field_category,
          field_description,
          source_query_id,
          source_query_name,
          specific_user_ids,
          active,
          created_by,
          updated_by
        )
        VALUES (
          ${slug},
          ${input.title},
          ${input.description || null},
          ${input.fieldCategory},
          ${input.fieldDescription},
          ${null},
          ${null},
          ${JSON.stringify(activeUserIds)}::jsonb,
          ${input.active},
          ${currentUser.id},
          ${currentUser.id}
        )
        RETURNING *
      `;

  const saved = rows[0];
  if (!saved) throw new Error("Could not save the Custom Field Report.");

  await invalidateReportSnapshot(customFieldReportCacheKey(saved.slug));
  return serializeCustomFieldConfiguration(saved, currentUser);
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
    const customFieldRecords = canManage
      ? await sql`
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
          ORDER BY LOWER(title) ASC, id ASC
        `
      : await sql`
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
          WHERE active = TRUE
          ORDER BY LOWER(title) ASC, id ASC
        `;
    const serializedCustomFieldReports = customFieldRecords.map((record) =>
      serializeCustomFieldConfiguration(record, user),
    );
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
      configurations: [
        ...STANDARD_REPORT_DEFINITIONS.map((definition) =>
          serializeConfiguration(definition, recordsByKey.get(definition.key), user),
        ),
        ...serializedCustomFieldReports.filter((report) => report.canView),
      ],
      customFieldReports: canManage ? serializedCustomFieldReports : [],
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
    const customFieldReportSlug = String(body?.customFieldReportSlug || "").trim();
    if (customFieldReportSlug) {
      const existingRecords = await sql`
        SELECT *
        FROM custom_field_reports
        WHERE slug = ${customFieldReportSlug}
        LIMIT 1
      `;
      const existingRecord = existingRecords[0];
      if (!existingRecord) {
        return Response.json({ error: "Custom Field Report not found." }, { status: 404 });
      }

      const configuration = await saveCustomFieldReport({
        body,
        currentUser: user,
        existingRecord,
      });
      return Response.json({
        configuration,
        message: configuration.active
          ? "Custom Field Report saved and available only to its selected users."
          : "Custom Field Report saved but remains hidden until enabled.",
      });
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
      ? normalizeAlumniDonorConfiguration(body?.dataConfiguration)
      : null;
    const dataConfigurationError = shouldUpdateDataConfiguration
      ? validateAlumniDonorConfiguration(dataConfiguration)
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

export async function POST(request) {
  try {
    const { user, error } = await requireSessionUser();
    if (error) return error;
    if (!canManageWorkspaceRole(user.role)) {
      return Response.json(
        { error: "Only Admin and Advancement Services users can configure Custom Field Reports." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const configuration = await saveCustomFieldReport({ body, currentUser: user });
    return Response.json(
      {
        configuration,
        message: configuration.active
          ? "Custom Field Report created and available only to its selected users."
          : "Custom Field Report created but remains hidden until enabled.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Custom Field Report POST error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not create Custom Field Report." },
      { status: Number(error?.status) || 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const { user, error } = await requireSessionUser();
    if (error) return error;
    if (!canManageWorkspaceRole(user.role)) {
      return Response.json(
        { error: "Only Admin and Advancement Services users can delete Custom Field Reports." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    const slug = String(body?.customFieldReportSlug || "").trim();
    if (!slug) {
      return Response.json({ error: "Choose a Custom Field Report to delete." }, { status: 400 });
    }

    const deleted = await sql`
      DELETE FROM custom_field_reports
      WHERE slug = ${slug}
      RETURNING slug
    `;
    if (!deleted[0]) {
      return Response.json({ error: "Custom Field Report not found." }, { status: 404 });
    }

    await invalidateReportSnapshot(customFieldReportCacheKey(slug));
    return Response.json({ message: "Custom Field Report deleted." });
  } catch (error) {
    console.error("Custom Field Report DELETE error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not delete Custom Field Report." },
      { status: 500 },
    );
  }
}
