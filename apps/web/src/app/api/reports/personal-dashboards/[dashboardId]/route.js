import { requireDashboardUser } from "@/app/api/utils/dashboardAuth";
import { readPersonalDashboard } from "@/app/api/utils/personalDashboards";
import { metricResponse } from "../../metrics/route";
import { personalFailure } from "../route";

export async function GET(request, context) {
  try {
    const user = await requireDashboardUser();
    const { dashboardId } = await context.params;
    return metricResponse(await readPersonalDashboard(user, dashboardId));
  } catch (error) { return personalFailure(error); }
}
