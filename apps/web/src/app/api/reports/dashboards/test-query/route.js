import { requireDashboardUser } from "@/app/api/utils/dashboardAuth";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { validateDashboardQueryId } from "@/app/api/utils/dashboardConfiguration";
import { runDashboardQueryCount } from "@/app/api/utils/dashboardQueryCount";
import { getReportCacheHeaders } from "@/app/api/utils/reportCache";

export const maxDuration = 120;

export async function POST(request) {
  try {
    const user = await requireDashboardUser();
    if (!canManageWorkspaceRole(user.role))
      return Response.json(
        { error: "Only report managers can test saved queries." },
        { status: 403 },
      );
    const body = await request.json().catch(() => null);
    const validationError = validateDashboardQueryId(body?.queryId);
    if (validationError)
      return Response.json({ error: validationError }, { status: 400 });
    const result = await runDashboardQueryCount({
      user,
      origin: new URL(request.url).origin,
      queryId: body.queryId,
    });
    return Response.json(
      {
        queryId: String(body.queryId),
        count: result.value,
        ...result,
        testedAt: new Date().toISOString(),
      },
      { headers: getReportCacheHeaders("test") },
    );
  } catch (error) {
    const status = [401, 403, 400].includes(error.status) ? error.status : 502;
    return Response.json(
      {
        error:
          status === 502
            ? "Could not count the saved query. No report snapshot was changed."
            : error.message,
      },
      { status, headers: getReportCacheHeaders("test") },
    );
  }
}
