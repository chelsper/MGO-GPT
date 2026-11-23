import { outreachWorkspace, outreachWorkspaceLabel } from "@/app/api/utils/outreachWorkspace";
import { listContext, listResponse, listFailure } from "@/app/api/utils/constituentListContext";
import { getListRecord, serializeList, listError } from "@/app/api/utils/listConfigurations";
import { projectTagSnapshot } from "@/app/api/utils/projectProspectingTags";
import { createProjectOutreachStore } from "@/app/api/utils/projectOutreachStore";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

const store = createProjectOutreachStore();
export async function GET(request, { params }) {
  try {
    const workspace = await outreachWorkspace(request);
    const expectedId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspace.isActing || expectedId !== String(workspace.workspaceUser.id))
      throw listError("The selected workspace changed. Return to My Tasks to reload it.", 409);
    // Both the signed-in viewer and selected caller must retain explicit sharing.
    const viewer = await listContext(request, params.listKey);
    const record = await getListRecord(params.listKey);
    const report = record && serializeList(record, workspace.workspaceUser);
    if (!report?.canView || record.visibility !== "specific_users" || Number(viewer.user.id) !== Number(workspace.sessionUser.id))
      throw listError("This project is not shared with both accounts.", 403);
    if (report.revision !== viewer.report.revision) throw listError("Project settings changed. Reload My Tasks.", 409);
    const context = { ...viewer, user: workspace.workspaceUser, report };
    const state = await projectTagSnapshot(context);
    const result = await store.read(context, state);
    const latest = await outreachWorkspace(request);
    const current = await listContext(request, params.listKey);
    const currentRecord = await getListRecord(params.listKey);
    if (!latest.isActing || Number(latest.workspaceUser.id) !== Number(workspace.workspaceUser.id) ||
        !currentRecord || !serializeList(currentRecord, latest.workspaceUser).canView || currentRecord.visibility !== "specific_users" ||
        current.report.revision !== report.revision || serializeList(currentRecord, latest.workspaceUser).revision !== report.revision)
      throw listError("Workspace access or project settings changed. Reload My Tasks.", 409);
    const id = Number(workspace.workspaceUser.id);
    return listResponse({ ...result, canManage: false, canManageAccounts: false, canRecord: false,
      workspace: outreachWorkspaceLabel(workspace), callers: [], overlaps: [], nxtReadiness: null,
      tasks: result.tasks.filter(task => task.assigneeId === id || task.events.some(e => e.actorId === id && e.state !== "confirmed"))
        .map(task => ({ ...task, events: task.events.filter(e => e.actorId === id) })),
      today: getStandingsPeriods().asOf });
  } catch (error) { return listFailure(error); }
}

export async function POST() {
  return listResponse({ error: "Workspace previews are read-only. The assigned caller must sign in to record outreach." }, 403);
}
