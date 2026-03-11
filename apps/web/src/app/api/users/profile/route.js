import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";

export async function GET() {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile from users table
    const result = await sql`
      SELECT id, name, email, role, created_at
      FROM users
      WHERE email = ${session.user.email}
      LIMIT 1
    `;

    if (result.length > 0) {
      return Response.json({ user: result[0] });
    }

    // User doesn't exist in users table yet (complete-signup may have failed).
    // Auto-create them with default role "mgo" so the app works.
    const userName = session.user.name || session.user.email.split("@")[0];
    const created = await sql`
      INSERT INTO users (name, email, role, created_at)
      VALUES (${userName}, ${session.user.email}, 'mgo', NOW())
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, email, role, created_at
    `;

    if (created.length > 0) {
      return Response.json({ user: created[0] });
    }

    return Response.json({ error: "User profile not found" }, { status: 404 });
  } catch (error) {
    console.error("Get profile error:", error);
    return Response.json({ error: "Failed to get profile" }, { status: 500 });
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
