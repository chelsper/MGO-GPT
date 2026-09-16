import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import workspaceWritePermissionError from "@/app/api/utils/workspaceWritePermission";
import applyPendingActionQuickAction from "@/app/api/utils/pendingActionQuickAction";

function validDate(value) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });
    await ensureAppSchema();
    const context = await getWorkspaceUser(session, request);
    const permissionError = workspaceWritePermissionError(context);
    if (permissionError) return permissionError;
    const { workspaceUser: user } = context;
    const body = await request.json().catch(() => null);
    if (!body || Array.isArray(body) || !["complete", "reopen", "reschedule"].includes(body.action) || !/^[1-9]\d*$/.test(String(params.id))) {
      return Response.json({ error: "Choose a valid next-step action." }, { status: 400 });
    }
    const allowedFields = ["action", "expectedWorkspaceId", "expectedUpdatedAt", ...(body.action === "reschedule" ? ["dueDate"] : [])];
    if (Object.keys(body).some(key => !allowedFields.includes(key)) || (body.action === "reschedule" && !validDate(body.dueDate))) {
      return Response.json({ error: "Choose a valid due date or No date. Only the selected quick action can be changed here." }, { status: 400 });
    }
    if (String(body.expectedWorkspaceId) !== String(user.id)) {
      return Response.json({ error: "The selected workspace changed. Reload this page before continuing." }, { status: 409 });
    }
    if (typeof body.expectedUpdatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}[T ]/.test(body.expectedUpdatedAt) || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) {
      return Response.json({ error: "Reload this next step before continuing." }, { status: 400 });
    }

    const result = await applyPendingActionQuickAction({ id: params.id, ownerUserId: user.id,
      action: body.action, dueDate: body.dueDate, expectedUpdatedAt: body.expectedUpdatedAt });
    if (!result?.found) return Response.json({ error: "Next step not found in this workspace." }, { status: 404 });
    if (!result.item) return Response.json({ error: "This next step or its primary plan changed. Nothing was saved. Reload the saved list to review the current version." }, { status: 409 });
    return Response.json(result.item, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error applying next-step quick action:", error);
    return Response.json({ error: "The next-step update could not be confirmed. Reload the saved list before trying again." }, { status: 500 });
  }
}
