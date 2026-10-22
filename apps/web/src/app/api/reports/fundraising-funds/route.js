import { requireDashboardUser } from "@/app/api/utils/dashboardAuth";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { getReportCacheHeaders } from "@/app/api/utils/reportCache";
import { isSystemId } from "@/utils/fundraisingTracker";

// Explicit fund-picker action only; opening a dashboard does not fetch this directory.
export async function POST(request) {
  try {
    const user = await requireDashboardUser();
    if (!canManageWorkspaceRole(user.role)) return Response.json({ error: "Report management access required." }, { status: 403, headers: getReportCacheHeaders("error") });
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid request." }, { status: 400, headers: getReportCacheHeaders("error") });
    const { offset = 0 } = body;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 20000 || offset % 500 !== 0)
      return Response.json({ error: "Invalid fund directory page." }, { status: 400, headers: getReportCacheHeaders("error") });
    const result = await blackbaudApiFetch("/fundraising/v1/funds", { userId: user.id, origin: new URL(request.url).origin,
      searchParams: { limit: 500, offset, include_inactive: true }, maxRetries: 0 });
    if (!Array.isArray(result?.value) || result.value.length > 500 || result.value.some((f) => !isSystemId(f.id) || typeof f.description !== "string" || !f.description.trim())) throw new Error("Invalid funds");
    return Response.json({ funds: result.value.map((f) => ({ id: f.id, name: f.description, lookupId: f.lookup_id || "", inactive: f.inactive === true })),
      nextOffset: result.next_link || result.value.length === 500 ? offset + 500 : null }, { headers: getReportCacheHeaders("directory") });
  } catch (error) {
    return Response.json({ error: error.status === 401 ? "Unauthorized" : "NXT funds could not be loaded. Try again later." },
      { status: [401, 403].includes(error.status) ? error.status : 503, headers: getReportCacheHeaders("error") });
  }
}
