import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { canEditWorkspace } from "@/utils/workspaceRoles";
import { linkError, systemId, loadLinkProspect, listLinkCandidates, linkExistingOpportunity } from "@/app/api/utils/existingOpportunityLink";

const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function handle(request, { params }, saving) {
  try {
    const session = await auth();
    if (!session?.user?.email) return reply({ error: "Unauthorized" }, 401);
    const workspace = await getWorkspaceUser(session, request);
    if (!canEditWorkspace(workspace)) return reply({ error: "This workspace is read-only." }, 403);
    const { workspaceUser, sessionUser } = workspace;
    const url = new URL(request.url);
    if (request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.get("origin") && request.headers.get("origin") !== url.origin))
      return reply({ error: "Use this app to link an opportunity." }, 403);
    if (!systemId(params.id)) return reply({ error: "Invalid prospect ID." }, 400);
    const scope = `${sessionUser.id}:${workspaceUser.id}`;
    const body = saving ? await request.json() : null;
    if ((saving ? body?.scope : url.searchParams.get("scope")) !== scope)
      throw linkError("Your workspace changed. Close this picker and reopen it in the correct workspace.");
    if (saving && !systemId(body?.opportunityId)) return reply({ error: "Select an NXT opportunity." }, 400);
    await ensureAppSchema();
    const prospect = await loadLinkProspect(workspaceUser.id, params.id);
    const context = { userId: workspaceUser.id, authUserId: sessionUser.id, origin: url.origin };
    return reply(saving
      ? await linkExistingOpportunity(context, prospect, String(body.opportunityId))
      : { opportunities: await listLinkCandidates(context, prospect) });
  } catch (error) {
    return reply({ error: error?.linkStatus ? error.message : "NXT could not be checked or the link could not be saved. Your existing opportunities are unchanged. Reload the list before retrying." }, error?.linkStatus || 503);
  }
}

export const GET = (request, context) => handle(request, context, false);
export const POST = (request, context) => handle(request, context, true);
