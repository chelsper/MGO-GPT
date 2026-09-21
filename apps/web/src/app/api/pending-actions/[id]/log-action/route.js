import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import workspaceWritePermissionError from "@/app/api/utils/workspaceWritePermission";
import sql from "@/app/api/utils/sql";
import applyPendingActionQuickAction from "@/app/api/utils/pendingActionQuickAction";
import { resolveActionFundraiserIds } from "@/app/api/utils/actionFundraisers";
import { buildBlackbaudActionPayload, buildBlackbaudActionMetadataPayload, createBlackbaudAction,
  getBlackbaudAction, getBlackbaudConstituentById, updateBlackbaudAction } from "@/app/api/utils/blackbaud";
import { readNextStepAction, readNextStepActionReceipt, claimNextStepAction, actionRecordId,
  actionConstituentId, verifiedNextStepAction, publicActionReceipt } from "@/app/api/utils/pendingActionNxt";
import { ACTION_CATEGORIES, INTERACTION_TYPES, validActionDate, validNextStepActionDate } from "@/utils/actionEntryOptions";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import finalizeNextStepAction from "@/app/api/utils/finalizeNextStepAction";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const reply = (body, status = 200) => Response.json(body, { status, headers });

async function authorize(request, id, expectedWorkspaceId) {
  const session = await auth();
  if (!session?.user?.email) return reply({ error: "Unauthorized" }, 401);
  await ensureAppSchema();
  const context = await getWorkspaceUser(session, request);
  const permissionError = workspaceWritePermissionError(context);
  if (permissionError) return permissionError;
  if (!/^[1-9]\d*$/.test(String(id))) return reply({ error: "Invalid next step." }, 400);
  if (String(expectedWorkspaceId) !== String(context.workspaceUser.id)) {
    return reply({ error: "The selected workspace changed. Reload this page before continuing." }, 409);
  }
  return context;
}

export async function GET(request, { params }) {
  try {
    const context = await authorize(request, params.id, new URL(request.url).searchParams.get("workspaceId"));
    if (context instanceof Response) return context;
    const item = await readNextStepAction(params.id, context.workspaceUser.id);
    if (!item) return reply({ error: "Next step not found in this workspace." }, 404);
    const receipt = await readNextStepActionReceipt(params.id, context.workspaceUser.id);
    return reply({
      task: { id: item.id, title: item.title, details: item.details, category: item.category, status: item.status, dueDate: item.due_date,
        sourceToken: item.source_token, constituentId: item.constituentId, constituentName: item.constituent_name,
        opportunityTitle: item.opportunity_title, willLinkOpportunity: Boolean(item.blackbaud_opportunity_id) },
      workspace: { id: context.workspaceUser.id, name: context.workspaceUser.name },
      viewer: { id: context.sessionUser.id, name: context.sessionUser.name },
      today: getStandingsPeriods().asOf,
      receipt: receipt ? publicActionReceipt(receipt, item.status) : null,
    });
  } catch {
    return reply({ error: "Action details could not be loaded. No NXT action was sent." }, 500);
  }
}

export async function POST(request, { params }) {
  let claimed = false;
  let actionId = null;
  let verified = false;
  let finalized = false;
  let reminderCompleted = false;
  let ownerUserId;
  let constituentId;
  let actionIntent;
  let actionDate;
  let stage = "context";
  try {
    const body = await request.json().catch(() => null);
    const context = await authorize(request, params.id, body?.expectedWorkspaceId);
    if (context instanceof Response) return context;
    const allowed = ["expectedWorkspaceId", "sourceToken", "actionIntent", "actionDate", "actionCategory", "interactionType", "summary", "notes", "completeReminder"];
    if (!body || Object.keys(body).some(key => !allowed.includes(key))
      || typeof body.sourceToken !== "string" || body.sourceToken.length > 4000
      || !validNextStepActionDate(body.actionIntent, body.actionDate, getStandingsPeriods().asOf)
      || body.actionIntent === "planned" && body.completeReminder !== false
      || !ACTION_CATEGORIES.includes(body.actionCategory) || !INTERACTION_TYPES.includes(body.interactionType)
      || typeof body.summary !== "string" || !body.summary.trim() || body.summary.length > 255
      || typeof body.notes !== "string" || body.notes.length > 10000 || typeof body.completeReminder !== "boolean") {
      return reply({ error: "Choose planned or completed and review the action details. Planned actions must be today or later and keep the reminder open. Completed actions cannot have a future date." }, 400);
    }
    actionIntent = body.actionIntent;
    actionDate = body.actionDate;
    const completed = actionIntent === "completed";
    const { workspaceUser, sessionUser } = context;
    ownerUserId = workspaceUser.id;
    const item = await readNextStepAction(params.id, ownerUserId);
    if (!item) return reply({ error: "Next step not found in this workspace." }, 404);
    const previous = await readNextStepActionReceipt(params.id, ownerUserId);
    if (previous) return reply({ receipt: publicActionReceipt(previous, item.status) });
    if (item.status !== "Open" || item.source_token !== body.sourceToken) {
      return reply({ error: "This next step or its links changed. Close this dialog and reload the saved list before continuing. No action was sent." }, 409);
    }
    constituentId = item.constituentId;
    if (!constituentId) return reply({ error: "A single verified constituent link is required. Review this prospect's NXT link first. No action was sent." }, 409);
    const api = { userId: ownerUserId, authUserId: sessionUser.id, origin: new URL(request.url).origin };
    // These read-only checks happen before claiming a write, so a connection or
    // attribution problem can be corrected and retried without duplicate risk.
    stage = "constituent";
    const constituent = await getBlackbaudConstituentById({ ...api, constituentId });
    if (String(constituent?.raw?.id || constituent?.raw?.constituent_id || "") !== constituentId) {
      return reply({ error: "NXT could not confirm this constituent's system ID. No action was sent." }, 409);
    }
    stage = "fundraiser";
    const fundraiserIds = await resolveActionFundraiserIds({ currentUser: sessionUser, primaryFundraiserUser: workspaceUser,
      requirePrimaryFundraiser: true, apiUserId: ownerUserId, origin: api.origin });
    if (!fundraiserIds?.length) throw new Error("Missing fundraiser attribution");
    stage = "prepare";
    const action = { ...body, summary: body.summary.trim(), notes: body.notes.trim() };
    const createPayload = buildBlackbaudActionPayload({ blackbaudConstituentId: constituentId,
      actionDate: action.actionDate, actionCategory: action.actionCategory, summary: action.summary,
      actionNotes: action.notes, authorName: sessionUser.name || sessionUser.email,
      opportunityId: item.blackbaud_opportunity_id, fundraiserIds, completed });
    const metadata = buildBlackbaudActionMetadataPayload({ actionDate: action.actionDate,
      interactionType: action.interactionType, opportunityId: item.blackbaud_opportunity_id, fundraiserIds, completed });
    // Planned actions can include their type on create. Avoid a completion
    // metadata PATCH entirely, including a race that could reopen an NXT action.
    if (!completed) createPayload.type = metadata.type;
    stage = "claim";
    claimed = await claimNextStepAction({ id: params.id, ownerUserId, enteredByUserId: sessionUser.id,
      sourceToken: body.sourceToken, constituentId, payload: { ...action, createPayload, metadata } });
    if (!claimed) {
      const existing = await readNextStepActionReceipt(params.id, ownerUserId);
      return existing ? reply({ receipt: publicActionReceipt(existing) })
        : reply({ error: "This next step changed before saving. Reload it; no action was sent." }, 409);
    }

    // No POST retries, including inside the Blackbaud client. A timed-out write
    // may have succeeded remotely; the durable claim blocks another submission.
    stage = "create";
    const created = await createBlackbaudAction({ ...api, payload: createPayload, maxRetries: 0 });
    actionId = actionRecordId(created);
    if (!actionId) throw new Error("NXT did not return an action ID");
    await sql`UPDATE pending_action_nxt_receipts SET blackbaud_action_id = ${actionId}, updated_at = NOW()
      WHERE pending_action_id = ${params.id} AND owner_user_id = ${ownerUserId}`;
    stage = "verify";
    const saved = await getBlackbaudAction({ ...api, actionId });
    if (actionRecordId(saved) !== actionId || actionConstituentId(saved) !== constituentId) throw new Error("Action identity unverified");
    let confirmed = saved;
    if (completed) {
      await updateBlackbaudAction({ ...api, actionId, payload: metadata });
      confirmed = await getBlackbaudAction({ ...api, actionId });
    }
    if (!verifiedNextStepAction(confirmed, { actionId, constituentId, createPayload, metadata, actionIntent })) throw new Error("Action fields unverified");
    verified = true;

    // Finalize the receipt and local activity in one statement, exactly once.
    // Never run the legacy action route, which can clear the primary plan.
    stage = "finalize";
    const localReceipt = await finalizeNextStepAction({ id: params.id, ownerUserId, actionId, constituentId,
      expected: { ...action, createPayload, metadata }, originalProspectId: item.prospect_id,
      states: ["processing"], message: "NXT action saved and verified. The next step has not been completed by this submission." });
    if (!localReceipt?.local_finalized_at) throw new Error("Local action finalization was not confirmed");
    finalized = true;
    if (completed && action.completeReminder) {
      const completion = await applyPendingActionQuickAction({ id: params.id, ownerUserId, action: "complete", expectedUpdatedAt: item.updated_at });
      reminderCompleted = Boolean(completion?.item);
    }
    const message = !completed
      ? "Planned NXT action saved and verified as incomplete. The app reminder and linked discussions were not changed. Complete or reschedule this same action in NXT; do not log it again."
      : reminderCompleted
      ? "NXT action saved and verified. Next step completed; linked discussions are unchanged."
      : action.completeReminder
        ? "NXT action saved and verified, but the next step changed and was not completed. Reload the saved list and review it before marking it complete. Do not log this action again."
        : "NXT action saved and verified. Your next step was left open; linked discussions are unchanged.";
    await sql`UPDATE pending_action_nxt_receipts SET reminder_completed = ${reminderCompleted}, message = ${message}, updated_at = NOW()
      WHERE pending_action_id = ${params.id} AND owner_user_id = ${ownerUserId}`;
    return reply({ receipt: { state: "saved", actionId, constituentId, actionIntent, actionDate, reminderCompleted, message } });
  } catch (error) {
    const mappingError = ["NXT_FUNDRAISER_MAPPING_REQUIRED", "NXT_FUNDRAISER_MAPPING_INVALID"].includes(error?.code);
    const httpStatus = Number.isInteger(error?.httpStatus) ? error.httpStatus : null;
    // Never log provider response bodies, tokens, action notes, or donor data.
    console.error("Next-step NXT action failed", { stage, claimed, httpStatus, mappingError });
    if (!claimed) {
      if (mappingError) return reply({ error: error.code === "NXT_FUNDRAISER_MAPPING_REQUIRED"
        ? "The selected MGO needs a saved NXT fundraiser mapping. Ask an Admin to review the MGO's Blackbaud system ID. No action was sent."
        : "The selected MGO's saved mapping did not verify as an active NXT fundraiser. Ask an Admin to review the mapping and fundraiser status. No action was sent." }, 409);
      const message = stage === "constituent"
        ? "NXT could not read this constituent using your signed-in connection. No action was sent. Check NXT access and try again when available."
        : stage === "fundraiser"
          ? "NXT could not read the selected MGO's fundraiser record using your signed-in connection. No action was sent. Check NXT access before retrying; this does not establish that the saved mapping is wrong."
          : "The app could not prepare this action submission. No action was sent to NXT. Reload the saved list before trying again; resetting your NXT connection is not required for this app error.";
      return reply({ error: message }, 502);
    }
    const message = verified && !finalized
      ? "The NXT action was verified, but its local activity save could not finish. Verify the existing action to safely finish the app save. Do not log this action again."
      : verified && actionIntent === "planned"
      ? "Planned NXT action was verified as incomplete, but the app could not confirm the saved receipt. Reload submission status. Do not send it again."
      : verified
      ? "NXT action saved and verified, but the local completion result could not be confirmed. Reload the saved list before marking the next step complete. Do not log this action again."
      : "The app has not yet verified this NXT action. Do not log it again. Verification and next-step completion are separate.";
    try {
      await sql`UPDATE pending_action_nxt_receipts SET state = ${finalized ? "saved" : "review"},
        message = ${message}, reminder_completed = ${reminderCompleted}, updated_at = NOW()
        WHERE pending_action_id = ${params.id} AND owner_user_id = ${ownerUserId}
          AND (${finalized}::boolean OR local_finalized_at IS NULL)`;
    } catch { /* The original durable claim still prevents a duplicate POST. */ }
    return reply({ receipt: { state: finalized ? "saved" : "review", actionId, constituentId, actionIntent, actionDate, reminderCompleted, message } }, 202);
  }
}

// Explicit recovery reads only the durable action ID in NXT. It cannot resend,
// patch metadata, or complete a reminder that may since have changed/reopened.
export async function PATCH(request, { params }) {
  try {
    const body = await request.json().catch(() => null);
    const context = await authorize(request, params.id, body?.expectedWorkspaceId);
    if (context instanceof Response) return context;
    if (!body || Object.keys(body).some(key => !["expectedWorkspaceId", "actionId"].includes(key))
      || typeof body.actionId !== "string" || !/^[1-9]\d*$/.test(body.actionId)) {
      return reply({ error: "Reload the saved submission before verifying its action." }, 400);
    }
    const ownerUserId = context.workspaceUser.id;
    const item = await readNextStepAction(params.id, ownerUserId);
    if (!item) return reply({ error: "Next step not found in this workspace." }, 404);
    const receipt = await readNextStepActionReceipt(params.id, ownerUserId);
    if (!receipt || receipt.blackbaud_action_id !== body.actionId) {
      return reply({ error: "A matching saved NXT action ID is required. No action was sent or changed." }, 409);
    }
    if (receipt.state === "saved" && receipt.local_finalized_at) return reply({ receipt: publicActionReceipt(receipt, item.status) });
    const staleProcessing = receipt.state === "processing" && Date.parse(receipt.updated_at) <= Date.now() - 5 * 60 * 1000;
    if (!["review", "saved"].includes(receipt.state) && !staleProcessing) return reply({ error: "This submission is still processing. Reload submission status before verifying." }, 409);
    const expected = receipt.request_payload;
    if (!expected?.createPayload || !expected?.metadata
      || !validActionDate(expected.actionDate) || typeof expected.summary !== "string" || !expected.summary
      || typeof expected.notes !== "string" || !ACTION_CATEGORIES.includes(expected.actionCategory)
      || !INTERACTION_TYPES.includes(expected.metadata.type)) {
      return reply({ error: "The original submission details are incomplete. Review the existing action in NXT; do not send it again." }, 409);
    }
    let source;
    try { source = JSON.parse(expected.sourceToken); } catch { /* No safe local activity target. */ }
    const originalProspectId = Array.isArray(source) && /^[1-9]\d*$/.test(String(source[1])) ? String(source[1]) : null;
    const confirmed = await getBlackbaudAction({ userId: ownerUserId, authUserId: context.sessionUser.id,
      origin: new URL(request.url).origin, actionId: receipt.blackbaud_action_id });
    if (!verifiedNextStepAction(confirmed, { actionId: receipt.blackbaud_action_id, constituentId: receipt.constituent_id,
      createPayload: expected.createPayload, metadata: expected.metadata, actionIntent: expected.actionIntent || "completed" })) {
      return reply({ error: "NXT returned the action, but its identity or required fields do not match the original submission. Review it in NXT. Nothing was sent or changed." }, 409);
    }
    const saved = await finalizeNextStepAction({ id: params.id, ownerUserId, actionId: receipt.blackbaud_action_id,
      constituentId: receipt.constituent_id, expected, originalProspectId,
      states: staleProcessing ? ["processing"] : ["review", "saved"],
      processingVersion: staleProcessing ? receipt.updated_at : null,
      message: "Existing NXT action verified and local save checked. No action was sent again. This check did not change the next step or linked discussions." });
    const latest = saved || await readNextStepActionReceipt(params.id, ownerUserId);
    if (latest?.state !== "saved" || !latest.local_finalized_at) return reply({ error: "The saved submission changed. Reload its status; no NXT action was sent or changed." }, 409);
    const currentTask = await readNextStepAction(params.id, ownerUserId);
    return reply({ receipt: publicActionReceipt(latest, currentTask?.status || null) });
  } catch {
    return reply({ error: "Verification could not finish. No NXT action was sent or changed. Reload submission status, then retry verification when NXT is available." }, 502);
  }
}
