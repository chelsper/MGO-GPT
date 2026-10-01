import sql from "./sql";
import { canEditWorkspace, isReviewerRole } from "@/utils/workspaceRoles";
import { ASSISTANCE_TYPES, validGiftItemId } from "@/utils/stewardshipAssistance";

// Call only after authorizing the request/actor. Do not disclose storage or audit
// details to fundraisers; this is a choice list, not inventory administration.
export async function readAvailableStewardshipGifts(db = sql) {
  return db`SELECT id::text,name,description FROM stewardship_gift_items
    WHERE archived_at IS NULL AND availability='available' ORDER BY lower(name),id`;
}

export async function readTaskAssistance(context, id, db = sql) {
  if (!canEditWorkspace(context)) return null;
  const [row] = await db`
    SELECT pa.id, pa.status, pa.updated_at::text AS updated_at, pa.source_gift_snapshot,
      CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', r.id::text, 'request_type', r.request_type, 'request_note', r.request_note,
        'needed_by', r.needed_by, 'status', r.status, 'reviewer_notes', r.reviewer_notes,
        'created_at', r.created_at, 'request_version', r.request_version,
        'stewardship_gift_item_id', r.stewardship_gift_item_id::text,
        'stewardship_gift_item_snapshot', r.stewardship_gift_item_snapshot,
        'stewardship_received_item', (SELECT jsonb_build_object('id',d.id::text,'received_on',d.received_on::text,
          'item_snapshot',d.item_snapshot,'recorded_by_name',d.recorded_by_name)
          FROM stewardship_gift_receipts d WHERE d.request_id=r.id AND d.voided_at IS NULL)) END AS request
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
  if (!validGiftItemId(draft.giftItemId ?? null) || (draft.type !== "gift" && draft.giftItemId != null)) return null;
  const { sessionUser: actor, workspaceUser: owner } = context;
  // Serialize retries and recheck permissions/task version after locks. The
  // request lives in the existing Work Queue, not in a second stewardship queue.
  const result = await db.transaction([
    db`SELECT pg_advisory_xact_lock(734019,97)`,
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
           blackbaud_constituent_id, source_gift_snapshot, request_type, request_note, needed_by, source_context, status,
           stewardship_gift_item_id, stewardship_gift_item_snapshot)
        SELECT e.id, e.owner_user_id, ${actor.id}, e.source_gift_snapshot->>'constituentName',
          e.source_gift_snapshot->>'constituentId', e.source_gift_snapshot,
          ${`Stewardship: ${ASSISTANCE_TYPES[draft.type]}`}, ${draft.instructions}, ${draft.neededBy}::date, 'stewardship', 'Open',
          gift.id, CASE WHEN gift.id IS NULL THEN NULL ELSE jsonb_build_object('id',gift.id::text,'name',gift.name,'description',gift.description,'version',gift.version) END
        FROM eligible e LEFT JOIN stewardship_gift_items gift ON gift.id=${draft.giftItemId ?? null}::bigint
          AND gift.archived_at IS NULL AND gift.availability='available'
        WHERE e.status = 'Open' AND e.updated_at = ${draft.expectedUpdatedAt}::timestamptz
          AND (${draft.giftItemId ?? null}::bigint IS NULL OR gift.id IS NOT NULL)
        ON CONFLICT (source_pending_action_id) WHERE source_pending_action_id IS NOT NULL DO NOTHING RETURNING *
      ), audited AS (
        INSERT INTO stewardship_request_events(request_id, actor_user_id, actor_name, status, note, version, gift_item_id, gift_item_snapshot)
        SELECT i.id, ${actor.id}, e.requester_name, i.status, 'Request submitted', i.request_version, i.stewardship_gift_item_id, i.stewardship_gift_item_snapshot
        FROM inserted i JOIN eligible e ON e.id = i.source_pending_action_id RETURNING id
      )
      SELECT id::text, FALSE AS already_exists FROM inserted
      UNION ALL
      SELECT r.id::text, TRUE AS already_exists FROM data_change_requests r
      JOIN eligible e ON r.source_pending_action_id = e.id AND r.owner_user_id = e.owner_user_id
      WHERE NOT EXISTS (SELECT 1 FROM inserted)
    `,
  ]);
  return result.at(-1)?.[0] || null;
}

export async function updateAssistance(actor, id, draft, db = sql) {
  if (!actor?.id || actor.active === false || !isReviewerRole(actor.role)) return null;
  const changesGift = Object.hasOwn(draft, "giftItemId");
  if (changesGift && !validGiftItemId(draft.giftItemId)) return null;
  const result = await db.transaction([
    db`SELECT pg_advisory_xact_lock(734019,97)`,
    db`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`,
    db`
      WITH choice AS MATERIALIZED (
        SELECT id,jsonb_build_object('id',id::text,'name',name,'description',description,'version',version) AS snapshot
        FROM stewardship_gift_items WHERE id=${draft.giftItemId ?? null}::bigint
          AND archived_at IS NULL AND availability='available'
      ), updated AS (
        UPDATE data_change_requests r
        SET status = ${draft.status}, reviewer_notes = ${draft.note},
          request_version = r.request_version + 1, updated_at = NOW(),
          reviewed_by = ${actor.id}, reviewed_at = NOW(),
          stewardship_gift_item_id = CASE WHEN ${changesGift} THEN ${draft.giftItemId ?? null}::bigint ELSE r.stewardship_gift_item_id END,
          stewardship_gift_item_snapshot = CASE
            WHEN NOT ${changesGift} OR r.stewardship_gift_item_id IS NOT DISTINCT FROM ${draft.giftItemId ?? null}::bigint THEN r.stewardship_gift_item_snapshot
            WHEN ${draft.giftItemId ?? null}::bigint IS NULL THEN NULL
            ELSE (SELECT snapshot FROM choice) END
        FROM users actor WHERE r.id = ${id} AND r.request_version = ${draft.version}
          AND r.source_pending_action_id IS NOT NULL
          AND actor.id = ${actor.id} AND actor.role = ${actor.role} AND actor.active IS NOT FALSE
          AND (NOT ${changesGift} OR r.stewardship_gift_item_id IS NOT DISTINCT FROM ${draft.giftItemId ?? null}::bigint
            OR NOT EXISTS(SELECT 1 FROM stewardship_gift_receipts d WHERE d.request_id=r.id AND d.voided_at IS NULL))
          AND (NOT ${changesGift} OR (r.request_type='Stewardship: Personal gift' AND (
            r.stewardship_gift_item_id IS NOT DISTINCT FROM ${draft.giftItemId ?? null}::bigint OR
            (r.status IN ('Open','In Progress') AND (${draft.giftItemId ?? null}::bigint IS NULL OR EXISTS(SELECT 1 FROM choice)))
          )))
        RETURNING r.*, actor.name AS reviewed_by_name
      ), audited AS (
        INSERT INTO stewardship_request_events(request_id, actor_user_id, actor_name, status, note, version, gift_item_id, gift_item_snapshot)
        SELECT id, ${actor.id}, reviewed_by_name, status, reviewer_notes, request_version, stewardship_gift_item_id, stewardship_gift_item_snapshot FROM updated RETURNING id
      )
      SELECT * FROM updated
    `,
  ]);
  return result.at(-1)?.[0] || null;
}
