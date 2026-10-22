import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { canEditWorkspace, canUseMgoWorkspaceRole, isAdminRole } from "@/utils/workspaceRoles";
import { getOrganizationSettings } from "@/app/api/utils/organizationSettings";
import { readDashboardPriorities, readPriorityCandidates, savePriorityPreference } from "@/app/api/utils/dashboardPriorities";
import { loadDashboardGifts } from "@/app/api/utils/dashboardGiftPriorities";
import { checkGiftDocumentation } from "@/app/api/utils/dashboardDocumentation";
import { dashboardReminderPolicy, normalizeDashboardAssistant } from "@/utils/dashboardAssistantSettings";

const response = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (message, status) => Object.assign(new Error(message), { status, publicMessage: message });
async function contextFor(request) {
  const session = await auth();
  if (!session?.user?.email) throw fail("Sign in to view your reminders.", 401);
  await ensureAppSchema();
  const context = await getWorkspaceUser(session, request);
  const { sessionUser, workspaceUser, invalidActingUserId } = context;
  if (!sessionUser?.id || !workspaceUser?.id || sessionUser.active === false || workspaceUser.active === false || invalidActingUserId ||
      !(canUseMgoWorkspaceRole(sessionUser.role) || isAdminRole(sessionUser.role))) throw fail("This workspace is not available. Reload your dashboard.", 403);
  const requested = new URL(request.url).searchParams.get("workspaceId");
  if (requested !== String(workspaceUser.id)) throw fail("Your workspace changed. Reload your dashboard.", 409);
  const settings = normalizeDashboardAssistant((await getOrganizationSettings()).dashboardAssistant);
  if (!settings.enabled) throw fail("The dashboard helper is turned off for this organization.", 403);
  return { ...context, settings };
}
function errorResponse(error) {
  if (error.publicMessage) return response({ error: error.publicMessage }, error.status);
  console.error("Dashboard priorities unavailable");
  return response({ error: "Reminders could not be loaded. Your records have not changed. Please try again." }, 500);
}
export async function GET(request) {
  try {
    const context = await contextFor(request);
    const { sessionUser, workspaceUser, settings } = context;
    const now = new Date();
    const gifts = await loadDashboardGifts({ workspaceId: workspaceUser.id, origin: new URL(request.url).origin, now, settings });
    return response({ ...await readDashboardPriorities(sessionUser.id, workspaceUser.id, now, undefined, gifts, settings), reminderPolicy: dashboardReminderPolicy(settings),
      canCreateFollowUp: canEditWorkspace(context),
      viewerId: String(sessionUser.id), workspaceUserId: String(workspaceUser.id), workspaceName: workspaceUser.name || "Your workspace" });
  } catch (error) { return errorResponse(error); }
}

async function smallBody(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw fail("Use a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw fail("Choose a reminder action.", 400);
  let size = 0, text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw fail("Reminder request is too large.", 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text); } catch { throw fail("Invalid reminder request.", 400); }
  } finally { reader.releaseLock(); }
}
export async function PUT(request) {
  try {
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw fail("Open this action from your dashboard.", 403);
    const { sessionUser, workspaceUser, settings } = await contextFor(request);
    const body = await smallBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some(key => !["key", "revision", "action", "days"].includes(key)) ||
        typeof body.key !== "string" || body.key.length > 250 || !/^[a-f0-9]{64}$/.test(body.revision || "") ||
        !["snooze", "dismiss", "restore"].includes(body.action) ||
        (body.action === "snooze" && ![1, 7].includes(body.days))) throw fail("Choose a valid reminder action.", 400);
    const now = new Date();
    const gifts = body.key.startsWith("gift:")
      ? await loadDashboardGifts({ workspaceId: workspaceUser.id, origin: new URL(request.url).origin, now, settings }) : null;
    const { candidates } = await readPriorityCandidates(workspaceUser.id, now, undefined, gifts, settings);
    const item = candidates.find(item => item.key === body.key && item.revision === body.revision);
    if (!item) throw fail("This reminder has changed. Reload reminders before continuing.", 409);
    await savePriorityPreference({ viewerId: sessionUser.id, workspaceId: workspaceUser.id, item, action: body.action, days: body.days });
    return response({ saved: true });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    const origin = new URL(request.url).origin;
    if ((request.headers.get("origin") && request.headers.get("origin") !== origin) ||
        request.headers.get("sec-fetch-site") === "cross-site") throw fail("Open this check from your dashboard.", 403);
    const { sessionUser, workspaceUser, settings } = await contextFor(request);
    const body = await smallBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some(key => !["key", "revision"].includes(key)) ||
        typeof body.key !== "string" || !/^gift:[1-9]\d{0,30}$/.test(body.key) ||
        !/^[a-f0-9]{64}$/.test(body.revision || "")) throw fail("Choose a current major gift to check.", 400);
    const gifts = await loadDashboardGifts({ workspaceId: workspaceUser.id, origin, now: new Date(), settings });
    const item = gifts.items.find(item => item.key === body.key && item.revision === body.revision && item.giftAmount >= settings.majorGiftMinimum);
    if (!item) throw fail("This gift has changed or is no longer available. Reload reminders before checking.", 409);
    const result = await checkGiftDocumentation({ viewerId: sessionUser.id, workspaceId: workspaceUser.id, item, origin, settings });
    return response({ result, key: item.key, revision: item.revision,
      viewerId: String(sessionUser.id), workspaceUserId: String(workspaceUser.id) });
  } catch (error) { return errorResponse(error); }
}
