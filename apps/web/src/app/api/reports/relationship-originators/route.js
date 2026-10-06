import { getCachedReportSnapshot } from "@/app/api/utils/reportCache";
import { getReportAccessForUser, EXECUTIVE_TEAM_STANDINGS_REPORT_KEY } from "@/app/api/utils/reportAccess";
import { originatorUser, checkOriginatorRequest, originatorResponseError, originatorHeaders } from "@/app/api/utils/relationshipOriginator";
import { ORIGINATOR_REPORT_KEY, refreshOriginatorReport } from "@/app/api/utils/relationshipOriginatorReport";
import { OriginatorError } from "@/app/api/utils/relationshipOriginatorModel";
import { isAdminRole, isReviewerRole } from "@/utils/workspaceRoles";
import { getReportRefreshUser } from "@/app/api/utils/reportRefresh";

export const dynamic = "force-dynamic";
export const maxDuration = 150;
async function authorizedUser() {
  const user = await originatorUser();
  const access = await getReportAccessForUser(EXECUTIVE_TEAM_STANDINGS_REPORT_KEY, user);
  if (!access.canView) throw new OriginatorError("You do not have access to Team Standings.", 403);
  return user;
}
function publicReport(report, user) {
  if (!report) return { status: "refresh_required", rows: [] };
  return { ...report, issueCount: report.issues?.length || 0, issues: isAdminRole(user.role) ? report.issues : undefined };
}
export async function GET() {
  try {
    const user = await authorizedUser();
    return Response.json(publicReport(await getCachedReportSnapshot(ORIGINATOR_REPORT_KEY), user), { headers: originatorHeaders });
  } catch (error) { return originatorResponseError(error); }
}
export async function POST(request) {
  try {
    const user = await authorizedUser();
    checkOriginatorRequest(request);
    // A restricted MGO connection must not overwrite the shared team totals
    // with a smaller visible subset. Use the established report connection.
    const reportUser = await getReportRefreshUser();
    if (!reportUser || !isReviewerRole(reportUser.role)) throw new OriginatorError("An Admin needs to connect an authorized NXT reporting account before these shared metrics can refresh.");
    const result = await refreshOriginatorReport({ user: reportUser, origin: new URL(request.url).origin });
    return Response.json(publicReport(result, user), { headers: originatorHeaders });
  } catch (error) { return originatorResponseError(error); }
}
