import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import { giftFollowUpFilters, readStewardshipGiftFollowUps } from "@/app/api/utils/stewardshipGiftFollowUps";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const reply = (body, status = 200) => Response.json(body, { status, headers });

export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return reply({ error: "Sign in to view gift follow-ups." }, 401);
    await ensureAppSchema();
    const { sessionUser } = await getWorkspaceUser(session, request);
    // This is an organization-wide reviewer view, never a delegated MGO workspace view.
    if (!sessionUser?.id || sessionUser.active === false || !isReviewerRole(sessionUser.role)) {
      return reply({ error: "Gift Follow-ups is available to Admin and Advancement Services users." }, 403);
    }
    let filters;
    try { filters = giftFollowUpFilters(new URL(request.url).searchParams); }
    catch { return reply({ error: "Choose valid search and filter values." }, 400); }
    const { asOf, timeZone } = getStandingsPeriods();
    const result = await readStewardshipGiftFollowUps(sql, filters, asOf);
    return reply({ ...result, asOf, timeZone, viewerKey: String(session.user.id || session.user.email) });
  } catch {
    return reply({ error: "Gift follow-ups could not be loaded. Please try again." }, 500);
  }
}
