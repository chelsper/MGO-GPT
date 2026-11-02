import { auth } from "@/auth";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { checkPortfolioStewardshipScope, readPortfolioStewardship } from "@/app/api/utils/portfolioStewardship";

const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.email) return reply({ error: "Please sign in." }, 401);
    const context = await getWorkspaceUser(session, request);
    const params = new URL(request.url).searchParams;
    const scope = Object.fromEntries(["viewerId", "workspaceId", "constituentId"].map(key => [key, params.get(key)]));
    await checkPortfolioStewardshipScope(context, scope);
    const saved = await readPortfolioStewardship(context, scope.constituentId);
    return reply({ ...saved, ...scope, ownerName: context.workspaceUser.name });
  } catch (error) {
    return reply({ error: error.stewardshipScope ? error.message : "Saved stewardship details could not be loaded. Please try again; nothing has been changed." },
      error.stewardshipScope ? error.status : 500);
  }
}
