import {
  requireDashboardUser,
  getActiveDashboardRefreshUser,
} from "@/app/api/utils/dashboardAuth";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import {
  dashboardError,
  getDashboardConfiguration,
  serializeDashboardConfiguration,
} from "@/app/api/utils/dashboardConfigurations";
import {
  getReportRefreshUser,
  isAuthorizedReportRefreshRequest,
} from "@/app/api/utils/reportRefresh";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  getCachedReportSnapshot,
  getReportCacheHeaders,
} from "@/app/api/utils/reportCache";
import {
  dashboardCacheKey,
  presentDashboardSnapshot,
  refreshDashboardSnapshot,
  saveDashboardSnapshot,
  publicDashboardSnapshot,
} from "@/app/api/utils/dashboardSnapshots";

export const maxDuration = 300;

async function handle(request, context, refresh) {
  try {
    const scheduled = refresh && isAuthorizedReportRefreshRequest(request);
    let user;
    if (scheduled) {
      await ensureAppSchema();
      user = await getActiveDashboardRefreshUser(await getReportRefreshUser());
      if (!user || !canManageWorkspaceRole(user.role))
        throw dashboardError("Authorized refresh manager unavailable.", 403);
    } else {
      user = await requireDashboardUser();
    }
    const { reportKey } = await context.params;
    const record = await getDashboardConfiguration(reportKey);
    if (!record) throw dashboardError("Unknown dashboard.", 404);
    const configuration = serializeDashboardConfiguration(record, user);
    const preview =
      !refresh && new URL(request.url).searchParams.get("preview") === "1";
    if (
      preview
        ? !configuration.canPreview
        : scheduled
          ? !configuration.active || !configuration.specificUserIds.length
          : !configuration.canView
    )
      throw dashboardError("Dashboard is not shared with you.", 403);
    const cached = await getCachedReportSnapshot(dashboardCacheKey(reportKey));
    const snapshot = refresh
      ? await refreshDashboardSnapshot({
          configuration: configuration.dataConfiguration,
          staticValueProvenance: configuration.staticValueProvenance,
          cached,
          user,
          origin: new URL(request.url).origin,
        })
      : presentDashboardSnapshot(
          configuration.dataConfiguration,
          cached,
          configuration.staticValueProvenance,
        );
    if (refresh) {
      // Configuration/access changes during a long query must not publish an obsolete checkpoint.
      const current = await getDashboardConfiguration(reportKey);
      if (!current || current.revision !== record.revision)
        throw dashboardError(
          "Configuration changed during refresh. Reload and try again.",
          409,
        );
      if (!(await saveDashboardSnapshot(reportKey, snapshot, cached)))
        throw dashboardError(
          "Another refresh completed first. Reload the saved snapshot.",
          409,
        );
    }
    return Response.json(
      {
        configuration,
        snapshot: publicDashboardSnapshot(snapshot),
        status: snapshot.status,
        refreshStatus: snapshot.refreshStatus,
        remainingQueryCount: snapshot.remainingQueryCount,
      },
      {
        headers: getReportCacheHeaders(
          refresh ? "refresh" : cached ? "hit" : "empty",
        ),
      },
    );
  } catch (error) {
    const status = error.status || 500;
    return Response.json(
      {
        error:
          status === 500
            ? "Could not load or refresh this dashboard."
            : error.message,
      },
      { status, headers: getReportCacheHeaders("error") },
    );
  }
}

export const GET = (request, context) => handle(request, context, false);
export const POST = (request, context) => handle(request, context, true);
