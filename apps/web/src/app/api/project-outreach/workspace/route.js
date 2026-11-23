import { outreachWorkspace, outreachWorkspaceLabel } from "@/app/api/utils/outreachWorkspace";
import { readOutreachPriorities } from "@/app/api/utils/outreachPriorities";
import { listResponse, listFailure } from "@/app/api/utils/constituentListContext";
import { canManageWorkspaceRole, isMgoRole } from "@/utils/workspaceRoles";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

export async function GET(request) {
  try {
    const context = await outreachWorkspace(request);
    const { workspaceUser, sessionUser, isActing } = context;
    const eligible = canManageWorkspaceRole(workspaceUser.role) || isMgoRole(workspaceUser.role);
    const today = getStandingsPeriods().asOf;
    const projects = eligible ? await readOutreachPriorities({
      userId: Number(workspaceUser.id), viewerId: Number(sessionUser.id),
      origin: new URL(request.url).origin, today,
    }) : [];
    return listResponse({ canRecord: eligible && !isActing,
      workspace: outreachWorkspaceLabel(context), today, checkedAt: new Date().toISOString(), projects });
  } catch (error) { return listFailure(error); }
}
