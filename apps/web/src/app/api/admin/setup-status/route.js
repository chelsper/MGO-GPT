import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { readSetupStatus } from "@/app/api/utils/setupStatus";
import { canManageWorkspaceRole, isAdminRole } from "@/utils/workspaceRoles";

const reply = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
    },
  });

export async function GET(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.email)
      return reply({ error: "Sign in to view setup." }, 401);
    // Authorize the actual saved account, never an acting workspace or session role.
    const [user] =
      await sql`SELECT id, role, active FROM users WHERE LOWER(email) = LOWER(${session.user.email}) LIMIT 1`;
    if (user?.active !== true || !canManageWorkspaceRole(user.role)) {
      return reply(
        {
          error:
            "Setup is available to active Admin and Advancement Services users only.",
        },
        403,
      );
    }
    return reply(
      await readSetupStatus({
        viewerId: user.id,
        isAdmin: isAdminRole(user.role),
      }),
    );
  } catch {
    return reply(
      {
        error:
          "Saved setup could not be read. No NXT checks or changes were started.",
      },
      503,
    );
  }
}
