import { requireDashboardUser } from "@/app/api/utils/dashboardAuth";
import { dashboardError } from "@/app/api/utils/dashboardConfigurations";
import { listMetricLibrary, saveMetricLibraryEntry } from "@/app/api/utils/reportMetricLibrary";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";

export const metricResponse = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export const metricFailure = (error) => metricResponse({ error: error.status ? error.message : "The metric library could not be loaded or saved. Try again." }, error.status || 500);
export function requireMetricManager(user) {
  if (!canManageWorkspaceRole(user.role)) throw dashboardError("Only Admin and Advancement Services users can manage the metric library.", 403);
}

export async function GET(request) {
  try {
    const user = await requireDashboardUser();
    const manager = new URL(request.url).searchParams.get("manage") === "1";
    if (manager) requireMetricManager(user);
    return metricResponse({ canManage: canManageWorkspaceRole(user.role), ...await listMetricLibrary(user, manager) });
  } catch (error) { return metricFailure(error); }
}

async function save(request, create) {
  try {
    const user = await requireDashboardUser();
    requireMetricManager(user);
    if ((request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site")
      throw dashboardError("Request must come from this app.", 403);
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 16000) throw dashboardError("Metric settings are too large.", 413);
    let body;
    try { body = JSON.parse(text); } catch { throw dashboardError("Expected valid metric settings."); }
    return metricResponse({ entry: await saveMetricLibraryEntry(user, body, create) }, create ? 201 : 200);
  } catch (error) { return metricFailure(error); }
}
export const POST = (request) => save(request, true);
export const PATCH = (request) => save(request, false);
