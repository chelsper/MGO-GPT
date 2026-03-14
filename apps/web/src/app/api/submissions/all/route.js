import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { isReviewerRole } from "@/utils/workspaceRoles";

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is a reviewer
    const userResult = await sql`
      SELECT id, role FROM users WHERE email = ${session.user.email} LIMIT 1
    `;

    if (userResult.length === 0 || !isReviewerRole(userResult[0].role)) {
      return Response.json(
        { error: "Forbidden — reviewers only" },
        { status: 403 },
      );
    }

    const submissions = await sql`
      SELECT 
        s.*,
        u.name as officer_name,
        c.blackbaud_constituent_id
      FROM submissions s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN constituents c ON c.id = s.constituent_id
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
