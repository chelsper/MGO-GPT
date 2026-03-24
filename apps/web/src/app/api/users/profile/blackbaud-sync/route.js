import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { getValidBlackbaudConnection } from "@/app/api/utils/blackbaud";
import { bootstrapMgoPortfolioFromBlackbaud } from "@/app/api/utils/bootstrapMgoPortfolio";
import { getBootstrapAdminEmail } from "@/app/api/utils/invitations";
import { isAdminRole } from "@/utils/workspaceRoles";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser, workspaceUser } = await getWorkspaceUser(session, request);
    const bootstrapAdminEmail = getBootstrapAdminEmail();
    const canSeedBootstrapAdmin =
      Boolean(bootstrapAdminEmail) &&
      workspaceUser?.email === bootstrapAdminEmail &&
      Boolean(workspaceUser?.blackbaud_constituent_id) &&
      isAdminRole(sessionUser?.role);

    if (workspaceUser?.role !== "mgo" && !canSeedBootstrapAdmin) {
      return Response.json(
        { error: "Only MGOs or the linked bootstrap admin can sync Blackbaud opportunities." },
        { status: 403 },
      );
    }

    const origin = request?.url ? new URL(request.url).origin : null;
    const hasBlackbaudConnection = await getValidBlackbaudConnection(workspaceUser.id, origin).catch(
      () => null,
    );

    if (!hasBlackbaudConnection) {
      return Response.json(
        { error: "Connect Blackbaud before syncing opportunities." },
        { status: 400 },
      );
    }

    const result = await bootstrapMgoPortfolioFromBlackbaud({
      userId: workspaceUser.id,
      origin,
      force: true,
    });

    return Response.json({ ok: true, result });
  } catch (error) {
    console.error("Manual Blackbaud portfolio sync error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to sync from Blackbaud." },
      { status: 500 },
    );
  }
}
