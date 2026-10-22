import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { getReportRefreshUser } from "@/app/api/utils/reportRefresh";
import { listGivingSocietyConfigurations } from "@/app/api/utils/givingSocietyConfigurations";
import { advanceSocietyGivingSource } from "@/app/api/utils/societyGivingSource";

export const maxDuration = 90;

export async function GET(request) {
  const secret = String(process.env.CRON_SECRET || process.env.REPORT_REFRESH_CRON_SECRET || "").trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureAppSchema();
  const user = await getReportRefreshUser();
  const roles = String(user?.role || "").toLowerCase().split(",").map((r) => r.trim());
  if (!user || !roles.some((role) => ["admin", "advancement_services"].includes(role))) {
    return Response.json({ status: "skipped", reason: "No authorized organization refresh account" }, { status: 503 });
  }
  try {
    const result = await advanceSocietyGivingSource({ authUserId: user.id,
      origin: new URL(request.url).origin, societyDefinitions: await listGivingSocietyConfigurations() });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable", reason: "Saved societies retained" }, { status: 503 });
  }
}
