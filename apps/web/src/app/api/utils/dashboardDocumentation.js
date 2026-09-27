import { randomUUID } from "node:crypto";
import { dashboardReminderPolicy } from "@/utils/dashboardAssistantSettings";
import sql from "./sql";
import { blackbaudApiFetch } from "./blackbaud";
import { societySourceScope } from "./societyGivingSource";
import { INTERACTION_TYPES } from "@/utils/actionEntryOptions";
import { giftPriorityRevision } from "./dashboardGiftPriorities";

const PAGE_LIMIT = 500;
const COOLDOWN_MS = 60_000;
const id = value => /^[1-9]\d*$/.test(String(value || ""));
const normalize = value => typeof value === "string" ? value.trim().toLowerCase() : "";
const knownTypes = new Set(INTERACTION_TYPES.map(normalize));
const unavailable = () => ({ status: "unavailable" });

// An empty page is not evidence of absence without an explicit, matching total.
// Never follow next_link: this is a bounded check, not a new background crawler.
export function documentationPage(payload, constituentId) {
  if (!Array.isArray(payload?.value) || payload.value.length >= PAGE_LIMIT ||
      !Number.isSafeInteger(payload.count) || payload.count < 0 || payload.count !== payload.value.length ||
      (payload.next_link != null && payload.next_link !== "")) return null;
  const seen = new Set();
  for (const row of payload.value) {
    if (!id(row?.id) || String(row.constituent_id || "") !== String(constituentId) || seen.has(String(row.id))) return null;
    seen.add(String(row.id));
  }
  return payload.value;
}

export function assessDocumentation(opportunities, actions, constituentId) {
  const opps = documentationPage(opportunities, constituentId);
  if (!opps) return { status: "incomplete" };
  if (opps.length) return { status: "found", source: "opportunity" };
  const rows = documentationPage(actions, constituentId);
  if (!rows) return { status: "incomplete" };
  if (rows.some(row => /solicit/i.test(normalize(row.type)))) return { status: "found", source: "solicitation" };
  // Custom/untyped actions may encode solicitation differently. Do not guess.
  if (rows.some(row => !knownTypes.has(normalize(row.type)))) return { status: "incomplete" };
  return { status: "review", opportunityCount: 0, actionCount: rows.length };
}

export async function hasLocalDocumentation(constituentId, db = sql) {
  const [row] = await db`
    SELECT (
      EXISTS (SELECT 1 FROM prospect_opportunities o JOIN prospects p ON p.id = o.prospect_id
        WHERE p.blackbaud_constituent_id = ${constituentId})
      OR EXISTS (SELECT 1 FROM nxt_create_receipts r WHERE r.constituent_id = ${constituentId}
        AND (r.kind = 'opportunity' OR r.state IN ('processing','review','created') OR r.payload->>'type' ILIKE '%solicit%'))
      OR EXISTS (SELECT 1 FROM pending_action_nxt_receipts r WHERE r.constituent_id = ${constituentId}
        AND (r.state IN ('processing','review') OR r.request_payload->>'type' ILIKE '%solicit%'
          OR r.request_payload->>'interactionType' ILIKE '%solicit%'
          OR r.request_payload #>> '{metadata,type}' ILIKE '%solicit%'))
      OR EXISTS (SELECT 1 FROM prospect_updates u JOIN prospects p ON p.id = u.prospect_id
        WHERE p.blackbaud_constituent_id = ${constituentId} AND u.action_type ILIKE '%solicit%')
      OR EXISTS (SELECT 1 FROM submissions s JOIN constituents c ON c.id = s.constituent_id
        WHERE c.blackbaud_constituent_id = ${constituentId} AND s.interaction_type ILIKE '%solicit%')
    ) AS present
  `;
  if (typeof row?.present !== "boolean") throw new Error("Local documentation coverage unavailable");
  return row.present;
}

export async function claimDocumentationCheck({ viewerId, workspaceId, scopeKey, item, db = sql }) {
  const token = randomUUID();
  const [claim] = await db`
    INSERT INTO dashboard_documentation_checks
      (viewer_user_id, workspace_user_id, scope_key, item_key, item_revision, claim_token, retry_after)
    VALUES (${viewerId}, ${workspaceId}, ${scopeKey}, ${item.key}, ${item.revision}, ${token}::uuid, NOW() + INTERVAL '1 minute')
    ON CONFLICT (viewer_user_id) DO UPDATE SET workspace_user_id = EXCLUDED.workspace_user_id,
      scope_key = EXCLUDED.scope_key, item_key = EXCLUDED.item_key, item_revision = EXCLUDED.item_revision,
      claim_token = EXCLUDED.claim_token, retry_after = EXCLUDED.retry_after, result = NULL
    WHERE dashboard_documentation_checks.retry_after <= NOW()
    RETURNING claim_token
  `;
  if (claim) return { token };
  const [saved] = await db`
    SELECT result, retry_after FROM dashboard_documentation_checks
    WHERE viewer_user_id = ${viewerId} AND workspace_user_id = ${workspaceId}
      AND scope_key = ${scopeKey} AND item_key = ${item.key} AND item_revision = ${item.revision}
      AND retry_after > NOW()
  `;
  return { result: saved?.result || { status: "waiting" } };
}

export async function finishDocumentationCheck({ viewerId, token, result, retryMs = COOLDOWN_MS, db = sql }) {
  const [saved] = await db`
    UPDATE dashboard_documentation_checks SET result = ${JSON.stringify(result)}::jsonb,
      retry_after = GREATEST(retry_after, NOW() + ${Math.max(COOLDOWN_MS, Math.min(86_400_000, retryMs || 0))} * INTERVAL '1 millisecond')
    WHERE viewer_user_id = ${viewerId} AND claim_token = ${token}::uuid
    RETURNING viewer_user_id
  `;
  return Boolean(saved);
}

export async function checkGiftDocumentation({ viewerId, workspaceId, item, origin, db = sql, settings,
  fetchNxt = blackbaudApiFetch, resolveScope = societySourceScope, localCheck = hasLocalDocumentation,
  claim = claimDocumentationCheck, finish = finishDocumentationCheck, now = () => new Date() }) {
  if (item?.kind !== "gift" || !id(item.constituentId) || !id(item.giftId) ||
      item.key !== `gift:${item.giftId}` || !/^[a-f0-9]{64}$/.test(item.revision || "") ||
      !Number.isFinite(item.giftAmount) || item.giftAmount < dashboardReminderPolicy(settings).majorGiftMinimum) return unavailable();
  // Read only through the signed-in viewer's NXT connection, never a silently
  // elevated refresh account. Reconnection invalidates the short-lived result.
  let scopeKey;
  try { scopeKey = await resolveScope({ authUserId: viewerId, origin, db }); }
  catch { return { status: "connection" }; }
  const lease = await claim({ viewerId, workspaceId, scopeKey, item, db });
  if (!lease.token) {
    if (lease.result?.status === "review") {
      try {
        if (await localCheck(item.constituentId, db)) return { status: "found", source: "app", checkedAt: now().toISOString() };
      } catch { return unavailable(); }
    }
    return lease.result;
  }
  let result, retryMs = COOLDOWN_MS;
  try {
    if (await localCheck(item.constituentId, db)) result = { status: "found", source: "app" };
    else {
      const api = { userId: workspaceId, authUserId: viewerId, origin, method: "GET", maxRetries: 0, timeoutMs: 8_000 };
      const gift = await fetchNxt(`/gift/v1/gifts/${item.giftId}`, api);
      if (!gift || String(gift.id) !== item.giftId || String(gift.constituent_id) !== item.constituentId ||
          gift.amount?.value !== item.giftAmount || giftPriorityRevision(gift) !== item.revision) result = { status: "changed" };
      else {
        const opportunities = await fetchNxt("/opportunity/v1/opportunities", { ...api,
          searchParams: { constituent_id: item.constituentId, include_inactive: true, limit: PAGE_LIMIT } });
        const opps = documentationPage(opportunities, item.constituentId);
        if (!opps) result = { status: "incomplete" };
        else if (opps.length) result = { status: "found", source: "opportunity" };
        else {
          const actions = await fetchNxt(`/constituent/v1/constituents/${item.constituentId}/actions`, {
            ...api, searchParams: { limit: PAGE_LIMIT },
          });
          result = assessDocumentation(opportunities, actions, item.constituentId);
        }
      }
      // A local create may have finished while the remote list still lagged.
      if (result.status === "review" && await localCheck(item.constituentId, db)) result = { status: "found", source: "app" };
    }
    if (scopeKey !== await resolveScope({ authUserId: viewerId, origin, db })) result = unavailable();
  } catch (error) {
    retryMs = Number(error?.retryAfterMs) || COOLDOWN_MS;
    result = unavailable();
  }
  result = { ...result, checkedAt: now().toISOString() };
  return await finish({ viewerId, token: lease.token, result, retryMs, db }) ? result : unavailable();
}
