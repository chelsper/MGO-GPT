import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import { getValidBlackbaudConnection } from "@/app/api/utils/blackbaud";
import { bootstrapMgoPortfolioFromBlackbaud } from "@/app/api/utils/bootstrapMgoPortfolio";
import { isBootstrapAdminEmail } from "@/app/api/utils/invitations";
import { isAdminRole } from "@/utils/workspaceRoles";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";

async function clearBlackbaudPortfolioCacheForUser(userId) {
  if (!userId) return false;

  await sql`
    UPDATE users
    SET
      blackbaud_portfolio_cache = NULL,
      blackbaud_portfolio_cache_key = NULL,
      blackbaud_portfolio_cached_at = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `;

  return true;
}

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionUser, workspaceUser, isActing } = await getWorkspaceUser(session, request);
    const authUserId = isActing ? sessionUser.id : workspaceUser.id;
    const canSeedBootstrapAdmin =
      isBootstrapAdminEmail(workspaceUser?.email) &&
      Boolean(workspaceUser?.blackbaud_constituent_id) &&
      isAdminRole(sessionUser?.role);

    if (workspaceUser?.role !== "mgo" && !canSeedBootstrapAdmin) {
      return Response.json(
        { error: "Only MGOs or the linked bootstrap admin can sync Blackbaud opportunities." },
        { status: 403 },
      );
    }

    const origin = request?.url ? new URL(request.url).origin : null;
    const hasBlackbaudConnection = await getValidBlackbaudConnection(authUserId, origin).catch(
      () => null,
    );

    if (!hasBlackbaudConnection) {
      return Response.json(
        { error: "Connect Blackbaud before syncing opportunities." },
        { status: 400 },
      );
    }

    await clearBlackbaudPortfolioCacheForUser(workspaceUser.id);

    const result = await bootstrapMgoPortfolioFromBlackbaud({
      userId: workspaceUser.id,
      authUserId,
      origin,
      force: true,
    });

    await clearBlackbaudPortfolioCacheForUser(workspaceUser.id);

    return Response.json({ ok: true, result, blackbaudPortfolioCacheCleared: true });
  } catch (error) {
    console.error("Manual Blackbaud portfolio sync error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to sync from Blackbaud." },
      { status: 500 },
    );
  }
}
