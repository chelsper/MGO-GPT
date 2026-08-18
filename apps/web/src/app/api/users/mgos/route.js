import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isAssignableRole } from "@/utils/workspaceRoles";

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: currentUser } = await getWorkspaceUser(session, request);
    if (!currentUser) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const users = await sql`
      SELECT id, name, email, role, blackbaud_constituent_id, blackbaud_lookup_id
      FROM users
      WHERE active = TRUE
      ORDER BY LOWER(name) ASC, LOWER(email) ASC
    `;

    const assignableWorkspaceUsers = users.filter((user) => isAssignableRole(user.role));

    const assignableUsers =
      assignableWorkspaceUsers.some((user) => user.id === currentUser.id)
        ? assignableWorkspaceUsers
        : [
            {
              id: currentUser.id,
              name: currentUser.name,
              email: currentUser.email,
              role: currentUser.role,
              blackbaud_constituent_id: currentUser.blackbaud_constituent_id,
              blackbaud_lookup_id: currentUser.blackbaud_lookup_id,
            },
            ...assignableWorkspaceUsers,
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
