import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { canEditWorkspace } from "@/utils/workspaceRoles";
import { assistanceDraft, assistanceId } from "@/utils/stewardshipAssistance";
import { readTaskAssistance, createTaskAssistance, readAvailableStewardshipGifts } from "@/app/api/utils/stewardshipAssistance";

const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
async function handle(request, { params }, write) {
  try {
    const session = await auth();
    if (!session?.user?.email) return reply({ error: "Sign in to request assistance." }, 401);
    await ensureAppSchema();
    const context = await getWorkspaceUser(session, request);
    if (!canEditWorkspace(context)) return reply({ error: "This workspace is read-only or unavailable." }, 403);
    const url = new URL(request.url);
    if (url.searchParams.get("workspaceId") !== String(context.workspaceUser.id) ||
        url.searchParams.get("viewerId") !== String(context.sessionUser.id)) return reply({ error: "Your workspace or sign-in changed. Close this form and reload the page." }, 409);
    if (!assistanceId(params.id)) return reply({ error: "Choose a valid follow-up." }, 400);
    let created;
    if (write) {
      if (!request.headers.get("content-type")?.includes("application/json") || request.headers.get("sec-fetch-site") === "cross-site" ||
          (request.headers.get("origin") && request.headers.get("origin") !== url.origin)) return reply({ error: "Submit this request from the app." }, 403);
      let draft;
      try { draft = assistanceDraft(await request.json()); } catch (error) { return reply({ error: error.message || "Review your request." }, 400); }
      created = await createTaskAssistance(context, params.id, draft);
      if (!created) return reply({ error: "This follow-up or gift choice changed or is no longer available. Reload its saved details before continuing." }, 409);
    }
    const task = await readTaskAssistance(context, params.id);
    if (!task) return reply({ error: "Gift follow-up not found in this workspace." }, 404);
    const giftChoices = !write && !task.request && task.status === "Open"
      ? await readAvailableStewardshipGifts().catch(() => null) : [];
    return reply({ task, giftChoices, viewerId: String(context.sessionUser.id), workspaceId: String(context.workspaceUser.id),
      ...(created ? { alreadyExists: created.already_exists } : {}) }, created && !created.already_exists ? 201 : 200);
  } catch {
    return reply({ error: "The request status could not be confirmed. Reload saved status before trying again." }, 500);
  }
}
export const GET = (request, context) => handle(request, context, false);
export const POST = (request, context) => handle(request, context, true);
