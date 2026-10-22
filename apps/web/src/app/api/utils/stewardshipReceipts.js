import sql from "./sql";
import { isMgoRole, isReviewerRole } from "@/utils/workspaceRoles";
import { receiptCommand } from "@/utils/stewardshipReceipts";

export async function readGiftReceipts(actor, filters, db = sql) {
  if (
    !actor?.id ||
    actor.active === false ||
    (!isReviewerRole(actor.role) && !isMgoRole(actor.role))
  )
    return [];
  return db`
    SELECT d.id::text,d.request_id::text,d.item_id::text,d.item_snapshot,
      d.constituent_id,d.constituent_name,d.owner_name,d.received_on::text,d.note,
      d.recorded_by_name,d.recorded_at,d.voided_at,d.voided_by_name,d.void_reason,r.request_version,
      d.source_kind,d.source_snapshot,d.stock_quantity
    FROM stewardship_gift_receipts d
    LEFT JOIN data_change_requests r ON r.id=d.request_id
    JOIN users actor ON actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
    WHERE (${isReviewerRole(actor.role)} OR d.owner_user_id=actor.id)
      AND (${filters.includeVoided} OR d.voided_at IS NULL)
      AND (${filters.itemId}::bigint IS NULL OR d.item_id=${filters.itemId}::bigint)
      AND (${filters.constituentId}::text IS NULL OR d.constituent_id=${filters.constituentId})
      AND (${filters.requestId}::bigint IS NULL OR d.request_id=${filters.requestId}::bigint)
      AND (${filters.before}::bigint IS NULL OR d.id<${filters.before}::bigint)
      AND strpos(lower(concat_ws(' ',d.constituent_name,d.constituent_id,d.item_snapshot->>'name',d.owner_name)),lower(${filters.search}))>0
    ORDER BY d.id DESC LIMIT 51
  `;
}

export async function writeGiftReceipt(actor, input, db = sql) {
  const command = receiptCommand(input);
  if (
    !command ||
    !actor?.id ||
    actor.active === false ||
    !isReviewerRole(actor.role) ||
    command.viewerKey !== String(actor.id)
  )
    return null;
  if (command.operation === "void_imported") {
    const result = await db.transaction([
      db`SELECT pg_advisory_xact_lock(734019,97)`,
      db`SELECT id FROM users WHERE id=${actor.id} FOR UPDATE`,
      db`WITH changed AS (
        UPDATE stewardship_gift_receipts d SET voided_at=NOW(),voided_by=${actor.id},voided_by_name=actor.name,void_reason=${command.reason}
        FROM users actor WHERE d.id=${command.id} AND d.source_kind='nxt_history' AND d.voided_at IS NULL
          AND actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE RETURNING d.*
      ), audited AS (
        INSERT INTO stewardship_gift_import_events(actor_id,actor_name,operation,snapshot)
        SELECT ${actor.id},${actor.name},'correction',jsonb_build_object('receiptId',id,'reason',void_reason,'sourceKey',source_key) FROM changed RETURNING id
      ) SELECT id::text,voided_at FROM changed`,
    ]);
    return result.at(-1)?.[0] || null;
  }
  // Same lock order as gift selection/catalog edits; request versions protect
  // receipt creation from concurrent preference changes and reviewer updates.
  const record = command.operation === "record";
  const result = await db.transaction([
    db`SELECT pg_advisory_xact_lock(734019,97)`,
    db`SELECT id FROM users WHERE id=${actor.id} FOR UPDATE`,
    db`SELECT id FROM data_change_requests WHERE id=${command.requestId} FOR UPDATE`,
    record
      ? db`
      WITH eligible AS MATERIALIZED (
        SELECT r.*,actor.name AS actor_name,COALESCE(owner.name,'Former fundraiser') AS owner_name,gift.on_hand AS stock_on_hand
        FROM data_change_requests r
        JOIN users actor ON actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
        LEFT JOIN users owner ON owner.id=r.owner_user_id
        LEFT JOIN stewardship_gift_items gift ON gift.id=r.stewardship_gift_item_id
        WHERE r.id=${command.requestId} AND r.source_pending_action_id IS NOT NULL
          AND r.request_type='Stewardship: Personal gift'
      ), inserted AS (
        INSERT INTO stewardship_gift_receipts(request_id,item_id,item_snapshot,constituent_id,constituent_name,
          owner_user_id,owner_name,received_on,note,request_token,recorded_by,recorded_by_name,stock_quantity)
        SELECT id,stewardship_gift_item_id,stewardship_gift_item_snapshot,blackbaud_constituent_id,constituent_name,
          owner_user_id,owner_name,${command.receivedOn}::date,${command.note},${command.token}::uuid,${actor.id},actor_name,${command.stockQuantity}
        FROM eligible WHERE request_version=${command.version} AND status IN ('Open','In Progress','Completed')
          AND stewardship_gift_item_id=${command.itemId}::bigint
          AND stewardship_gift_item_snapshot->>'name' IS NOT NULL
          AND blackbaud_constituent_id ~ '^[1-9][0-9]*$'
          AND ${command.receivedOn}::date<=(NOW() AT TIME ZONE 'America/New_York')::date
          AND (${command.stockQuantity}=0 OR stock_on_hand>=${command.stockQuantity})
          AND NOT EXISTS (SELECT 1 FROM stewardship_gift_receipts WHERE request_id=${command.requestId} AND voided_at IS NULL)
        ON CONFLICT DO NOTHING RETURNING *
    ), changed_stock AS (
        UPDATE stewardship_gift_items i SET on_hand=i.on_hand-d.stock_quantity,stock_version=i.stock_version+1,stock_updated_at=NOW()
        FROM inserted d WHERE i.id=d.item_id AND d.stock_quantity>0 RETURNING i.*
      ), stock_audit AS (
        INSERT INTO stewardship_stock_movements(item_id,kind,quantity,delta,before_quantity,after_quantity,stock_version,reason,actor_id,actor_name,request_token,receipt_id)
        SELECT i.id,'fulfillment',d.stock_quantity,-d.stock_quantity,i.on_hand+d.stock_quantity,i.on_hand,i.stock_version,
          'New gift receipt #' || d.id,${actor.id},d.recorded_by_name,d.request_token,d.id
        FROM changed_stock i JOIN inserted d ON d.item_id=i.id RETURNING id
      ), changed AS (
        UPDATE data_change_requests r SET request_version=r.request_version+1,updated_at=NOW()
        FROM inserted d WHERE r.id=d.request_id RETURNING r.*
      ), audited AS (
        INSERT INTO stewardship_request_events(request_id,actor_user_id,actor_name,status,note,version,gift_item_id,gift_item_snapshot)
        SELECT r.id,${actor.id},d.recorded_by_name,r.status,'Received item recorded (#' || d.id || ') on ' || d.received_on || '. ' || d.note,
          r.request_version,d.item_id,d.item_snapshot FROM changed r JOIN inserted d ON d.request_id=r.id RETURNING id
      )
      SELECT d.id::text,d.request_id::text,d.received_on::text,d.item_snapshot,d.recorded_by_name,d.voided_at,r.request_version
        FROM inserted d JOIN changed r ON r.id=d.request_id
      UNION ALL
      SELECT d.id::text,d.request_id::text,d.received_on::text,d.item_snapshot,d.recorded_by_name,d.voided_at,r.request_version
        FROM stewardship_gift_receipts d JOIN eligible r ON r.id=d.request_id
        WHERE d.request_token=${command.token}::uuid AND d.recorded_by=${actor.id}
          AND d.item_id=${command.itemId}::bigint AND d.received_on=${command.receivedOn}::date AND d.note=${command.note} AND d.stock_quantity=${command.stockQuantity}
          AND NOT EXISTS(SELECT 1 FROM inserted)
    `
      : db`
      WITH changed_receipt AS (
        UPDATE stewardship_gift_receipts d
        SET voided_at=NOW(),voided_by=${actor.id},voided_by_name=actor.name,void_reason=${command.reason}
        FROM data_change_requests r,users actor
        WHERE d.id=${command.id} AND d.request_id=${command.requestId} AND d.voided_at IS NULL
          AND r.id=d.request_id AND r.request_version=${command.version}
          AND actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
        RETURNING d.*
      ), changed AS (
        UPDATE data_change_requests r SET request_version=r.request_version+1,updated_at=NOW()
        FROM changed_receipt d WHERE r.id=d.request_id RETURNING r.*
      ), audited AS (
        INSERT INTO stewardship_request_events(request_id,actor_user_id,actor_name,status,note,version,gift_item_id,gift_item_snapshot)
        SELECT r.id,${actor.id},d.voided_by_name,r.status,'Received item record voided (#' || d.id || '): ' || d.void_reason,
          r.request_version,d.item_id,d.item_snapshot FROM changed r JOIN changed_receipt d ON d.request_id=r.id RETURNING id
      )
      SELECT d.id::text,d.request_id::text,d.received_on::text,d.item_snapshot,d.recorded_by_name,d.voided_at,r.request_version
        FROM changed_receipt d JOIN changed r ON r.id=d.request_id
    `,
  ]);
  return result.at(-1)?.[0] || null;
}
