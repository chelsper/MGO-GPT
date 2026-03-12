import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { isReviewerRole } from "@/utils/workspaceRoles";

export async function GET() {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await getOrCreateUser(session, "reviewer");
    if (!isReviewerRole(currentUser.role)) {
      return Response.json(
        { error: "Forbidden — reviewers only" },
        { status: 403 },
      );
    }

    const users = await sql`
      SELECT id, name, email
      FROM users
      WHERE role = 'mgo'
      ORDER BY LOWER(name) ASC, LOWER(email) ASC
    `;

    return Response.json(users);
  } catch (error) {
    console.error("Error fetching MGO users:", error);
    return Response.json(
      { error: error?.message || "Failed to fetch MGO users" },
      { status: 500 },
    );
  }
}
