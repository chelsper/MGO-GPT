import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { getBlackbaudConfigIssues } from "@/app/api/utils/blackbaud";
import { refreshLinkedProspectOpportunities } from "@/app/api/utils/prospectOpportunityRefresh";

export const maxDuration = 60;
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.email) return reply({ error: "Unauthorized" }, 401);
    const { workspaceUser, sessionUser, isActing } = await getWorkspaceUser(session, request);
    if (!workspaceUser) return reply({ error: "Workspace not found" }, 404);
    await ensureAppSchema();
    const [prospect] = await sql`
      SELECT p.id, COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id) AS nxt_constituent_id
      FROM prospects p LEFT JOIN constituents c ON c.id = p.constituent_id
      WHERE p.id = ${params.id} AND p.user_id = ${workspaceUser.id} LIMIT 1
    `;
    if (!prospect) return reply({ error: "Prospect not found" }, 404);
    const url = new URL(request.url);
    if (getBlackbaudConfigIssues(url.origin).length) return reply({ status: "unavailable" });
    const result = await refreshLinkedProspectOpportunities({
      userId: workspaceUser.id, authUserId: isActing ? sessionUser.id : workspaceUser.id,
      origin: url.origin, prospectId: prospect.id, constituentId: prospect.nxt_constituent_id,
      force: url.searchParams.get("force") === "1",
    });
    return reply({ ...result, status: result.unavailable ? "unavailable" : result.deferred ? "deferred" : "current" });
  } catch {
    return reply({ error: "Could not check NXT opportunities. Saved details have been retained." }, 503);
  }
}
