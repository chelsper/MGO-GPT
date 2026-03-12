import { auth } from "@/auth";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  getBlackbaudConfig,
  getBlackbaudConfigIssues,
  getValidBlackbaudConnection,
} from "@/app/api/utils/blackbaud";

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const user = await getOrCreateUser(session);
  const config = getBlackbaudConfig(origin);
  const configIssues = getBlackbaudConfigIssues(origin);

  try {
    const connection = await getValidBlackbaudConnection(user.id, origin);

    return Response.json({
      configured: configIssues.length === 0,
      configIssues,
      redirectUri: config.redirectUri,
      subscriptionKeyConfigured: Boolean(config.subscriptionKey),
      connected: Boolean(connection),
      scope: connection?.scope || null,
      expiresAt: connection?.expires_at || null,
      connectedAt: connection?.connected_at || null,
      updatedAt: connection?.updated_at || null,
    });
  } catch (connectionError) {
    return Response.json(
      {
        configured: configIssues.length === 0,
        configIssues,
        connected: false,
        error:
          connectionError instanceof Error
            ? connectionError.message
            : "Failed to load Blackbaud connection status.",
      },
      { status: 500 },
    );
  }
}
