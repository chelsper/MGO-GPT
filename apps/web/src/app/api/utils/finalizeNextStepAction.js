import sql from "@/app/api/utils/sql";

// The marker, local activity, and cache invalidation commit together. The guarded
// UPDATE serializes competing finalizers; a failed statement leaves it retryable.
export default async function finalizeNextStepAction({ id, ownerUserId, actionId, constituentId, expected, originalProspectId, states, message, processingVersion = null }) {
  const [saved] = await sql`
    WITH saved AS (
      UPDATE pending_action_nxt_receipts SET state = 'saved', local_finalized_at = NOW(),
        message = ${message}, updated_at = NOW()
      WHERE pending_action_id = ${id} AND owner_user_id = ${ownerUserId}
        AND state = ANY(${states}::text[]) AND local_finalized_at IS NULL
        AND blackbaud_action_id = ${actionId} AND constituent_id = ${constituentId}
        AND request_payload = ${JSON.stringify(expected)}::jsonb
        AND (${processingVersion}::text IS NULL OR (updated_at = ${processingVersion}::timestamptz
          AND updated_at <= NOW() - INTERVAL '5 minutes'))
      RETURNING *
    ), activity AS (
      INSERT INTO prospect_updates (prospect_id, update_date, update_notes, update_title,
        action_category, action_type, blackbaud_action_id, entered_by_user_id)
      SELECT p.id, ${expected.actionDate}::date, ${expected.notes || expected.summary}, ${expected.summary},
        ${expected.actionCategory}, ${expected.metadata.type}, s.blackbaud_action_id, s.entered_by_user_id
      FROM saved s JOIN prospects p ON p.id = ${originalProspectId} AND p.user_id = ${ownerUserId}
      LEFT JOIN constituents c ON c.id = p.constituent_id AND c.user_id = p.user_id
      WHERE s.constituent_id IN (p.blackbaud_constituent_id, c.blackbaud_constituent_id)
        AND ${expected.actionIntent || "completed"} = 'completed'
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
  return saved || null;
}
