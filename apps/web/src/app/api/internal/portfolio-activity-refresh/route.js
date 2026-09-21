import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { getReportRefreshUser } from "@/app/api/utils/reportRefresh";
import { activityOrigin } from "@/app/api/utils/portfolioActivityData";
import { activityEnrollmentConfig, resolveActivityEnrollment } from "@/app/api/utils/portfolioActivityEnrollment";
import { refreshPortfolioActivity } from "@/app/api/utils/portfolioActivityRefresh";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { activityRunWindow } from "@/app/api/utils/portfolioActivityCatchup";

export const maxDuration = 120;

export async function GET(request) {
  const secret = process.env.CRON_SECRET || process.env.REPORT_REFRESH_CRON_SECRET;
  const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return reply({ error: "Unauthorized" }, 401);
  const enrollment = activityEnrollmentConfig();
  const origin = activityOrigin();
  if (!enrollment.enabled || !origin || process.env.VERCEL_ENV === "preview") return reply({ status: "disabled" });
  const window = activityRunWindow(new Date(), new URL(request.url).searchParams.get("force") === "1");
  if (!window) return reply({ status: "outside_window" });
  try {
    await ensureAppSchema();
    const refreshUser = await getReportRefreshUser();
    if (!refreshUser?.id || refreshUser.active === false || !isReviewerRole(refreshUser.role)) return reply({ status: "disabled" });
    const { workspaceIds } = await resolveActivityEnrollment(enrollment);
    if (!workspaceIds.length) return reply({ status: "idle", reason: "no_enrolled_workspaces" });
    return reply(await refreshPortfolioActivity({ workspaceIds, origin, refreshUser,
      ...(window === "catchup" ? { catchup: true } : {}) }));
  } catch {
    return reply({ status: "paused", reason: "refresh_unavailable" }, 503);
  }
}
