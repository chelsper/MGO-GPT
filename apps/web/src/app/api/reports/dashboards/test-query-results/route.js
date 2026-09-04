import { requireDashboardUser } from "@/app/api/utils/dashboardAuth";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { validateDashboardQueryId } from "@/app/api/utils/dashboardConfiguration";
import {
  DashboardQueryResultsError,
  runDashboardQueryResults,
} from "@/app/api/utils/dashboardQueryResults";
import { getReportCacheHeaders } from "@/app/api/utils/reportCache";

export const maxDuration = 120;

function respond(payload, status = 200) {
  return Response.json(payload, { status, headers: getReportCacheHeaders("test") });
}

export async function POST(request) {
  let user;
  try {
    user = await requireDashboardUser();
  } catch (error) {
    if (error?.status === 401) return respond({ error: "Unauthorized" }, 401);
    if (error?.status === 403) return respond({ error: "Dashboard access is not available for this account." }, 403);
    return respond({ error: "Could not verify dashboard access." }, 502);
  }
  if (!canManageWorkspaceRole(user?.role)) {
    return respond({ error: "Only report managers can test saved queries." }, 403);
  }
  const body = await request.json().catch(() => null);
  const validationError = validateDashboardQueryId(body?.queryId);
  if (validationError) return respond({ error: validationError }, 400);

  try {
    const { headers, rows, dataSource, queryJobRowCount } = await runDashboardQueryResults({
      user,
      origin: new URL(request.url).origin,
      queryId: body.queryId,
    });
    return respond({
      queryId: String(body.queryId),
      headers,
      rows,
      dataSource,
      queryJobRowCount,
      testedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof DashboardQueryResultsError) {
      return respond({ error: error.message }, error.status);
    }
    return respond({ error: "Could not retrieve the saved query results. No report snapshot was changed." }, 502);
  }
}
