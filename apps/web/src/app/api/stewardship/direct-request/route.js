import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { assistanceId, directAssistanceDraft, validAssistanceKey } from "@/utils/stewardshipAssistance";
import { canRequestDirectAssistance, readDirectAssistance, createDirectAssistance } from "@/app/api/utils/directStewardshipAssistance";
import { readAvailableStewardshipGifts } from "@/app/api/utils/stewardshipAssistance";

const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function handle(request, write) {
  try {
    const session = await auth();
    if (!session?.user?.email) return reply({ error: "Sign in to request assistance." }, 401);
    await ensureAppSchema();
    const context = await getWorkspaceUser(session, request);
    if (!canRequestDirectAssistance(context)) return reply({ error: "This workspace is read-only or unavailable." }, 403);
    const url = new URL(request.url), params = url.searchParams;
    if (params.get("viewerId") !== String(context.sessionUser.id) || params.get("workspaceId") !== String(context.workspaceUser.id))
      return reply({ error: "Your workspace changed. Close this form and reopen it from the correct workspace." }, 409);
    const source = Object.fromEntries(["constituentId", "opportunityId", "requestId", "requestKey"].map(key => [key, params.get(key)]));
    if (!assistanceId(source.constituentId) || (source.opportunityId && !assistanceId(source.opportunityId)) ||
        (source.requestId ? !assistanceId(source.requestId) || write : !validAssistanceKey(source.requestKey)))
      return reply({ error: "Choose a valid donor or opportunity and reopen this request." }, 400);
    let created;
    if (write) {
      if (!request.headers.get("content-type")?.includes("application/json") || request.headers.get("sec-fetch-site") === "cross-site" ||
          (request.headers.get("origin") && request.headers.get("origin") !== url.origin)) return reply({ error: "Submit this request from the app." }, 403);
      let draft;
      try { draft = directAssistanceDraft(await request.json()); } catch (error) { return reply({ error: error.message || "Review your request." }, 400); }
      created = await createDirectAssistance(context, source, draft);
      if (!created) return reply({ error: "The donor, opportunity, or gift choice changed. Reload saved details before continuing." }, 409);
    }
    const saved = await readDirectAssistance(context, source);
    if (!saved) return reply({ error: "This donor or request is not available in this workspace. Open it from your saved portfolio or an opportunity you manage." }, 404);
    const giftChoices = !write && !saved.request ? await readAvailableStewardshipGifts().catch(() => null) : [];
    return reply({ ...saved, giftChoices, viewerId: String(context.sessionUser.id), workspaceId: String(context.workspaceUser.id),
      ...(created ? { alreadyExists: created.already_exists } : {}) }, created && !created.already_exists ? 201 : 200);
  } catch { return reply({ error: "The request status could not be confirmed. Reload saved status before trying again." }, 500); }
}
export const GET = request => handle(request, false);
export const POST = request => handle(request, true);
