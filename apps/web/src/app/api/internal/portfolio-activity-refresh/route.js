import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { getReportRefreshUser } from "@/app/api/utils/reportRefresh";
import { activityOrigin, activityWorkspaceIds } from "@/app/api/utils/portfolioActivityData";
import { refreshPortfolioActivity } from "@/app/api/utils/portfolioActivityRefresh";

export const maxDuration = 120;

export async function GET(request) {
  const secret = process.env.CRON_SECRET || process.env.REPORT_REFRESH_CRON_SECRET;
  const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return reply({ error: "Unauthorized" }, 401);
  const workspaceIds = activityWorkspaceIds();
  const origin = activityOrigin();
  if (!workspaceIds.length || !origin || process.env.VERCEL_ENV === "preview") return reply({ status: "disabled" });
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(new Date()));
  if (!(hour >= 1 && hour < 7) && new URL(request.url).searchParams.get("force") !== "1") return reply({ status: "outside_window" });
  try {
    await ensureAppSchema();
    const refreshUser = await getReportRefreshUser();
    return reply(await refreshPortfolioActivity({ workspaceIds, origin, refreshUser }));
  } catch {
    return reply({ status: "paused", reason: "refresh_unavailable" }, 503);
  }
}
