import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { isAllowedWorkspaceEmail, workspaceEmailAccessMessage } from "@/utils/authDomain";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";

export async function GET() {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUser(session);
    return Response.json({ user });
  } catch (error) {
    console.error("Get profile error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to get profile";
    const status = message.includes("invite this email address") ? 403 : 500;
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
