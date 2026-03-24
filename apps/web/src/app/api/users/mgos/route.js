import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";

export async function GET() {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await getOrCreateUser(session);

    const users = await sql`
      SELECT id, name, email
      FROM users
      WHERE role = 'mgo' AND active = TRUE
      ORDER BY LOWER(name) ASC, LOWER(email) ASC
    `;

    const assignableUsers =
      users.some((user) => user.id === currentUser.id)
        ? users
        : [
            {
              id: currentUser.id,
              name: currentUser.name,
              email: currentUser.email,
            },
            ...users,
          ];

    return Response.json(assignableUsers);
  } catch (error) {
    console.error("Error fetching MGO users:", error);
    return Response.json(
      { error: error?.message || "Failed to fetch MGO users" },
      { status: 500 },
    );
  }
}
