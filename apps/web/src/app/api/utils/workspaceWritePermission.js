import { canEditWorkspace } from "@/utils/workspaceRoles";

export default function workspaceWritePermissionError(context) {
  return canEditWorkspace(context) ? null : Response.json({
    error: "This workspace is read-only. Only Admins can make changes on behalf of another MGO. Return to your own workspace to make changes there.",
  }, { status: 403 });
}
