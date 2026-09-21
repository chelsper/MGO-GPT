import { requireDashboardUser } from "@/app/api/utils/dashboardAuth";
import { readMetricLibraryResult } from "@/app/api/utils/reportMetricLibrary";
import { metricResponse, metricFailure, requireMetricManager } from "../route";

export async function GET(request, context) {
  try {
    const user = await requireDashboardUser();
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    if (preview) requireMetricManager(user);
    const { metricId } = await context.params;
    return metricResponse(await readMetricLibraryResult(user, metricId, preview));
  } catch (error) { return metricFailure(error); }
}
