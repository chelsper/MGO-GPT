import sql from "./sql";
import { canEditWorkspace, isReviewerRole } from "@/utils/workspaceRoles";
import { ASSISTANCE_TYPES } from "@/utils/stewardshipAssistance";

export async function readTaskAssistance(context, id, db = sql) {
  if (!canEditWorkspace(context)) return null;
  const [row] = await db`
    SELECT pa.id, pa.status, pa.updated_at::text AS updated_at, pa.source_gift_snapshot,
      CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', r.id::text, 'request_type', r.request_type, 'request_note', r.request_note,
        'needed_by', r.needed_by, 'status', r.status, 'reviewer_notes', r.reviewer_notes,
        'created_at', r.created_at, 'request_version', r.request_version) END AS request
    FROM pending_actions pa
    LEFT JOIN data_change_requests r ON r.source_pending_action_id = pa.id AND r.owner_user_id = pa.owner_user_id
    WHERE pa.id = ${id} AND pa.owner_user_id = ${context.workspaceUser.id}
      AND pa.source_gift_id IS NOT NULL
      AND pa.source_gift_snapshot->>'constituentId' ~ '^[1-9][0-9]*$'
      AND NULLIF(TRIM(pa.source_gift_snapshot->>'constituentName'), '') IS NOT NULL
  `;
  return row || null;
}

export async function createTaskAssistance(context, id, draft, db = sql) {
  if (!canEditWorkspace(context)) return null;
  const { sessionUser: actor, workspaceUser: owner } = context;
  // Serialize retries and recheck permissions/task version after locks. The
  // request lives in the existing Work Queue, not in a second stewardship queue.
  const result = await db.transaction([
    db`SELECT id FROM users WHERE id IN (${actor.id}, ${owner.id}) ORDER BY id FOR UPDATE`,
    db`SELECT id FROM pending_actions WHERE id = ${id} AND owner_user_id = ${owner.id} FOR UPDATE`,
    db`
      WITH eligible AS MATERIALIZED (
        SELECT pa.*, actor.name AS requester_name
        FROM pending_actions pa
        JOIN users owner ON owner.id = pa.owner_user_id AND owner.id = ${owner.id}
          AND owner.role = ${owner.role} AND owner.active IS NOT FALSE
        JOIN users actor ON actor.id = ${actor.id} AND actor.role = ${actor.role} AND actor.active IS NOT FALSE
        WHERE pa.id = ${id} AND pa.source_gift_id IS NOT NULL
          AND pa.source_gift_snapshot->>'constituentId' ~ '^[1-9][0-9]*$'
          AND NULLIF(TRIM(pa.source_gift_snapshot->>'constituentName'), '') IS NOT NULL
      ), inserted AS (
        INSERT INTO data_change_requests
          (source_pending_action_id, owner_user_id, requester_user_id, constituent_name,
           blackbaud_constituent_id, source_gift_snapshot, request_type, request_note, needed_by, source_context, status)
        SELECT id, owner_user_id, ${actor.id}, source_gift_snapshot->>'constituentName',
          source_gift_snapshot->>'constituentId', source_gift_snapshot,
          ${`Stewardship: ${ASSISTANCE_TYPES[draft.type]}`}, ${draft.instructions}, ${draft.neededBy}::date, 'stewardship', 'Open'
        FROM eligible WHERE status = 'Open' AND updated_at = ${draft.expectedUpdatedAt}::timestamptz
        ON CONFLICT (source_pending_action_id) WHERE source_pending_action_id IS NOT NULL DO NOTHING RETURNING *
      ), audited AS (
        INSERT INTO stewardship_request_events(request_id, actor_user_id, actor_name, status, note, version)
        SELECT i.id, ${actor.id}, e.requester_name, i.status, 'Request submitted', i.request_version
        FROM inserted i JOIN eligible e ON e.id = i.source_pending_action_id RETURNING id
      )
      SELECT id::text, FALSE AS already_exists FROM inserted
      UNION ALL
      SELECT r.id::text, TRUE AS already_exists FROM data_change_requests r
      JOIN eligible e ON r.source_pending_action_id = e.id AND r.owner_user_id = e.owner_user_id
      WHERE NOT EXISTS (SELECT 1 FROM inserted)
    `,
  ]);
  return result[2]?.[0] || null;
}

export async function updateAssistance(actor, id, draft, db = sql) {
  if (!actor?.id || actor.active === false || !isReviewerRole(actor.role)) return null;
  const result = await db.transaction([
    db`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`,
    db`
      WITH updated AS (
        UPDATE data_change_requests r
        SET status = ${draft.status}, reviewer_notes = ${draft.note},
          request_version = r.request_version + 1, updated_at = NOW(),
          reviewed_by = ${actor.id}, reviewed_at = NOW()
        FROM users actor WHERE r.id = ${id} AND r.request_version = ${draft.version}
          AND r.source_pending_action_id IS NOT NULL
          AND actor.id = ${actor.id} AND actor.role = ${actor.role} AND actor.active IS NOT FALSE
        RETURNING r.*, actor.name AS reviewed_by_name
      ), audited AS (
        INSERT INTO stewardship_request_events(request_id, actor_user_id, actor_name, status, note, version)
        SELECT id, ${actor.id}, reviewed_by_name, status, reviewer_notes, request_version FROM updated RETURNING id
      )
      SELECT * FROM updated
    `,
  ]);
  return result[1]?.[0] || null;
}
