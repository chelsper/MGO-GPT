import { auth } from "@/auth";
import ensureAppSchema from "./ensureAppSchema";
import getWorkspaceUser from "./getWorkspaceUser";
import { listError } from "./listConfigurations";
import { canViewWorkspaceAsRole } from "@/utils/workspaceRoles";

export async function outreachWorkspace(request) {
  const session = await auth();
  if (!session?.user?.email) throw listError("Unauthorized", 401);
  await ensureAppSchema();
  const context = await getWorkspaceUser(session, request);
  const { sessionUser, workspaceUser, isActing, invalidActingUserId } = context;
  if (sessionUser?.active !== true || workspaceUser?.active !== true)
    throw listError("This workspace is not available.", 403);
  if (invalidActingUserId || (isActing && !canViewWorkspaceAsRole(sessionUser.role, workspaceUser.role)))
    throw listError("The selected workspace is no longer available. Choose a current workspace from Home.", 403);
  return context;
}

export const outreachWorkspaceLabel = ({ workspaceUser, isActing }) => ({
  id: Number(workspaceUser.id), name: workspaceUser.name || "Selected MGO", readOnly: !!isActing,
});
