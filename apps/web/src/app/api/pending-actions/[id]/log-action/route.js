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
import { ACTION_CATEGORIES, INTERACTION_TYPES, validActionDate } from "@/utils/actionEntryOptions";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

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
      task: { id: item.id, title: item.title, details: item.details, category: item.category, status: item.status,
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
  let reminderCompleted = false;
  let ownerUserId;
  let constituentId;
  let stage = "context";
  try {
    const body = await request.json().catch(() => null);
    const context = await authorize(request, params.id, body?.expectedWorkspaceId);
    if (context instanceof Response) return context;
    const allowed = ["expectedWorkspaceId", "sourceToken", "actionDate", "actionCategory", "interactionType", "summary", "notes", "completeReminder"];
    if (!body || Object.keys(body).some(key => !allowed.includes(key))
      || typeof body.sourceToken !== "string" || body.sourceToken.length > 4000
      || !validActionDate(body.actionDate) || body.actionDate > getStandingsPeriods().asOf
      || !ACTION_CATEGORIES.includes(body.actionCategory) || !INTERACTION_TYPES.includes(body.interactionType)
      || typeof body.summary !== "string" || !body.summary.trim() || body.summary.length > 255
      || typeof body.notes !== "string" || body.notes.length > 10000 || typeof body.completeReminder !== "boolean") {
      return reply({ error: "Review the action date, category, type, summary, and notes. Completed actions cannot have a future date." }, 400);
    }
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
      opportunityId: item.blackbaud_opportunity_id, fundraiserIds });
    const metadata = buildBlackbaudActionMetadataPayload({ actionDate: action.actionDate,
      interactionType: action.interactionType, opportunityId: item.blackbaud_opportunity_id, fundraiserIds });
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
    await updateBlackbaudAction({ ...api, actionId, payload: metadata });
    const confirmed = await getBlackbaudAction({ ...api, actionId });
    if (!verifiedNextStepAction(confirmed, { actionId, constituentId, createPayload, metadata })) throw new Error("Action fields unverified");
    verified = true;

    // Finalize the receipt and local activity in one statement, exactly once.
    // Never run the legacy action route, which can clear the primary plan.
    stage = "finalize";
    await sql`
      WITH saved AS (
        UPDATE pending_action_nxt_receipts SET state = 'saved',
          message = 'NXT action saved and verified. The next step has not been completed by this submission.', updated_at = NOW()
        WHERE pending_action_id = ${params.id} AND owner_user_id = ${ownerUserId} AND state = 'processing'
        RETURNING entered_by_user_id
      ), activity AS (
        INSERT INTO prospect_updates (prospect_id, update_date, update_notes, update_title,
          action_category, action_type, blackbaud_action_id, entered_by_user_id)
        SELECT p.id, ${action.actionDate}::date, ${action.notes || action.summary}, ${action.summary},
          ${action.actionCategory}, ${metadata.type}, ${actionId}, s.entered_by_user_id
        FROM saved s JOIN prospects p ON p.id = ${item.prospect_id} AND p.user_id = ${ownerUserId}
        RETURNING id
      )
      UPDATE users SET blackbaud_summary_cache = NULL, blackbaud_summary_cache_key = NULL,
        blackbaud_summary_cached_at = NULL, updated_at = NOW()
      WHERE id = ${ownerUserId} AND EXISTS (SELECT 1 FROM saved)
    `;
    if (action.completeReminder) {
      const completion = await applyPendingActionQuickAction({ id: params.id, ownerUserId, action: "complete", expectedUpdatedAt: item.updated_at });
      reminderCompleted = Boolean(completion?.item);
    }
    const message = reminderCompleted
      ? "NXT action saved and verified. Next step completed; linked discussions are unchanged."
      : action.completeReminder
        ? "NXT action saved and verified, but the next step changed and was not completed. Reload the saved list and review it before marking it complete. Do not log this action again."
        : "NXT action saved and verified. Your next step was left open; linked discussions are unchanged.";
    await sql`UPDATE pending_action_nxt_receipts SET reminder_completed = ${reminderCompleted}, message = ${message}, updated_at = NOW()
      WHERE pending_action_id = ${params.id} AND owner_user_id = ${ownerUserId}`;
    return reply({ receipt: { state: "saved", actionId, constituentId, reminderCompleted, message } });
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
    const message = verified
      ? "NXT action saved and verified, but the local completion result could not be confirmed. Reload the saved list before marking the next step complete. Do not log this action again."
      : "The app has not yet verified this NXT action. Do not log it again. Verification and next-step completion are separate.";
    try {
      await sql`UPDATE pending_action_nxt_receipts SET state = ${verified ? "saved" : "review"},
        message = ${message}, reminder_completed = ${reminderCompleted}, updated_at = NOW()
        WHERE pending_action_id = ${params.id} AND owner_user_id = ${ownerUserId}`;
    } catch { /* The original durable claim still prevents a duplicate POST. */ }
    return reply({ receipt: { state: verified ? "saved" : "review", actionId, constituentId, reminderCompleted, message } }, 202);
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
    if (receipt.state === "saved") return reply({ receipt: publicActionReceipt(receipt, item.status) });
    if (receipt.state !== "review") return reply({ error: "This submission is still processing. Reload submission status before verifying." }, 409);
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
      createPayload: expected.createPayload, metadata: expected.metadata })) {
      return reply({ error: "NXT returned the action, but its identity or required fields do not match the original submission. Review it in NXT. Nothing was sent or changed." }, 409);
    }
    const [saved] = await sql`
      WITH saved AS (
        UPDATE pending_action_nxt_receipts SET state = 'saved',
          message = 'Existing NXT action verified. No action was sent again. This check did not change the next step or linked discussions.', updated_at = NOW()
        WHERE pending_action_id = ${params.id} AND owner_user_id = ${ownerUserId} AND state = 'review'
          AND blackbaud_action_id = ${receipt.blackbaud_action_id} AND constituent_id = ${receipt.constituent_id}
          AND request_payload = ${JSON.stringify(expected)}::jsonb
        RETURNING *
      ), activity AS (
        INSERT INTO prospect_updates (prospect_id, update_date, update_notes, update_title,
          action_category, action_type, blackbaud_action_id, entered_by_user_id)
        SELECT p.id, ${expected.actionDate}::date, ${expected.notes || expected.summary}, ${expected.summary},
          ${expected.actionCategory}, ${expected.metadata.type}, s.blackbaud_action_id, s.entered_by_user_id
        FROM saved s JOIN prospects p ON p.id = ${originalProspectId} AND p.user_id = ${ownerUserId}
        LEFT JOIN constituents c ON c.id = p.constituent_id AND c.user_id = p.user_id
        WHERE s.constituent_id IN (p.blackbaud_constituent_id, c.blackbaud_constituent_id)
          AND (p.constituent_id IS NULL OR c.id IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY[p.blackbaud_constituent_id, c.blackbaud_constituent_id]) link(id)
            WHERE NULLIF(btrim(link.id), '') IS NOT NULL AND btrim(link.id) <> s.constituent_id)
          AND NOT EXISTS (SELECT 1 FROM prospect_updates pu WHERE pu.prospect_id = p.id AND pu.blackbaud_action_id = s.blackbaud_action_id)
        RETURNING id
      ), cache AS (
        UPDATE users SET blackbaud_summary_cache = NULL, blackbaud_summary_cache_key = NULL,
          blackbaud_summary_cached_at = NULL, updated_at = NOW()
        WHERE id = ${ownerUserId} AND EXISTS (SELECT 1 FROM saved) RETURNING id
      ) SELECT * FROM saved
    `;
    const latest = saved || await readNextStepActionReceipt(params.id, ownerUserId);
    if (latest?.state !== "saved") return reply({ error: "The saved submission changed. Reload its status; no NXT action was sent or changed." }, 409);
    const currentTask = await readNextStepAction(params.id, ownerUserId);
    return reply({ receipt: publicActionReceipt(latest, currentTask?.status || null) });
  } catch {
    return reply({ error: "Verification could not finish. No NXT action was sent or changed. Reload submission status, then retry verification when NXT is available." }, 502);
  }
}
