import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import workspaceWritePermissionError from "@/app/api/utils/workspaceWritePermission";
import { loadDiscussionNextStep, createDiscussionNextStep } from "@/app/api/utils/discussionNextStep";
import { clearUserDashboardDataCaches } from "@/app/api/utils/userDataCache";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const reply = (body, status = 200) => Response.json(body, { status, headers });
function validDate(value) {
  if (value === null || value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function handle(request, { params }, writing) {
  try {
    const session = await auth();
    if (!session?.user?.email) return reply({ error: "Unauthorized" }, 401);
    await ensureAppSchema();
    const context = await getWorkspaceUser(session, request);
    const permissionError = workspaceWritePermissionError(context);
    if (permissionError) return permissionError;
    if (!/^[1-9]\d*$/.test(String(params.id))) return reply({ error: "Discussion not found." }, 404);
    const body = writing ? await request.json().catch(() => null) : null;
    if (writing && (!body || typeof body !== "object" || Array.isArray(body))) return reply({ error: "Invalid next-step request." }, 400);
    const expectedWorkspaceId = writing ? body.expectedWorkspaceId : new URL(request.url).searchParams.get("workspaceId");
    if (String(expectedWorkspaceId) !== String(context.workspaceUser.id)) return reply({ error: "The selected workspace changed. Close this dialog and reload the page." }, 409);
    const data = await loadDiscussionNextStep(params.id, context);
    if (!data) return reply({ error: "Discussion not found in this workspace." }, 404);
    if (!writing) return reply({
      workspaceId: context.workspaceUser.id, viewerId: context.sessionUser.id,
      discussion: { id: data.discussion.id, subject: data.discussion.subject, body: data.discussion.body,
        dueDate: data.discussion.due_date, version: data.discussion.version },
      topics: data.topics.map(topic => ({ key: topic.key, name: topic.name,
        ownerId: topic.blackbaud_constituent_id || topic.key === "general" ? null : topic.user_id })),
      owners: data.owners.map(owner => ({ id: owner.id, name: owner.name })), tasks: data.tasks,
    });
    const allowed = ["expectedWorkspaceId", "expectedUpdatedAt", "ownerId", "topicKey", "title", "details", "dueDate"];
    if (Object.keys(body).some(key => !allowed.includes(key)) || typeof body.title !== "string" || !body.title.trim() || body.title.length > 255
      || (body.details != null && (typeof body.details !== "string" || body.details.length > 10000)) || !validDate(body.dueDate)) {
      return reply({ error: "Enter a next step (up to 255 characters), a valid date or No date, and notes up to 10,000 characters." }, 400);
    }
    if (body.expectedUpdatedAt !== data.discussion.version) return reply({ error: "This discussion changed. Your draft is still here. Close and reopen the dialog to review its latest details." }, 409);
    const owner = data.owners.find(value => String(value.id) === String(body.ownerId));
    if (!owner) return reply({ error: "Choose an eligible owner who already has access to this discussion. Only Admins can create next steps for another MGO." }, 403);
    const topic = data.topics.find(value => value.key === body.topicKey);
    if (!topic || (topic.key.startsWith("local:") && String(topic.user_id) !== String(owner.id))) return reply({ error: "Choose a linked constituent available to this owner, or update the discussion's topics first." }, 400);
    const task = await createDiscussionNextStep({ id: params.id, context, source: data.discussion, owner, topic, draft: body });
    if (!task) return reply({ error: "The discussion, owner, or constituent link changed. Close and reopen the dialog before continuing." }, 409);
    // The task is already committed. A cache failure must not turn success into an ambiguous retry.
    try { await clearUserDashboardDataCaches(owner.id); } catch (error) { console.error("Discussion follow-up cache invalidation failed:", error); }
    return reply({ task: { ...task, owner_name: owner.name }, workspaceId: context.workspaceUser.id,
      message: task.already_exists ? "A next step already exists for this owner and topic. No duplicate was created."
        : "Additional next step created. The primary next step and original discussion are unchanged. No NXT action was created." }, task.already_exists ? 200 : 201);
  } catch (error) {
    console.error("Discussion next-step request failed:", error);
    return reply({ error: "The next-step result could not be confirmed. Close and reopen this dialog to check its saved status before trying again." }, 500);
  }
}
export const GET = (request, context) => handle(request, context, false);
export const POST = (request, context) => handle(request, context, true);
