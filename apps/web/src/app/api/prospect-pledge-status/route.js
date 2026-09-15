import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { readProspectPledgeStatus } from "@/app/api/utils/prospectPledgeStatus";
import {
  canViewWorkspaceAsRole,
  normalizeWorkspaceRoles,
} from "@/utils/workspaceRoles";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.email)
      return Response.json(
        { error: "Please sign in." },
        { status: 401, headers },
      );
    await ensureAppSchema();
    const { sessionUser, workspaceUser, invalidActingUserId } =
      await getWorkspaceUser(session, request);
    if (
      !sessionUser?.id ||
      !workspaceUser?.id ||
      sessionUser.active !== true ||
      workspaceUser.active !== true ||
      invalidActingUserId ||
      !normalizeWorkspaceRoles(sessionUser.role).length ||
      (String(sessionUser.id) !== String(workspaceUser.id) &&
        !canViewWorkspaceAsRole(sessionUser.role, workspaceUser.role))
    ) {
      return Response.json(
        { error: "This workspace is unavailable." },
        { status: 403, headers },
      );
    }
    const data = await readProspectPledgeStatus({
      workspaceUserId: workspaceUser.id,
      origin: new URL(request.url).origin,
    });
    return Response.json(
      { ...data, workspaceUserId: workspaceUser.id },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Saved pledge indicators are temporarily unavailable." },
      { status: 500, headers },
    );
  }
}
