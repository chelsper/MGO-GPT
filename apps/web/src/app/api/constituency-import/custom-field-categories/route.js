import { auth } from "@/auth";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { importCustomFieldCatalog } from "@/app/api/utils/importCustomFields";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const { sessionUser: user } = await getWorkspaceUser(session, request);
  if (!user || user.active === false || !isReviewerRole(user.role)) return Response.json({ error: "Advancement Services access required." }, { status: 403, headers });
  try {
    const categories = await importCustomFieldCatalog({ user, origin: new URL(request.url).origin });
    return Response.json({ categories }, { headers });
  } catch {
    return Response.json({ error: "NXT custom-field categories could not be loaded. Check your connection and try again; no values were changed." }, { status: 503, headers });
  }
}
