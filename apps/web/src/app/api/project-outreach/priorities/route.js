import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getOrCreateUser from "@/app/api/utils/getOrCreateUser";
import {
  listResponse,
  listFailure,
} from "@/app/api/utils/constituentListContext";
import { listError } from "@/app/api/utils/listConfigurations";
import { readOutreachPriorities } from "@/app/api/utils/outreachPriorities";
import { canManageWorkspaceRole, isMgoRole } from "@/utils/workspaceRoles";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.email) throw listError("Unauthorized", 401);
    await ensureAppSchema();
    const user = await getOrCreateUser(session, "admin");
    if (user?.active !== true) throw listError("Inactive account", 403);
    const canRecord = canManageWorkspaceRole(user.role) || isMgoRole(user.role);
    const today = getStandingsPeriods().asOf;
    const projects = canRecord
      ? await readOutreachPriorities({
          userId: Number(user.id),
          origin: new URL(request.url).origin,
          today,
        })
      : [];
    return listResponse({
      canRecord,
      today,
      checkedAt: new Date().toISOString(),
      projects,
    });
  } catch (error) {
    return listFailure(error);
  }
}
