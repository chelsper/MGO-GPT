import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { isAdminRole } from "@/utils/workspaceRoles";
import { readIntegrationHealth } from "@/app/api/utils/integrationHealth";

const reply = (body, status = 200) => Response.json(body, { status,
  headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });

export async function GET(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.email) return reply({ error: "Sign in to view integration health." }, 401);
    // Read the actual account, never the acting workspace or client role. Avoid
    // getOrCreateUser/ensureAppSchema: this diagnostic must not initialize data.
    const [user] = await sql`SELECT id, role, active FROM users WHERE LOWER(email) = LOWER(${session.user.email}) LIMIT 1`;
    if (user?.active !== true || !isAdminRole(user.role)) return reply({ error: "Integration health is available to active Admin users only." }, 403);
    return reply(await readIntegrationHealth({ viewerId: user.id, origin: new URL(request.url).origin }));
  } catch {
    return reply({ error: "Saved integration status could not be read. No NXT checks or changes were started. Try loading the saved status again; if it persists, ask a developer to inspect the app database." }, 503);
  }
}
