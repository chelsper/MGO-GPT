import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { getReportRefreshUser } from "@/app/api/utils/reportRefresh";
import { activityOrigin } from "@/app/api/utils/portfolioActivityData";
import { activityEnrollmentConfig, resolveActivityEnrollment } from "@/app/api/utils/portfolioActivityEnrollment";
import { refreshPortfolioActivity } from "@/app/api/utils/portfolioActivityRefresh";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { PORTFOLIO_REFRESH_HOURS } from "@/app/api/utils/portfolioMaintenancePolicy";

export const maxDuration = 120;

export async function GET(request) {
  const secret = process.env.CRON_SECRET || process.env.REPORT_REFRESH_CRON_SECRET;
  const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return reply({ error: "Unauthorized" }, 401);
  const enrollment = activityEnrollmentConfig();
  const origin = activityOrigin();
  if (!enrollment.enabled || !origin || process.env.VERCEL_ENV === "preview") return reply({ status: "disabled" });
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(new Date()));
  if (!PORTFOLIO_REFRESH_HOURS.includes(hour) && new URL(request.url).searchParams.get("force") !== "1") return reply({ status: "outside_window" });
  try {
    await ensureAppSchema();
    const refreshUser = await getReportRefreshUser();
    if (!refreshUser?.id || refreshUser.active === false || !isReviewerRole(refreshUser.role)) return reply({ status: "disabled" });
    const { workspaceIds } = await resolveActivityEnrollment(enrollment);
    if (!workspaceIds.length) return reply({ status: "idle", reason: "no_enrolled_workspaces" });
    return reply(await refreshPortfolioActivity({ workspaceIds, origin, refreshUser }));
  } catch {
    return reply({ status: "paused", reason: "refresh_unavailable" }, 503);
  }
}
