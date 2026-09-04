import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import sql from "@/app/api/utils/sql";
import { dashboardError } from "@/app/api/utils/dashboardConfigurations";

export async function requireDashboardUser() {
  await ensureAppSchema();
  const session = await auth();
  if (!session?.user?.email) throw dashboardError("Unauthorized", 401);
  const user = await getOrCreateUser(session);
  if (user?.active !== true) throw dashboardError("Inactive account", 403);
  return user;
}

export async function getActiveDashboardRefreshUser(user) {
  if (!user) return null;
  const users =
    await sql`SELECT id, role, active FROM users WHERE id = ${user.id} AND active = TRUE LIMIT 1`;
  return users[0] || null;
}
