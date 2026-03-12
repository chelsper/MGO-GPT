import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  assertAssignableRole,
  getBootstrapAdminEmail,
  normalizeEmail,
} from "@/app/api/utils/invitations";
import { isAdminRole } from "@/utils/workspaceRoles";

async function requireAdminSession() {
  await ensureAppSchema();

  const session = await auth();
  if (!session || !session.user?.email) {
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

    const [users, invitations] = await Promise.all([
      sql`
        SELECT id, name, email, role, created_at, updated_at
        FROM users
        ORDER BY
          CASE WHEN email = ${getBootstrapAdminEmail() || ""} THEN 0 ELSE 1 END,
          LOWER(name) ASC,
          LOWER(email) ASC
      `,
      sql`
        SELECT
          inv.id,
          inv.email,
          inv.role,
          inv.accepted_at,
          inv.revoked_at,
          inv.created_at,
          inviter.name AS invited_by_name,
          inviter.email AS invited_by_email
        FROM user_invitations inv
        LEFT JOIN users inviter ON inviter.id = inv.invited_by
        ORDER BY inv.created_at DESC
      `,
    ]);

    return Response.json({
      currentUser: user,
      bootstrapAdminEmail: getBootstrapAdminEmail() || null,
      users,
      invitations,
    });
  } catch (error) {
    console.error("Admin access GET error:", error);
    return Response.json(
      { error: error?.message || "Failed to load access management" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const { user, error } = await requireAdminSession();
    if (error) return error;

    const body = await request.json();
    const email = normalizeEmail(body?.email);
    const role = body?.role;

    if (!email) {
      return Response.json({ error: "Email is required" }, { status: 400 });
    }

    assertAssignableRole(role);

    const existingUser = await sql`
      SELECT id
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;

    if (existingUser.length > 0) {
      const updatedUser = await sql`
        UPDATE users
        SET role = ${role}, updated_at = NOW()
        WHERE id = ${existingUser[0].id}
        RETURNING id, name, email, role, created_at, updated_at
      `;

      return Response.json({
        mode: "user-updated",
        user: updatedUser[0],
      });
    }

    const invitation = await sql`
      INSERT INTO user_invitations (email, role, invited_by, accepted_at, revoked_at, created_at, updated_at)
      VALUES (${email}, ${role}, ${user.id}, NULL, NULL, NOW(), NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        role = EXCLUDED.role,
        invited_by = EXCLUDED.invited_by,
        accepted_at = NULL,
        revoked_at = NULL,
        updated_at = NOW()
      RETURNING *
    `;

    return Response.json(
      {
        mode: "invitation-created",
        invitation: invitation[0],
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Admin access POST error:", error);
    return Response.json(
      { error: error?.message || "Failed to save invitation" },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = await request.json();
    const userId = Number(body?.userId);
    const role = body?.role;

    if (!Number.isInteger(userId) || userId <= 0) {
      return Response.json({ error: "User id is required" }, { status: 400 });
    }

    assertAssignableRole(role);

    const updatedUser = await sql`
      UPDATE users
      SET role = ${role}, updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, name, email, role, created_at, updated_at
    `;

    if (updatedUser.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    return Response.json({ user: updatedUser[0] });
  } catch (error) {
    console.error("Admin access PATCH error:", error);
    return Response.json(
      { error: error?.message || "Failed to update user role" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "Invitation id is required" }, { status: 400 });
    }

    const result = await sql`
      UPDATE user_invitations
      SET revoked_at = NOW(), updated_at = NOW()
      WHERE id = ${id}
        AND accepted_at IS NULL
        AND revoked_at IS NULL
      RETURNING id
    `;

    if (result.length === 0) {
      return Response.json(
        { error: "Invitation not found or already inactive" },
        { status: 404 },
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Admin access DELETE error:", error);
    return Response.json(
      { error: error?.message || "Failed to revoke invitation" },
      { status: 500 },
    );
  }
}
