import sql from "./sql";
import { isMgoRole, isReviewerRole } from "@/utils/workspaceRoles";
import { fulfillmentCommand } from "@/utils/stewardshipFulfillment";

const allowed = (actor) =>
  actor?.id &&
  actor.active !== false &&
  (isReviewerRole(actor.role) || isMgoRole(actor.role));

export async function readFulfillmentRequest(actor, id, db = sql) {
  if (!allowed(actor)) return null;
  const [row] =
    await db`SELECT r.*, ${String(actor.id)}::text AS request_viewer_id,
    (SELECT p.status FROM pending_actions p WHERE p.source_stewardship_request_id=r.id AND p.owner_user_id=r.owner_user_id) AS stewardship_follow_up_status,
    (SELECT jsonb_build_object('id',d.id::text,'received_on',d.received_on::text,'item_snapshot',d.item_snapshot,
      'recorded_by_name',d.recorded_by_name) FROM stewardship_gift_receipts d WHERE d.request_id=r.id AND d.voided_at IS NULL) AS stewardship_received_item,
    EXISTS(SELECT 1 FROM stewardship_fulfillment_notices n WHERE n.request_id=r.id AND n.user_id=actor.id AND n.version>n.seen_version) AS fulfillment_unread
    FROM data_change_requests r JOIN users actor ON actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
    WHERE r.id=${id} AND (r.source_pending_action_id IS NOT NULL OR r.stewardship_request_key IS NOT NULL)
      AND (${isReviewerRole(actor.role)} OR r.owner_user_id=actor.id OR r.requester_user_id=actor.id)`;
  return row || null;
}

export async function acknowledgeFulfillment(actor, id, version, db = sql) {
  if (!allowed(actor)) return null;
  const [row] =
    await db`UPDATE stewardship_fulfillment_notices n SET seen_version=GREATEST(n.seen_version,${version})
    FROM users actor,data_change_requests r WHERE n.user_id=${actor.id} AND n.request_id=${id} AND n.version=${version}
      AND actor.id=n.user_id AND actor.role=${actor.role} AND actor.active IS NOT FALSE
      AND r.id=n.request_id AND (r.owner_user_id=actor.id OR r.requester_user_id=actor.id) RETURNING n.request_id`;
  return row || null;
}

// No provider calls in this transaction. Receipt, stock, request, notices, and
// optional non-primary next step either all commit or all roll back.
export async function saveFulfillment(
  actor,
  body,
  verifiedAction = null,
  db = sql,
) {
  if (!allowed(actor) || !isReviewerRole(actor.role)) return null;
  const c = fulfillmentCommand(body);
  if (
    c.viewerKey !== String(actor.id) ||
    (c.actionId &&
      (verifiedAction?.actionId !== c.actionId ||
        verifiedAction?.date !== c.date))
  )
    return null;
  const result = await db.transaction([
    db`SELECT pg_advisory_xact_lock(734019,97)`,
    db`SELECT id FROM users WHERE id=${actor.id} OR id IN
      (SELECT owner_user_id FROM data_change_requests WHERE id=${c.requestId}) ORDER BY id FOR UPDATE`,
    db`SELECT id FROM data_change_requests WHERE id=${c.requestId} FOR UPDATE`,
    db`WITH authorized AS MATERIALIZED (
      SELECT r.*,actor.name AS actor_name,COALESCE(owner.name,'Former fundraiser') AS owner_name,
        owner.active IS NOT FALSE AND owner.id IS NOT NULL AS owner_available,
        gift.on_hand,receipt.id AS existing_receipt,receipt.received_on AS existing_date,receipt.item_id AS existing_item,
        EXISTS(SELECT 1 FROM stewardship_gift_receipts old WHERE old.request_id=r.id
          AND old.id::text=r.stewardship_fulfillment->>'receiptId' AND old.voided_at IS NOT NULL) AS receipt_was_voided
      FROM data_change_requests r
      JOIN users actor ON actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
      LEFT JOIN users owner ON owner.id=r.owner_user_id
      LEFT JOIN stewardship_gift_items gift ON gift.id=r.stewardship_gift_item_id
      LEFT JOIN stewardship_gift_receipts receipt ON receipt.request_id=r.id AND receipt.voided_at IS NULL
      WHERE r.id=${c.requestId} AND (r.source_pending_action_id IS NOT NULL OR r.stewardship_request_key IS NOT NULL)
    ), eligible AS MATERIALIZED (
      SELECT * FROM authorized r WHERE request_version=${c.version} AND status IN ('Open','In Progress','Completed')
        AND blackbaud_constituent_id ~ '^[1-9][0-9]*$'
        AND ${c.date}::date<=(NOW() AT TIME ZONE 'America/New_York')::date
        AND (stewardship_fulfillment IS NULL OR (
          (stewardship_fulfillment->>'stage'='prepared' AND ${c.stage} IN ('sent','received','completed')) OR
          (stewardship_fulfillment->>'stage'='sent' AND ${c.stage}='received') OR
          (status IN ('Open','In Progress') AND ${c.stage} IN ('sent','received','completed')
            AND (${c.stage}<>'received' OR existing_receipt IS NOT NULL OR receipt_was_voided)
            AND (stewardship_fulfillment->>'stage'=${c.stage}
              OR (stewardship_fulfillment->>'stage'='sent' AND ${c.stage}='completed'))) OR
          (stewardship_fulfillment->>'stage'='received' AND ${c.stage}='received' AND existing_receipt IS NULL AND receipt_was_voided) OR
          (stewardship_fulfillment->>'stage'=${c.stage} AND stewardship_fulfillment->>'actionId' IS NULL
            AND ${c.actionId}::text IS NOT NULL AND stewardship_fulfillment->>'date'=${c.date}
            AND stewardship_fulfillment->>'note'=${c.note} AND ${c.stockQuantity}=0 AND ${c.followUp !== null}=FALSE
            AND (stewardship_fulfillment->>'receiptId' IS NULL OR existing_receipt IS NOT NULL))))
        AND (stewardship_fulfillment IS NULL OR receipt_was_voided OR ${c.date}::date >= (stewardship_fulfillment->>'date')::date)
        AND stewardship_gift_item_id IS NOT DISTINCT FROM ${c.itemId}::bigint
        AND (${c.stage}<>'received' OR (request_type='Stewardship: Personal gift' AND stewardship_gift_item_id IS NOT NULL
          AND stewardship_gift_item_snapshot->>'name' IS NOT NULL))
        AND (${c.stage}<>'completed' OR request_type<>'Stewardship: Personal gift')
        AND (existing_receipt IS NULL OR (${c.stage}='received' AND existing_date=${c.date}::date
          AND existing_item=stewardship_gift_item_id AND ${c.stockQuantity}=0))
        AND (${c.stockQuantity}=0 OR (existing_receipt IS NULL AND on_hand>=${c.stockQuantity}))
        AND (${c.actionId}::text IS NULL OR (blackbaud_constituent_id=${verifiedAction?.constituentId || null}
          AND NOT EXISTS(SELECT 1 FROM stewardship_fulfillment_events e WHERE e.request_id<>r.id AND e.summary->>'actionId'=${c.actionId})))
        AND (stewardship_fulfillment->>'actionId' IS NULL OR ${c.actionId}::text IS NULL
          OR stewardship_fulfillment->>'actionId'=${c.actionId})
        AND (${c.followUp !== null}=FALSE OR (owner_available
          AND ${c.followUp?.date || null}::date >= (NOW() AT TIME ZONE 'America/New_York')::date
          AND NOT EXISTS(SELECT 1 FROM pending_actions p WHERE p.source_stewardship_request_id=r.id)))
        AND NOT EXISTS(SELECT 1 FROM stewardship_fulfillment_events e WHERE e.request_token=${c.token}::uuid)
    ), receipt AS (
      INSERT INTO stewardship_gift_receipts(request_id,item_id,item_snapshot,constituent_id,constituent_name,
        owner_user_id,owner_name,received_on,note,request_token,recorded_by,recorded_by_name,stock_quantity)
      SELECT id,stewardship_gift_item_id,stewardship_gift_item_snapshot,blackbaud_constituent_id,constituent_name,
        owner_user_id,owner_name,${c.date}::date,${c.note},${c.token}::uuid,${actor.id},actor_name,${c.stockQuantity}
      FROM eligible WHERE ${c.stage}='received' AND existing_receipt IS NULL RETURNING *
    ), stock AS (
      UPDATE stewardship_gift_items i SET on_hand=i.on_hand-d.stock_quantity,stock_version=i.stock_version+1,stock_updated_at=NOW()
      FROM receipt d WHERE i.id=d.item_id AND d.stock_quantity>0 RETURNING i.*
    ), stock_audit AS (
      INSERT INTO stewardship_stock_movements(item_id,kind,quantity,delta,before_quantity,after_quantity,stock_version,reason,actor_id,actor_name,request_token,receipt_id)
      SELECT i.id,'fulfillment',d.stock_quantity,-d.stock_quantity,i.on_hand+d.stock_quantity,i.on_hand,i.stock_version,
        'New gift receipt #' || d.id,${actor.id},d.recorded_by_name,d.request_token,d.id FROM stock i JOIN receipt d ON d.item_id=i.id RETURNING id
    ), follow_up AS (
      INSERT INTO pending_actions(owner_user_id,title,details,due_date,category,status,is_primary,entered_by_user_id,source_stewardship_request_id)
      SELECT owner_user_id,${c.followUp?.title || null},'Follow-up to stewardship request #' || id || '. ' || ${c.note},
        ${c.followUp?.date || null}::date,'Stewardship','Open',FALSE,${actor.id},id FROM eligible WHERE ${c.followUp !== null} RETURNING id,source_stewardship_request_id
    ), changed AS (
      UPDATE data_change_requests r SET status=${c.stage === "prepared" ? "In Progress" : "Completed"},
        reviewer_notes=${c.note},reviewed_by=${actor.id},reviewed_at=NOW(),updated_at=NOW(),request_version=r.request_version+1,
        stewardship_fulfillment=jsonb_build_object('stage',${c.stage}::text,'date',${c.date}::text,'note',${c.note}::text,
          'version',r.request_version+1,'actorName',e.actor_name,'receiptId',COALESCE((SELECT id::text FROM receipt),e.existing_receipt::text),
          'actionId',COALESCE(${c.actionId}::text,r.stewardship_fulfillment->>'actionId'),
          'actionNeedsReview',COALESCE((r.stewardship_fulfillment->>'actionNeedsReview')::boolean,FALSE)
            OR (r.stewardship_fulfillment->>'actionId' IS NOT NULL AND (e.receipt_was_voided
              OR r.stewardship_fulfillment->>'date'<>${c.date} OR r.stewardship_fulfillment->>'note'<>${c.note})),
          'actionVerifiedOn',CASE WHEN ${c.actionId}::text IS NOT NULL THEN NOW()::text ELSE r.stewardship_fulfillment->>'actionVerifiedOn' END,
          'followUpId',COALESCE((SELECT id::text FROM follow_up),r.stewardship_fulfillment->>'followUpId'))
      FROM eligible e WHERE r.id=e.id RETURNING r.*,e.actor_name
    ), events AS (
      INSERT INTO stewardship_fulfillment_events(request_id,request_token,command,summary,actor_id,actor_name)
      SELECT id,${c.token}::uuid,${JSON.stringify(c)}::jsonb,stewardship_fulfillment,${actor.id},actor_name FROM changed RETURNING id
    ), audit AS (
      INSERT INTO stewardship_request_events(request_id,actor_user_id,actor_name,status,note,version,gift_item_id,gift_item_snapshot)
      SELECT id,${actor.id},actor_name,status,${c.stage + ": " + c.note},request_version,stewardship_gift_item_id,stewardship_gift_item_snapshot FROM changed RETURNING id
    ), notices AS (
      INSERT INTO stewardship_fulfillment_notices(request_id,user_id,version)
      SELECT DISTINCT r.id,u.id,r.request_version FROM changed r JOIN users u
        ON u.id IN (r.owner_user_id,r.requester_user_id) AND u.active IS NOT FALSE
      ON CONFLICT(request_id,user_id) DO UPDATE SET version=EXCLUDED.version RETURNING request_id
    ) SELECT id::text FROM changed
      UNION ALL SELECT r.id::text FROM authorized r JOIN stewardship_fulfillment_events e ON e.request_id=r.id
        WHERE e.request_token=${c.token}::uuid AND e.actor_id=${actor.id} AND e.command=${JSON.stringify(c)}::jsonb
          AND NOT EXISTS(SELECT 1 FROM changed)`,
  ]);
  return result.at(-1)?.[0] || null;
}
