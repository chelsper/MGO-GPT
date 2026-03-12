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

    const userRows = await sql`
      SELECT id
      FROM users
      WHERE email = ${session.user.email}
      LIMIT 1
    `;

    const user = userRows[0] || null;
    if (!user) {
      return Response.json([]);
    }

    const requests = await sql`
      SELECT
        lr.*,
        reviewer_user.name AS reviewer_name
      FROM list_requests lr
      LEFT JOIN users reviewer_user ON lr.reviewed_by = reviewer_user.id
      WHERE lr.user_id = ${user.id}
      ORDER BY lr.updated_at DESC, lr.created_at DESC
    `;

    return Response.json(requests);
  } catch (error) {
    console.error("Error fetching my list requests:", error);
    return Response.json(
      { error: "Failed to fetch list requests" },
      { status: 500 },
    );
  }
}
