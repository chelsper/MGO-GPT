import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  buildActingUserCookie,
  clearActingUserCookie,
  getActingUserIdFromRequest,
} from "@/app/api/utils/getWorkspaceUser";
import {
  canUseExecutiveViewRole,
  canViewWorkspaceAsRole,
} from "@/utils/workspaceRoles";
import { getValidBlackbaudConnection } from "@/app/api/utils/blackbaud";
import { bootstrapMgoPortfolioFromBlackbaud } from "@/app/api/utils/bootstrapMgoPortfolio";

async function requireExecutiveViewSession() {
  await ensureAppSchema();

  const session = await auth();
  if (!session || !session.user?.email) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await getOrCreateUser(session, "admin");
  if (!canUseExecutiveViewRole(user.role)) {
    return {
      error: Response.json(
        { error: "Forbidden — executive view access required" },
        { status: 403 },
      ),
    };
  }

  return { session, user };
}

async function shouldBootstrapWorkspace(userId) {
  const [userRows, prospectRows, opportunityRows] = await Promise.all([
    sql`
      SELECT
        blackbaud_constituent_id,
        blackbaud_lookup_id,
        blackbaud_portfolio_seeded_at,
        blackbaud_portfolio_seed_error
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `,
    sql`
      SELECT COUNT(*)::int AS prospect_count
      FROM prospects
      WHERE user_id = ${userId}
    `,
    sql`
      SELECT COUNT(*)::int AS opportunity_count
      FROM prospect_opportunities po
      INNER JOIN prospects p ON p.id = po.prospect_id
      WHERE p.user_id = ${userId}
    `,
  ]);

  const workspaceUser = userRows[0] || null;
  if (!workspaceUser?.blackbaud_constituent_id && !workspaceUser?.blackbaud_lookup_id) {
    return false;
  }

  if (!workspaceUser.blackbaud_portfolio_seeded_at || workspaceUser.blackbaud_portfolio_seed_error) {
    return true;
  }

  return Number(prospectRows[0]?.prospect_count || 0) === 0 ||
    Number(opportunityRows[0]?.opportunity_count || 0) === 0;
}

async function getViewableWorkspaceTarget(userId, viewerRole) {
  const rows = await sql`
    SELECT id, name, email, role, active, blackbaud_lookup_id
    FROM users
    WHERE id = ${userId} AND active = TRUE
    LIMIT 1
  `;
  const target = rows[0] || null;
  return target && canViewWorkspaceAsRole(viewerRole, target.role) ? target : null;
}

export async function GET(request) {
  const { error, user } = await requireExecutiveViewSession();
  if (error) return error;

  const actingUserId = getActingUserIdFromRequest(request);
  if (!actingUserId) {
    return Response.json({ actingUser: null, adminUser: user });
  }

  const actingUser = await getViewableWorkspaceTarget(actingUserId, user.role);

  const response = Response.json({
    adminUser: user,
    actingUser,
  });

  if (!actingUser) {
    response.headers.append("Set-Cookie", clearActingUserCookie());
  }

  return response;
}

export async function POST(request) {
  const { error, user } = await requireExecutiveViewSession();
  if (error) return error;

  const body = await request.json();
  const userId = Number(body?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return Response.json({ error: "Valid workspace user id is required." }, { status: 400 });
  }

  const workspaceTarget = await getViewableWorkspaceTarget(userId, user.role);

  if (!workspaceTarget) {
    return Response.json({ error: "Active MGO or Executive user not found." }, { status: 404 });
  }

  const origin = request?.url ? new URL(request.url).origin : null;
  if (await shouldBootstrapWorkspace(workspaceTarget.id)) {
    const hasBlackbaudConnection = await getValidBlackbaudConnection(user.id, origin).catch(
      () => null,
    );

    if (hasBlackbaudConnection) {
      try {
        await bootstrapMgoPortfolioFromBlackbaud({
          userId: workspaceTarget.id,
          authUserId: user.id,
          origin,
          force: true,
        });
      } catch (bootstrapError) {
        console.error("Workspace switch Blackbaud bootstrap error:", bootstrapError);
      }
    }
  }

  const response = Response.json({ actingUser: workspaceTarget });
  response.headers.append("Set-Cookie", buildActingUserCookie(userId));
  return response;
}

export async function DELETE() {
  const { error } = await requireExecutiveViewSession();
  if (error) return error;

  const response = Response.json({ ok: true, actingUser: null });
  response.headers.append("Set-Cookie", clearActingUserCookie());
  return response;
}
