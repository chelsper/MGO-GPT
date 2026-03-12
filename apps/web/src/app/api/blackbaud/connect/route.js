import { auth } from "@/auth";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  buildBlackbaudAuthorizeUrl,
  createBlackbaudState,
  getBlackbaudConfigIssues,
} from "@/app/api/utils/blackbaud";

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const issues = getBlackbaudConfigIssues(origin);
  if (issues.length > 0) {
    return Response.json(
      { error: "Blackbaud configuration is incomplete", issues },
      { status: 500 },
    );
  }

  const user = await getOrCreateUser(session);
  const redirectPath = new URL(request.url).searchParams.get("redirect") || "/settings";
  const state = await createBlackbaudState({ userId: user.id, redirectPath });
  const authorizeUrl = buildBlackbaudAuthorizeUrl({ origin, state });

  return Response.redirect(authorizeUrl, 302);
}
