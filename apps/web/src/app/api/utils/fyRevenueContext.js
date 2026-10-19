import { auth } from "@/auth";
import getOrCreateUser from "./getOrCreateUser";
import ensureAppSchema from "./ensureAppSchema";
import { getReportAccessForUser } from "./reportAccess";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { FY_REVENUE_KEY, revenueError } from "@/utils/fyRevenueGoals";

export const revenueHeaders = { "Cache-Control": "private, no-store" };
export async function requireRevenueContext(edit = false) {
  const session = await auth();
  if (!session?.user?.email) throw revenueError("Please sign in.", 401);
  const user = await getOrCreateUser(session);
  if (user?.active !== true) throw revenueError("This account is inactive.", 403);
  const canManage = canManageWorkspaceRole(user.role);
  if (edit && !canManage) throw revenueError("Only Admins and Advancement Services can refresh or configure this dashboard.", 403);
  await ensureAppSchema();
  const access = await getReportAccessForUser(FY_REVENUE_KEY, user);
  if (!access.canView && !canManage) throw revenueError("This dashboard has not been shared with you.", 403);
  return { user, canManage, title: access.title || "FY Revenue Goals" };
}
export const revenueFailure = error => Response.json({ error: error.revenueSafe ? error.message :
  "The revenue dashboard could not be loaded or refreshed. Previous totals are unchanged. Check the shared NXT connection and try again." },
{ status: error.revenueSafe ? error.status : 503, headers: revenueHeaders });

export async function readRevenueCommand(request) {
  const origin = new URL(request.url).origin;
  if ((request.headers.get("origin") && request.headers.get("origin") !== origin) || !request.headers.get("content-type")?.startsWith("application/json"))
    throw revenueError("Open this form in the app before refreshing.", 403);
  const text = await request.text();
  if (Buffer.byteLength(text) > 8000) throw revenueError("The revenue request is too large.", 413);
  let body; try { body = JSON.parse(text); } catch { throw revenueError("Invalid revenue request."); }
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !["operation", "input", "revision"].includes(key))) throw revenueError("Unknown revenue request field.");
  if (!["fields", "refresh"].includes(body.operation)) throw revenueError("Unknown revenue operation.");
  if (body.operation === "refresh" && body.revision !== null && (typeof body.revision !== "string" || !/^[a-f0-9-]{36}$/.test(body.revision)))
    throw revenueError("Reload saved totals before refreshing.", 409);
  return { body, origin };
}
