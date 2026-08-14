import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import sql from "@/app/api/utils/sql";
import {
  canManageWorkspaceRole,
} from "@/utils/workspaceRoles";
import {
  canUserViewReport,
  FUTURE_MADE_PHASE_TWO_REPORT_KEY,
  normalizeReportVisibility,
  parseReportSpecificUserIds,
  PORTFOLIO_GIVING_REPORT_KEY,
} from "@/app/api/utils/reportAccess";

const REPORT_DEFINITIONS = [
  {
    key: PORTFOLIO_GIVING_REPORT_KEY,
    title: "Portfolio Giving",
    description: "Review current fiscal-year gift activity across an MGO portfolio.",
  },
  {
    key: FUTURE_MADE_PHASE_TWO_REPORT_KEY,
    title: "Future. Made. Phase II",
    description:
      "View every constituent returned by the saved Future. Made. Phase II NXT query.",
  },
];

function serializeConfiguration(definition, record, currentUser) {
  const visibility = normalizeReportVisibility(record?.visibility);
  const specificUserIds = parseReportSpecificUserIds(record?.specific_user_ids);
  const canView = canUserViewReport({
    user: currentUser,
    visibility,
    specificUserIds,
  });

  return {
    key: definition.key,
    title: record?.title || definition.title,
    description: record?.description || definition.description,
    visibility,
    specificUserIds,
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
      SELECT report_key, title, description, visibility, specific_user_ids
      FROM report_configurations
      WHERE report_key IN ('portfolio-fy-giving', 'future-made-phase-ii')
    `;
    const recordsByKey = new Map(records.map((record) => [record.report_key, record]));
    const canManage = canManageWorkspaceRole(user.role);
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
      configurations: REPORT_DEFINITIONS.map((definition) =>
        serializeConfiguration(definition, recordsByKey.get(definition.key), user),
      ),
      users,
    });
  } catch (error) {
    console.error("Report configurations GET error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load report access." },
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
    const definition = REPORT_DEFINITIONS.find((report) => report.key === body?.reportKey);
    if (!definition) {
      return Response.json({ error: "Unknown report." }, { status: 400 });
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

    const saved = await sql`
      INSERT INTO report_configurations (
        report_key,
        title,
        description,
        visibility,
        specific_user_ids,
        created_by,
        updated_by
      )
      VALUES (
        ${definition.key},
        ${definition.title},
        ${definition.description},
        ${visibility},
        ${JSON.stringify(activeUserIds)}::jsonb,
        ${user.id},
        ${user.id}
      )
      ON CONFLICT (report_key)
      DO UPDATE SET
        visibility = EXCLUDED.visibility,
        specific_user_ids = EXCLUDED.specific_user_ids,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING report_key, title, description, visibility, specific_user_ids
    `;

    return Response.json({
      configuration: serializeConfiguration(definition, saved[0], user),
      message: "Report access saved.",
    });
  } catch (error) {
    console.error("Report configurations PATCH error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save report access." },
      { status: 500 },
    );
  }
}
