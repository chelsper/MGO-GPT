import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUser(session);
    const userId = user.id;

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
