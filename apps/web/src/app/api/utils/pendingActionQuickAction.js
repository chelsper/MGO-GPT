import sql from "@/app/api/utils/sql";

export default async function applyPendingActionQuickAction({ id, ownerUserId, action, dueDate, expectedUpdatedAt }) {
  const reopening = action === "reopen";
  const completing = action === "complete";
  // Keep the reminder, its legacy primary summary, and dashboard cache atomic.
  // Reopening must never overwrite a newer primary plan or linked discussion.
  const [result] = await sql`
    WITH target AS MATERIALIZED (
      SELECT * FROM pending_actions
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
      FOR UPDATE
    ), primary_prospect AS MATERIALIZED (
      SELECT p.* FROM prospects p JOIN target t ON p.id = t.prospect_id
      WHERE p.user_id = ${ownerUserId} AND t.is_primary AND NOT ${reopening}
      FOR UPDATE OF p
    ), updated AS (
      UPDATE pending_actions pa
      SET status = ${completing ? "Done" : "Open"},
          due_date = CASE WHEN ${action === "reschedule"} THEN ${dueDate ?? null}::date ELSE pa.due_date END,
          completed_at = CASE WHEN ${completing} THEN NOW() WHEN ${reopening} THEN NULL ELSE pa.completed_at END,
          is_primary = CASE WHEN ${reopening} THEN FALSE ELSE pa.is_primary END,
          updated_at = NOW()
      FROM target t
      WHERE pa.id = t.id AND pa.owner_user_id = ${ownerUserId}
        AND pa.updated_at = ${expectedUpdatedAt}::timestamptz
        AND pa.status = ${reopening ? "Done" : "Open"}
        AND (
          ${reopening} OR NOT t.is_primary OR t.prospect_id IS NULL OR EXISTS (
            SELECT 1 FROM primary_prospect p
            WHERE p.next_action_text IS NOT DISTINCT FROM t.title
              AND p.next_action_due_date IS NOT DISTINCT FROM t.due_date
              AND p.next_action_completed_at IS NULL
          )
        )
      RETURNING pa.*
    ), mirrored AS (
      UPDATE prospects p
      SET next_action_text = CASE WHEN u.status = 'Open' THEN u.title ELSE NULL END,
          next_action_due_date = CASE WHEN u.status = 'Open' THEN u.due_date ELSE NULL END,
          next_action_completed_at = u.completed_at,
          updated_at = NOW()
      FROM updated u, primary_prospect locked
      WHERE p.id = u.prospect_id AND p.id = locked.id AND p.user_id = ${ownerUserId} AND u.is_primary
      RETURNING p.id
    ), invalidated AS (
      UPDATE users SET blackbaud_summary_cache = NULL, blackbaud_summary_cache_key = NULL,
        blackbaud_summary_cached_at = NULL, updated_at = NOW()
      WHERE id = ${ownerUserId} AND EXISTS (SELECT 1 FROM updated)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM target) AS found,
      (SELECT json_build_object('id', id, 'status', status, 'due_date', due_date,
        'is_primary', is_primary, 'updated_at', updated_at::text) FROM updated) AS item
  `;
  return result;
}
