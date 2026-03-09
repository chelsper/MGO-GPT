import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

export async function GET() {
  try {
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
