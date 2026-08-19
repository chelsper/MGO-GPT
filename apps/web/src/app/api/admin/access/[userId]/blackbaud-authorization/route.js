import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import sql from "@/app/api/utils/sql";
import {
  buildBlackbaudAuthorizeUrl,
  createBlackbaudState,
  getBlackbaudConfigIssues,
} from "@/app/api/utils/blackbaud";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";

async function requireAdminSession() {
  await ensureAppSchema();

  const session = await auth();
  if (!session?.user?.email) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await getOrCreateUser(session, "admin");
  if (!canManageWorkspaceRole(user.role)) {
    return {
      error: Response.json(
        { error: "Forbidden — workspace administrators only" },
        { status: 403 },
      ),
    };
  }

  return { user };
}

export async function POST(request, { params }) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const userId = Number(params?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return Response.json({ error: "Valid user id is required" }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const issues = getBlackbaudConfigIssues(origin);
    if (issues.length > 0) {
      return Response.json(
        { error: "Blackbaud configuration is incomplete", issues },
        { status: 500 },
      );
    }

    const users = await sql`
      SELECT id, name, email, role, active
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;
    const targetUser = users[0];

    if (!targetUser) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    if (!targetUser.active) {
      return Response.json(
        { error: "Inactive app users cannot receive a Blackbaud reauthorization link." },
        { status: 400 },
      );
    }

    const state = await createBlackbaudState({
      userId: targetUser.id,
      redirectPath: "/account/signin",
    });
    const authorizeUrl = buildBlackbaudAuthorizeUrl({ origin, state });
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return Response.json({
      authorizeUrl,
      expiresAt,
      user: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
      },
    });
  } catch (error) {
    console.error("Admin Blackbaud authorization link error:", error);
    return Response.json(
      { error: error?.message || "Failed to create Blackbaud authorization link" },
      { status: 500 },
    );
  }
}
