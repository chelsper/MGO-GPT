import { requireDashboardUser } from "@/app/api/utils/dashboardAuth";
import { readPersonalWorkspace, savePersonalWorkspace } from "@/app/api/utils/personalDashboards";
import { dashboardError } from "@/app/api/utils/dashboardConfigurations";
import { metricResponse } from "../metrics/route";

export const personalFailure = (error) => metricResponse({ error: error.status ? error.message : "Personal dashboards could not be loaded or saved. Try again." }, error.status || 500);

export async function GET() {
  try { return metricResponse(await readPersonalWorkspace(await requireDashboardUser())); }
  catch (error) { return personalFailure(error); }
}

export async function PUT(request) {
  try {
    const user = await requireDashboardUser();
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site")
      throw dashboardError("Request must come from this app.", 403);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 24000) throw dashboardError("Dashboard settings are too large.", 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw dashboardError("Expected valid dashboard settings."); }
    return metricResponse(await savePersonalWorkspace(user, body));
  } catch (error) { return personalFailure(error); }
}
