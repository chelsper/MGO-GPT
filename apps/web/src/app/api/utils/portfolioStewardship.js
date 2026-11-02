import sql from "./sql";
import ensureAppSchema from "./ensureAppSchema";
import { isAssignedPortfolioConstituent } from "./portfolioContactRefresh";
import { readGiftReceipts } from "./stewardshipReceipts";
import { canEditWorkspace, isMgoRole, isReviewerRole } from "@/utils/workspaceRoles";

const rejected = (message, status) => Object.assign(new Error(message), { stewardshipScope: true, status });

export async function checkPortfolioStewardshipScope(context, scope) {
  const actor = context?.sessionUser;
  if (!actor || (!isMgoRole(actor.role) && !isReviewerRole(actor.role)) || !canEditWorkspace(context))
    throw rejected("This portfolio is read-only or unavailable to your account.", 403);
  if (String(scope.viewerId) !== String(actor.id) || String(scope.workspaceId) !== String(context.workspaceUser.id))
    throw rejected("Your workspace changed. Close Stewardship and reopen it from the correct portfolio.", 409);
  if (!/^[1-9]\d{0,17}$/.test(String(scope.constituentId || "")))
    throw rejected("A valid constituent system ID is required.", 400);
  await ensureAppSchema();
  if (!await isAssignedPortfolioConstituent(context.workspaceUser.id, scope.constituentId))
    throw rejected("This constituent is not in this MGO's saved portfolio. Reload the portfolio before continuing.", 403);
}

// Saved app data only. Receipt visibility stays identical to Received Items;
// requests and next steps belong to the selected portfolio's owner.
export async function readPortfolioStewardship(context, constituentId, db = sql) {
  const ownerId = context.workspaceUser.id;
  const requests = await db`
    SELECT r.id::text, r.request_type, r.status, r.needed_by::text, r.updated_at,
      r.stewardship_gift_item_snapshot->>'name' AS item_name,
      CASE WHEN pa.owner_user_id = ${ownerId}
        AND pa.source_gift_id IS NOT NULL
        AND NULLIF(TRIM(pa.source_gift_snapshot->>'constituentName'),'') IS NOT NULL
        AND pa.source_gift_snapshot->>'constituentId' = ${constituentId}
        THEN pa.id::text ELSE NULL END AS task_id
    FROM data_change_requests r
    LEFT JOIN pending_actions pa ON pa.id = r.source_pending_action_id
    WHERE r.owner_user_id = ${ownerId} AND r.blackbaud_constituent_id = ${constituentId}
      AND r.source_pending_action_id IS NOT NULL
    ORDER BY CASE WHEN r.status IN ('Open','In Progress') THEN 0 ELSE 1 END,
      r.updated_at DESC, r.id DESC LIMIT 11
  `;
  const followUps = await db`
    SELECT pa.id::text, pa.title, pa.due_date::text,
      (pa.source_gift_id IS NOT NULL
        AND pa.source_gift_snapshot->>'constituentId' = ${constituentId}
        AND NULLIF(TRIM(pa.source_gift_snapshot->>'constituentName'),'') IS NOT NULL) AS can_request,
      (SELECT r.id::text FROM data_change_requests r
        WHERE r.source_pending_action_id = pa.id AND r.owner_user_id = ${ownerId}) AS request_id
    FROM pending_actions pa
    LEFT JOIN constituents c ON c.id = pa.constituent_id AND c.user_id = ${ownerId}
    LEFT JOIN prospects p ON p.id = pa.prospect_id AND p.user_id = ${ownerId}
    LEFT JOIN constituents pc ON pc.id = p.constituent_id AND pc.user_id = ${ownerId}
    CROSS JOIN LATERAL (SELECT array_remove(ARRAY[
      NULLIF(TRIM(pa.source_gift_snapshot->>'constituentId'),''),
      NULLIF(TRIM(c.blackbaud_constituent_id),''),
      NULLIF(TRIM(p.blackbaud_constituent_id),''),
      NULLIF(TRIM(pc.blackbaud_constituent_id),'')], NULL) AS ids) identity
    WHERE pa.owner_user_id = ${ownerId} AND pa.status = 'Open'
      AND (pa.category = 'Stewardship' OR pa.source_gift_id IS NOT NULL)
      AND ${constituentId} = ANY(identity.ids)
      AND NOT EXISTS (SELECT 1 FROM unnest(identity.ids) id WHERE id <> ${constituentId})
    ORDER BY pa.due_date ASC NULLS LAST, pa.id LIMIT 11
  `;
  const receipts = await readGiftReceipts(context.sessionUser, {
    constituentId, itemId: null, requestId: null, before: null, search: "", includeVoided: false,
  }, db);
  return {
    requests: requests.slice(0, 10), requestsTruncated: requests.length > 10,
    followUps: followUps.slice(0, 10), followUpsTruncated: followUps.length > 10,
    receivedItems: receipts.slice(0, 5).map(row => ({
      id: row.id, name: row.item_snapshot?.name || "Stewardship item", receivedOn: row.received_on,
      source: row.source_kind === "nxt_history" ? "Imported NXT history" : "Recorded in app",
    })),
    receivedItemsTruncated: receipts.length > 5,
  };
}
