import { auth } from "@/auth";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { getNameFormatConfigurations } from "@/app/api/utils/safeConstituentCreate";

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionUser: user } = await getWorkspaceUser(session, request);
  if (!user || !isReviewerRole(user.role)) return Response.json({ error: "Advancement Services access required." }, { status: 403 });
  try {
    const formats = await getNameFormatConfigurations({ userId: user.id, authUserId: user.id, origin: new URL(request.url).origin });
    return Response.json({ formats }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "NXT name formats could not be loaded. Check your NXT connection and try again; no default was changed." }, { status: 502 });
  }
}
