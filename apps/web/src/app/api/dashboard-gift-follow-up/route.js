import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { canEditWorkspace, canUseMgoWorkspaceRole, isAdminRole } from "@/utils/workspaceRoles";
import { getOrganizationSettings } from "@/app/api/utils/organizationSettings";
import { normalizeDashboardAssistant } from "@/utils/dashboardAssistantSettings";
import { loadDashboardGifts } from "@/app/api/utils/dashboardGiftPriorities";
import { createGiftFollowUp, readGiftFollowUp } from "@/app/api/utils/giftFollowUp";
import { clearUserDashboardDataCaches } from "@/app/api/utils/userDataCache";

const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message, status) => Object.assign(new Error(message), { publicMessage: message, status });
function validDate(value) {
  if (value === null || value === "") return true;
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
async function readBody(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw fail("Use a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw fail("Enter a follow-up.", 400);
  const decoder = new TextDecoder();
  let text = "", size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 48000) { await reader.cancel(); throw fail("This follow-up is too long.", 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text); } catch { throw fail("Invalid follow-up request.", 400); }
  } finally { reader.releaseLock(); }
}
async function handle(request, writing) {
  try {
    const url = new URL(request.url);
    if (writing && ((request.headers.get("origin") && request.headers.get("origin") !== url.origin) ||
        request.headers.get("sec-fetch-site") === "cross-site")) throw fail("Open this follow-up from your dashboard.", 403);
    const session = await auth();
    if (!session?.user?.email) throw fail("Sign in to create a follow-up.", 401);
    await ensureAppSchema();
    const context = await getWorkspaceUser(session, request);
    const { sessionUser, workspaceUser } = context;
    if (!canEditWorkspace(context) || !(canUseMgoWorkspaceRole(sessionUser.role) || isAdminRole(sessionUser.role))) {
      throw fail("You cannot create follow-ups in this workspace. Select a workspace you may edit.", 403);
    }
    if (url.searchParams.get("workspaceId") !== String(workspaceUser.id)) throw fail("Your workspace changed. Close this dialog and reload your dashboard.", 409);
    const settings = normalizeDashboardAssistant((await getOrganizationSettings()).dashboardAssistant);
    if (!settings.enabled) throw fail("The dashboard helper is turned off.", 403);
    const body = writing ? await readBody(request) : Object.fromEntries(["key", "revision"].map(key => [key, url.searchParams.get(key)]));
    const allowed = writing ? ["key", "revision", "title", "details", "dueDate"] : ["key", "revision"];
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) ||
        typeof body.key !== "string" || !/^gift:[1-9]\d{0,30}$/.test(body.key) ||
        typeof body.revision !== "string" || !/^[a-f0-9]{64}$/.test(body.revision)) throw fail("Choose a current gift reminder.", 400);
    if (writing && (typeof body.title !== "string" || !body.title.trim() || body.title.length > 255 ||
        (body.details != null && (typeof body.details !== "string" || body.details.length > 10000)) || !validDate(body.dueDate))) {
      throw fail("Enter a follow-up up to 255 characters, a valid date or No date, and notes up to 10,000 characters.", 400);
    }
    const scope = { viewerId: String(sessionUser.id), workspaceUserId: String(workspaceUser.id), key: body.key, revision: body.revision };
    const task = await readGiftFollowUp(workspaceUser.id, body.key.slice(5));
    // Recovery works after a gift ages out or the saved source is unavailable.
    // It only returns this owner's existing task and never refreshes NXT.
    if (task) return reply({ ...scope, task, alreadyExists: true, ownerName: workspaceUser.name });
    const gifts = await loadDashboardGifts({ workspaceId: workspaceUser.id, origin: url.origin, settings });
    const item = gifts.items.find(value => value.key === body.key && value.revision === body.revision);
    if (!item) throw fail("This gift changed or its saved information is no longer current. Close this dialog and reload reminders before creating a follow-up.", 409);
    if (!writing) return reply({ ...scope, task: null, ownerName: workspaceUser.name, gift: item });
    const saved = await createGiftFollowUp({ context, item, draft: body });
    if (!saved) throw fail("The workspace or constituent link changed. Close and reopen this dialog to check the saved status.", 409);
    try { await clearUserDashboardDataCaches(workspaceUser.id); } catch { console.error("Gift follow-up cache invalidation failed"); }
    return reply({ ...scope, task: saved, alreadyExists: saved.already_exists, ownerName: workspaceUser.name }, saved.already_exists ? 200 : 201);
  } catch (error) {
    if (error.publicMessage) return reply({ error: error.publicMessage }, error.status);
    console.error("Gift follow-up request could not be confirmed");
    return reply({ error: "The result could not be confirmed. Check saved status before trying again; this gift can only have one follow-up in this workspace." }, 500);
  }
}
export const GET = request => handle(request, false);
export const POST = request => handle(request, true);
