import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { validActionDate } from "@/utils/actionEntryOptions";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";
import { createReminderLogStore, publicReminderLog } from "@/app/api/utils/pledgeReminderLogStore";
import { reminderActionPayload, reminderActionMatches } from "@/app/api/utils/pledgeReminderAction";

export const maxDuration = 90;
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const id = value => typeof value === "string" && /^[1-9]\d{0,18}$/.test(value);
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
const store = createReminderLogStore();
async function authorize(request) {
  const session = await auth();
  if (!session?.user?.email) return reply({ error: "Please sign in." }, 401);
  await ensureAppSchema();
  const { sessionUser: user } = await getWorkspaceUser(session, request);
  if (user?.active !== true || !isReviewerRole(user.role)) return reply({ error: "Only Admins and Advancement Services may record pledge reminders." }, 403);
  return { user, origin: new URL(request.url).origin, today: getStandingsPeriods().asOf };
}
export async function GET(request) {
  try {
    const context = await authorize(request); if (context instanceof Response) return context;
    const { user, origin, today } = context, snapshotId = new URL(request.url).searchParams.get("snapshotId");
    if (snapshotId) {
      if (!uuid(snapshotId)) return reply({ error: "Choose a saved reminder." }, 400);
      const row = await store.read(snapshotId, user.id, origin);
      if (!row) return reply({ error: "Reminder not found in your account." }, 404);
      return reply({ today, reminder: { snapshotId: row.id, ...row.snapshot }, receipt: publicReminderLog(await store.receipt(row), user.id) });
    }
    return reply({ today, reminders: (await store.list(user.id, origin)).map(row => ({ snapshotId: row.id, ...row.snapshot })) });
  } catch { return reply({ error: "Saved reminder status could not be loaded. No NXT request was made." }, 503); }
}
export async function POST(request) {
  let claimed = null, user, origin;
  try {
    origin = new URL(request.url).origin;
    if (request.headers.get("origin") !== origin || !request.headers.get("content-type")?.startsWith("application/json"))
      return reply({ error: "Open pledge reminders in the app before continuing." }, 403);
    const context = await authorize(request); if (context instanceof Response) return context;
    user = context.user;
    const raw = await request.text(); if (raw.length > 2000) return reply({ error: "Invalid reminder confirmation." }, 400);
    let body; try { body = JSON.parse(raw); } catch { return reply({ error: "Invalid reminder confirmation." }, 400); }
    if (!body || !uuid(body.snapshotId) || !["record", "verify"].includes(body.operation)
      || Object.keys(body).some(key => !["snapshotId", "operation", "confirm", "sentDate", "actionId"].includes(key)))
      return reply({ error: "Choose a saved reminder and an explicit action." }, 400);
    const snapshot = await store.read(body.snapshotId, user.id, origin);
    if (!snapshot) return reply({ error: "Reminder not found in your account." }, 404);
    const api = { userId: user.id, authUserId: user.id, origin, maxRetries: 0, timeoutMs: 12000 };
    if (body.operation === "verify") {
      const receipt = await store.receipt(snapshot);
      if (!receipt || String(receipt.owner_id) !== String(user.id)) return reply({ error: "Only the staff member who recorded this reminder can verify it here." }, 409);
      if (receipt.state === "saved") return reply({ receipt: publicReminderLog(receipt, user.id) });
      if (receipt.state === "processing" && Date.now() - Date.parse(receipt.updated_at) < 5 * 60 * 1000)
        return reply({ error: "The submission may still be running. Reload saved status in a few minutes; do not record it again." }, 409);
      const actionId = receipt.action_id || body.actionId;
      if (!id(actionId) || receipt.action_id && body.actionId && receipt.action_id !== body.actionId)
        return reply({ error: "Enter the existing NXT action's system record ID. Verification never creates an action." }, 400);
      const record = await blackbaudApiFetch(`/constituent/v1/actions/${actionId}`, { ...api, method: "GET" });
      if (!reminderActionMatches(record, receipt.payload, actionId)) return reply({ error: "This NXT action does not match the saved reminder, completion date or Email/Stewardship fields. Review the existing action in NXT; nothing was resent or changed." }, 409);
      return reply({ receipt: publicReminderLog(await store.verify(receipt, actionId), user.id) });
    }
    if (body.confirm !== true || !validActionDate(body.sentDate) || body.sentDate > context.today || body.sentDate < snapshot.snapshot.preparedOn)
      return reply({ error: "Confirm you sent the reminder with its PDF attached, and choose the actual sending date, from preparation through today." }, 400);
    const previous = await store.receipt(snapshot, body.sentDate);
    if (previous) return reply({ receipt: publicReminderLog(previous, user.id) });
    // Log the historical reminder, not today's balance. Do not invalidate a real
    // sending confirmation merely because a payment arrived afterward.
    const profile = await blackbaudApiFetch(`/constituent/v1/constituents/${snapshot.snapshot.constituentId}`, { ...api, method: "GET" });
    if (String(profile?.id || "") !== snapshot.snapshot.constituentId) return reply({ error: "NXT could not confirm the saved constituent ID. No action was submitted." }, 409);
    const payload = reminderActionPayload(snapshot, body.sentDate, user);
    claimed = await store.claim(snapshot, body.sentDate, payload);
    if (!claimed) {
      const previous = await store.receipt(snapshot, body.sentDate);
      return previous ? reply({ receipt: publicReminderLog(previous, user.id) }) : reply({ error: "Submission status changed. Reload saved status before continuing. No action was submitted by this request." }, 409);
    }
    const created = await blackbaudApiFetch("/constituent/v1/actions", { ...api, method: "POST", body: payload });
    const actionId = String(created?.id || created?.value?.id || created?.action_id || "");
    if (!id(actionId)) throw new Error("Action ID not confirmed");
    await store.checkpoint(claimed.id, actionId);
    const current = await blackbaudApiFetch(`/constituent/v1/actions/${actionId}`, { ...api, method: "GET" });
    const record = current?.value && !Array.isArray(current.value) ? current.value : current;
    if (String(record?.id || "") !== actionId || String(record?.constituent_id || "") !== payload.constituent_id) throw new Error("Action identity not confirmed");
    // Preserve the established completed-action flow, but never retry a write.
    await blackbaudApiFetch(`/constituent/v1/actions/${actionId}`, { ...api, method: "PATCH", body: {
      type: payload.type, completed: true, completed_date: payload.completed_date, status: "Completed",
    } });
    const confirmed = await blackbaudApiFetch(`/constituent/v1/actions/${actionId}`, { ...api, method: "GET" });
    if (!reminderActionMatches(confirmed, payload, actionId)) throw new Error("Action fields not confirmed");
    const latest = await store.receipt(snapshot);
    if (latest?.id !== claimed.id || latest.action_id !== actionId) throw new Error("Receipt changed");
    return reply({ receipt: publicReminderLog(await store.verify(latest, actionId), user.id) });
  } catch {
    if (claimed) {
      await store.hold(claimed.id).catch(() => {});
      return reply({ receipt: publicReminderLog({ ...claimed, state: "review" }, user.id) }, 202);
    }
    return reply({ error: "This check could not finish. Reload saved status before trying again; no action was created by this request." }, 503);
  }
}
