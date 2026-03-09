import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, role } = body;

    // Validate role
    const validRoles = ["mgo", "reviewer"];
    const userRole = role && validRoles.includes(role) ? role : "mgo";

    // Check if user already exists in users table
    const existing = await sql`
      SELECT id FROM users WHERE email = ${email}
    `;

    if (existing.length > 0) {
      return Response.json({ success: true, user: existing[0] });
    }

    // Create user in users table
    const result = await sql`
      INSERT INTO users (name, email, role, created_at)
      VALUES (${name}, ${email}, ${userRole}, NOW())
      RETURNING id, name, email, role
    `;

    return Response.json({ success: true, user: result[0] });
  } catch (error) {
    console.error("Complete signup error:", error);
    return Response.json(
      { error: "Failed to complete signup" },
      { status: 500 },
    );
  }
}
