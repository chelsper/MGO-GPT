import sql from "./sql";
import { canEditWorkspace } from "@/utils/workspaceRoles";
import { giftFollowUpStatus } from "@/utils/giftFollowUpStatus";

export async function readGiftFollowUpStatuses(workspaceId, gifts, db = sql) {
  // The gift-reminder source is already bounded. Fetch progress in one batch,
  // including undated, distant, and completed tasks, not just due reminders.
  const identities = [...new Map(gifts.map(item => [String(item.giftId), {
    gift_id: String(item.giftId), constituent_id: String(item.constituentId),
  }])).values()];
  if (!identities.length) return new Map();
  const rows = await db`
    SELECT pa.id, pa.owner_user_id, pa.title, pa.status, pa.due_date,
      pa.source_gift_id, owner.name AS owner_name
    FROM pending_actions pa JOIN users owner ON owner.id = pa.owner_user_id
    JOIN jsonb_to_recordset(${JSON.stringify(identities)}::jsonb)
      AS gift(gift_id text, constituent_id text)
      ON gift.gift_id = pa.source_gift_id
        AND gift.constituent_id = pa.source_gift_snapshot->>'constituentId'
    WHERE pa.owner_user_id = ${workspaceId} AND pa.source_gift_id IS NOT NULL
    LIMIT ${identities.length}
  `;
  return new Map(rows.map(task => [task.source_gift_id, giftFollowUpStatus(task, task.owner_name)]));
}

export async function readGiftFollowUp(workspaceId, giftId, db = sql) {
  const [task] = await db`
    SELECT id, owner_user_id, title, status, due_date, source_gift_snapshot
    FROM pending_actions WHERE owner_user_id = ${workspaceId} AND source_gift_id = ${giftId}
  `;
  return task || null;
}

export async function createGiftFollowUp({ context, item, draft, db = sql }) {
  if (!canEditWorkspace(context)) return null;
  const { sessionUser: actor, workspaceUser: owner } = context;
  const snapshot = { giftId: item.giftId, constituentId: item.constituentId,
    constituentName: item.constituentName, amount: item.giftAmount, date: item.dueDate,
    revision: item.revision, checkedAt: item.savedAt };
  // Lock users in a stable order. The next READ COMMITTED statement sees any
  // committed retry, and rechecks permissions and portfolio membership.
  const results = await db.transaction([
    db`SELECT id FROM users WHERE id IN (${actor.id}, ${owner.id}) ORDER BY id FOR UPDATE`,
    db`
      WITH eligible AS (
        SELECT owner.id FROM users owner
        JOIN users actor ON actor.id = ${actor.id} AND actor.role = ${actor.role} AND actor.active IS NOT FALSE
        WHERE owner.id = ${owner.id} AND owner.role = ${owner.role} AND owner.active IS NOT FALSE
          AND owner.blackbaud_portfolio_cached_at BETWEEN NOW() - INTERVAL '72 hours' AND NOW()
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(owner.blackbaud_portfolio_cache->'leadSolicitor') = 'array'
                THEN owner.blackbaud_portfolio_cache->'leadSolicitor' ELSE '[]'::jsonb END ||
              CASE WHEN jsonb_typeof(owner.blackbaud_portfolio_cache->'supportingSolicitor') = 'array'
                THEN owner.blackbaud_portfolio_cache->'supportingSolicitor' ELSE '[]'::jsonb END
            ) person WHERE person->>'constituentId' = ${item.constituentId}
          )
      ), existing_task AS (
        SELECT pa.* FROM pending_actions pa JOIN eligible e ON e.id = pa.owner_user_id
        WHERE pa.source_gift_id = ${item.giftId}
      ), existing_constituent AS (
        SELECT c.id FROM constituents c WHERE c.user_id = ${owner.id}
          AND c.blackbaud_constituent_id = ${item.constituentId}
        ORDER BY c.id LIMIT 1
      ), new_constituent AS (
        INSERT INTO constituents (user_id, name, normalized_name, blackbaud_constituent_id)
        SELECT ${owner.id}, ${item.constituentName}, LOWER(${item.constituentName}), ${item.constituentId}
        FROM eligible WHERE NOT EXISTS (SELECT 1 FROM existing_constituent)
          AND NOT EXISTS (SELECT 1 FROM existing_task)
        RETURNING id
      ), local_constituent AS (
        SELECT id FROM existing_constituent UNION ALL SELECT id FROM new_constituent
      ), inserted AS (
        INSERT INTO pending_actions (owner_user_id, entered_by_user_id, constituent_id,
          title, details, due_date, category, status, is_primary, needs_discussion,
          source_gift_id, source_gift_snapshot)
        SELECT ${owner.id}, ${actor.id}, (SELECT id FROM local_constituent),
          ${draft.title.trim()}, ${draft.details?.trim() || null}, ${draft.dueDate || null}::date,
          'Stewardship', 'Open', FALSE, FALSE, ${item.giftId}, ${JSON.stringify(snapshot)}::jsonb
        FROM eligible WHERE NOT EXISTS (SELECT 1 FROM existing_task)
        ON CONFLICT (owner_user_id, source_gift_id) WHERE source_gift_id IS NOT NULL DO NOTHING
        RETURNING *
      )
      SELECT id, owner_user_id, title, status, due_date, source_gift_snapshot, FALSE AS already_exists FROM inserted
      UNION ALL
      SELECT id, owner_user_id, title, status, due_date, source_gift_snapshot, TRUE AS already_exists FROM existing_task
      WHERE source_gift_snapshot->>'constituentId' = ${item.constituentId}
    `,
  ]);
  // Constituent-only linking keeps the reminder and its duplicate protection
  // intact even when someone removes a Top Prospect entry.
  return results[1]?.[0] || null;
}
