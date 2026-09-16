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
      receipt: receipt ? publicActionReceipt(receipt) : null,
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
    if (previous) return reply({ receipt: publicActionReceipt(previous) });
    if (item.status !== "Open" || item.source_token !== body.sourceToken) {
      return reply({ error: "This next step or its links changed. Close this dialog and reload the saved list before continuing. No action was sent." }, 409);
    }
    constituentId = item.constituentId;
    if (!constituentId) return reply({ error: "A single verified constituent link is required. Review this prospect's NXT link first. No action was sent." }, 409);
    const api = { userId: ownerUserId, authUserId: sessionUser.id, origin: new URL(request.url).origin };
    // These read-only checks happen before claiming a write, so a connection or
    // attribution problem can be corrected and retried without duplicate risk.
    const constituent = await getBlackbaudConstituentById({ ...api, constituentId });
    if (String(constituent?.raw?.id || constituent?.raw?.constituent_id || "") !== constituentId) {
      return reply({ error: "NXT could not confirm this constituent's system ID. No action was sent." }, 409);
    }
    const fundraiserIds = await resolveActionFundraiserIds({ currentUser: sessionUser, primaryFundraiserUser: workspaceUser,
      requirePrimaryFundraiser: true, apiUserId: ownerUserId, origin: api.origin });
    if (!fundraiserIds?.length) throw new Error("Missing fundraiser attribution");
    const action = { ...body, summary: body.summary.trim(), notes: body.notes.trim() };
    const createPayload = buildBlackbaudActionPayload({ blackbaudConstituentId: constituentId,
      actionDate: action.actionDate, actionCategory: action.actionCategory, summary: action.summary,
      actionNotes: action.notes, authorName: sessionUser.name || sessionUser.email,
      opportunityId: item.blackbaud_opportunity_id, fundraiserIds });
    const metadata = buildBlackbaudActionMetadataPayload({ actionDate: action.actionDate,
      interactionType: action.interactionType, opportunityId: item.blackbaud_opportunity_id, fundraiserIds });
    claimed = await claimNextStepAction({ id: params.id, ownerUserId, enteredByUserId: sessionUser.id,
      sourceToken: body.sourceToken, constituentId, payload: { ...action, createPayload, metadata } });
    if (!claimed) {
      const existing = await readNextStepActionReceipt(params.id, ownerUserId);
      return existing ? reply({ receipt: publicActionReceipt(existing) })
        : reply({ error: "This next step changed before saving. Reload it; no action was sent." }, 409);
    }

    // No POST retries, including inside the Blackbaud client. A timed-out write
    // may have succeeded remotely; the durable claim blocks another submission.
    const created = await createBlackbaudAction({ ...api, payload: createPayload, maxRetries: 0 });
    actionId = actionRecordId(created);
    if (!actionId) throw new Error("NXT did not return an action ID");
    await sql`UPDATE pending_action_nxt_receipts SET blackbaud_action_id = ${actionId}, updated_at = NOW()
      WHERE pending_action_id = ${params.id} AND owner_user_id = ${ownerUserId}`;
    const saved = await getBlackbaudAction({ ...api, actionId });
    if (actionRecordId(saved) !== actionId || actionConstituentId(saved) !== constituentId) throw new Error("Action identity unverified");
    await updateBlackbaudAction({ ...api, actionId, payload: metadata });
    const confirmed = await getBlackbaudAction({ ...api, actionId });
    if (!verifiedNextStepAction(confirmed, { actionId, constituentId, createPayload, metadata })) throw new Error("Action fields unverified");
    verified = true;

    // Finalize the receipt and local activity in one statement, exactly once.
    // Never run the legacy action route, which can clear the primary plan.
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
  } catch {
    if (!claimed) return reply({ error: "NXT connection or MGO fundraiser attribution could not be verified. No action was sent. Check the connection and fundraiser mapping before trying again." }, 502);
    const message = verified
      ? "NXT action saved and verified, but the local completion result could not be confirmed. Reload the saved list before marking the next step complete. Do not log this action again."
      : "NXT action submission needs verification. The next step was not completed. Check the constituent's actions in NXT before making further changes; this submission will not be sent again.";
    try {
      await sql`UPDATE pending_action_nxt_receipts SET state = ${verified ? "saved" : "review"},
        message = ${message}, reminder_completed = ${reminderCompleted}, updated_at = NOW()
        WHERE pending_action_id = ${params.id} AND owner_user_id = ${ownerUserId}`;
    } catch { /* The original durable claim still prevents a duplicate POST. */ }
    return reply({ receipt: { state: verified ? "saved" : "review", actionId, constituentId, reminderCompleted, message } }, 202);
  }
}
