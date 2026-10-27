import { auth } from "@/auth";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { checkPortfolioOpportunityScope, findPortfolioProspect, readPortfolioOpportunities } from "@/app/api/utils/portfolioOpportunityContext";

const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return reply({ error: "Please sign in." }, 401);
    const context = await getWorkspaceUser(session, request);
    const params = new URL(request.url).searchParams;
    const scope = Object.fromEntries(["viewerId", "workspaceId", "constituentId"].map(key => [key, params.get(key)]));
    await checkPortfolioOpportunityScope(context, scope);
    const prospect = await findPortfolioProspect(context.workspaceUser.id, scope.constituentId);
    const saved = await readPortfolioOpportunities(context.workspaceUser.id, scope.constituentId);
    return reply({ ...saved, viewerId: context.sessionUser.id, workspaceId: context.workspaceUser.id,
      constituentId: scope.constituentId, ownerName: context.workspaceUser.name, authorName: context.sessionUser.name,
      prospectId: prospect?.id || null });
  } catch (error) {
    return reply({ error: error.portfolioPreflight ? error.message : "Saved opportunities could not be loaded. Nothing has been submitted." }, error.portfolioPreflight ? error.status : 500);
  }
}
