import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { isAllowedWorkspaceEmail, workspaceEmailAccessMessage } from "@/utils/authDomain";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { getValidBlackbaudConnection } from "@/app/api/utils/blackbaud";
import { bootstrapMgoPortfolioFromBlackbaud } from "@/app/api/utils/bootstrapMgoPortfolio";
import { getBootstrapAdminEmail } from "@/app/api/utils/invitations";
import getWorkspaceUser, { clearActingUserCookie } from "@/app/api/utils/getWorkspaceUser";

function shouldAutoSyncPortfolio(user) {
  if (!user) return false;
  if (!user.blackbaud_portfolio_seed_attempted_at) return true;

  const attemptedAt = new Date(user.blackbaud_portfolio_seed_attempted_at).getTime();
  if (Number.isNaN(attemptedAt)) return true;

  return Date.now() - attemptedAt >= 12 * 60 * 60 * 1000;
}

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const context = await getWorkspaceUser(session, request);
    const user = context.sessionUser;
    const workspaceUser = context.workspaceUser;
    const authUserId = context.isActing ? user.id : workspaceUser.id;
    const origin = request?.url ? new URL(request.url).origin : null;
    const bootstrapAdminEmail = getBootstrapAdminEmail();
    const canSeedBootstrapAdmin =
      Boolean(bootstrapAdminEmail) &&
      workspaceUser?.email === bootstrapAdminEmail &&
      Boolean(workspaceUser?.blackbaud_constituent_id);

    if (workspaceUser?.role === "mgo" || canSeedBootstrapAdmin) {
      const hasBlackbaudConnection = await getValidBlackbaudConnection(authUserId, origin).catch(
        () => null,
      );

      if (hasBlackbaudConnection && shouldAutoSyncPortfolio(workspaceUser)) {
        try {
          await bootstrapMgoPortfolioFromBlackbaud({
            userId: workspaceUser.id,
            authUserId,
            origin,
          });
        } catch (bootstrapError) {
          console.error("Profile Blackbaud bootstrap error:", bootstrapError);
        }
      }
    }

    const refreshedUser = await sql`
      SELECT *
      FROM users
      WHERE id = ${user.id}
      LIMIT 1
    `;
    const refreshedWorkspaceUser = workspaceUser.id === user.id
      ? refreshedUser[0] || user
      : (
          await sql`
            SELECT *
            FROM users
            WHERE id = ${workspaceUser.id}
            LIMIT 1
          `
        )[0] || workspaceUser;

    const response = Response.json({
      user: refreshedUser[0] || user,
      workspaceUser: refreshedWorkspaceUser,
      actingAsUser: context.isActing
        ? {
            id: refreshedWorkspaceUser.id,
            name: refreshedWorkspaceUser.name,
            email: refreshedWorkspaceUser.email,
            role: refreshedWorkspaceUser.role,
          }
        : null,
    });

    if (context.invalidActingUserId) {
      response.headers.append("Set-Cookie", clearActingUserCookie());
    }

    return response;
  } catch (error) {
    console.error("Get profile error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to get profile";
    const status =
      message.includes("invite this email address") ||
      message.includes("deactivated")
        ? 403
        : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function PATCH(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const name = body?.name?.trim();
    const email = body?.email?.trim().toLowerCase();

    if (!name || !email) {
      return Response.json(
        { error: "Name and email are required" },
        { status: 400 },
      );
    }

    if (!isAllowedWorkspaceEmail(email)) {
      return Response.json(
        { error: workspaceEmailAccessMessage() },
        { status: 403 },
      );
    }

    const existingByEmail = await sql`
      SELECT id FROM users WHERE email = ${email} AND email <> ${session.user.email}
    `;

    if (existingByEmail.length > 0) {
      return Response.json(
        { error: "That email address is already in use." },
        { status: 400 },
      );
    }

    const result = await sql`
      UPDATE users
      SET name = ${name}, email = ${email}, updated_at = NOW()
      WHERE email = ${session.user.email}
      RETURNING id, name, email, role, created_at
    `;

    await sql`
      UPDATE auth_users
      SET name = ${name}, email = ${email}
      WHERE email = ${session.user.email}
    `;

    if (result.length === 0) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }

    return Response.json({
      user: result[0],
      requiresReauth: email !== session.user.email,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return Response.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }
}
