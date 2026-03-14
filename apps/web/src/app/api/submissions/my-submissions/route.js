import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user from users table
    let userResult = await sql`
      SELECT id FROM users WHERE email = ${session.user.email} LIMIT 1
    `;

    // Auto-create user if not found (complete-signup may have failed)
    if (userResult.length === 0) {
      const userName = session.user.name || session.user.email.split("@")[0];
      userResult = await sql`
        INSERT INTO users (name, email, role, created_at)
        VALUES (${userName}, ${session.user.email}, 'mgo', NOW())
        ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `;
    }

    if (userResult.length === 0) {
      return Response.json([]);
    }

    const userId = userResult[0].id;

    // Get submissions with reviewer info
    const submissions = await sql`
      SELECT 
        s.*,
        r.name as reviewer_name,
        c.blackbaud_constituent_id
      FROM submissions s
      LEFT JOIN users r ON s.reviewed_by = r.id
      LEFT JOIN constituents c ON c.id = s.constituent_id
      WHERE s.user_id = ${userId}
      ORDER BY s.date_submitted DESC
    `;

    return Response.json(submissions);
  } catch (error) {
    console.error("Error fetching submissions:", error);
    return Response.json(
      { error: "Failed to fetch submissions" },
      { status: 500 },
    );
  }
}
