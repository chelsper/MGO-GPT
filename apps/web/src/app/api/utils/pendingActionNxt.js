import sql from "@/app/api/utils/sql";

// Shared by the read and claim queries, so changed links or versions cannot be
// submitted using the previously displayed context. All IDs remain owner-scoped.
export const nextStepActionSourceSql = `
  SELECT pa.id, pa.title, pa.details, pa.category, pa.status,
    pa.updated_at::text AS updated_at, p.id AS prospect_id,
    COALESCE(c.name, p.prospect_name, pc.name) AS constituent_name,
    c.blackbaud_constituent_id AS direct_nxt_id,
    p.blackbaud_constituent_id AS prospect_nxt_id,
    pc.blackbaud_constituent_id AS prospect_constituent_nxt_id,
    po.title AS opportunity_title, po.blackbaud_opportunity_id,
    (pa.prospect_id IS NOT NULL AND p.id IS NULL
      OR pa.constituent_id IS NOT NULL AND c.id IS NULL
      OR p.constituent_id IS NOT NULL AND pc.id IS NULL
      OR pa.prospect_opportunity_id IS NOT NULL AND po.id IS NULL) AS invalid_links,
    json_build_array(pa.updated_at::text, pa.prospect_id, pa.constituent_id,
      p.constituent_id, p.blackbaud_constituent_id, c.blackbaud_constituent_id,
      pc.blackbaud_constituent_id, pa.prospect_opportunity_id,
      po.blackbaud_opportunity_id, po.prospect_id)::text AS source_token
  FROM pending_actions pa
  LEFT JOIN prospects p ON p.id = pa.prospect_id AND p.user_id = pa.owner_user_id
  LEFT JOIN constituents c ON c.id = pa.constituent_id AND c.user_id = pa.owner_user_id
  LEFT JOIN constituents pc ON pc.id = p.constituent_id AND pc.user_id = pa.owner_user_id
  LEFT JOIN prospect_opportunities po ON po.id = pa.prospect_opportunity_id AND po.prospect_id = p.id
  WHERE pa.id = $1 AND pa.owner_user_id = $2
`;

export async function readNextStepAction(id, ownerUserId) {
  const [item] = await sql(nextStepActionSourceSql, [id, ownerUserId]);
  if (!item) return null;
  const ids = [...new Set([item.direct_nxt_id, item.prospect_nxt_id, item.prospect_constituent_nxt_id]
    .map(value => String(value || "").trim()).filter(Boolean))];
  return { ...item, constituentId: !item.invalid_links && ids.length === 1 ? ids[0] : null };
}

export async function readNextStepActionReceipt(id, ownerUserId) {
  const [receipt] = await sql`
    SELECT state, blackbaud_action_id, constituent_id, reminder_completed, message
    FROM pending_action_nxt_receipts
    WHERE pending_action_id = ${id} AND owner_user_id = ${ownerUserId}
  `;
  return receipt || null;
}

export async function claimNextStepAction({ id, ownerUserId, enteredByUserId, sourceToken, constituentId, payload }) {
  const [claim] = await sql(`
    WITH source AS MATERIALIZED (${nextStepActionSourceSql}), locked AS (
      SELECT pa.id FROM pending_actions pa JOIN source s ON s.id = pa.id
      WHERE pa.owner_user_id = $2 AND pa.status = 'Open'
        AND pa.updated_at::text = s.updated_at AND s.source_token = $3
        AND NOT s.invalid_links
        AND $5 IN (s.direct_nxt_id, s.prospect_nxt_id, s.prospect_constituent_nxt_id)
        AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY[s.direct_nxt_id, s.prospect_nxt_id, s.prospect_constituent_nxt_id]) link(id)
          WHERE NULLIF(btrim(link.id), '') IS NOT NULL AND btrim(link.id) <> $5)
      FOR UPDATE OF pa
    )
    INSERT INTO pending_action_nxt_receipts
      (pending_action_id, owner_user_id, entered_by_user_id, constituent_id, request_payload)
    SELECT id, $2, $4, $5, $6::jsonb FROM locked
    ON CONFLICT (pending_action_id) DO NOTHING
    RETURNING pending_action_id
  `, [id, ownerUserId, sourceToken, enteredByUserId, constituentId, JSON.stringify(payload)]);
  return Boolean(claim);
}

export function actionRecord(payload) {
  return payload?.value && !Array.isArray(payload.value) ? payload.value : payload;
}
export function actionRecordId(payload) {
  const action = actionRecord(payload);
  return String(action?.id || action?.action_id || action?.constituent_action_id || "");
}
export function actionConstituentId(payload) {
  const action = actionRecord(payload);
  return String(action?.constituent_id || action?.constituent?.id || "");
}

export function verifiedNextStepAction(payload, { actionId, constituentId, createPayload, metadata }) {
  const record = actionRecord(payload);
  const fundraisers = Array.isArray(record?.fundraisers) ? record.fundraisers.map(item => String(typeof item === "object" ? item?.id : item)) : [];
  return actionRecordId(payload) === String(actionId)
    && actionConstituentId(payload) === String(constituentId)
    && record?.completed === true
    && record?.summary === createPayload.summary
    && (!createPayload.description || record?.description === createPayload.description)
    && record?.category === createPayload.category
    && String(record?.date || "").slice(0, 10) === createPayload.date.slice(0, 10)
    && record?.type === metadata.type
    && metadata.fundraisers.every(id => fundraisers.includes(String(id)))
    && (!metadata.opportunity_id || String(record?.opportunity_id || "") === metadata.opportunity_id);
}

export function publicActionReceipt(receipt) {
  return {
    state: receipt.state, actionId: receipt.blackbaud_action_id || null,
    constituentId: receipt.constituent_id, reminderCompleted: Boolean(receipt.reminder_completed),
    message: receipt.message || "This action submission is in progress or awaiting verification. It will not be sent again. Reload its status before doing anything else in NXT.",
  };
}
