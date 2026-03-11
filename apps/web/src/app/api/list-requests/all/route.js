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

    const reviewer = await sql`
      SELECT id, role
      FROM users
      WHERE email = ${session.user.email}
      LIMIT 1
    `;

    if (reviewer.length === 0 || reviewer[0].role !== "reviewer") {
      return Response.json(
        { error: "Forbidden — reviewers only" },
        { status: 403 },
      );
    }

    const requests = await sql`
      SELECT
        lr.*,
        requester.name AS requester_user_name,
        reviewer_user.name AS reviewer_name
      FROM list_requests lr
      LEFT JOIN users requester ON lr.user_id = requester.id
      LEFT JOIN users reviewer_user ON lr.reviewed_by = reviewer_user.id
      ORDER BY
        lr.queue_priority ASC,
        lr.date_needed ASC NULLS LAST,
        lr.created_at ASC
    `;

    return Response.json(requests);
  } catch (error) {
    console.error("Error fetching list requests:", error);
    return Response.json(
      { error: "Failed to fetch list requests" },
      { status: 500 },
    );
  }
}
