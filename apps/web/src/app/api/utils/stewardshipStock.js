import sql from "./sql";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { receiptId } from "@/utils/stewardshipReceipts";
import { stockCommand, STOCK_LIMIT } from "@/utils/stewardshipStock";
const allowed = actor => actor?.id && actor.active !== false && isReviewerRole(actor.role);

export async function readGiftStockHistory(actor, id, db = sql) {
  if (!allowed(actor) || !receiptId(id)) return null;
  return db`SELECT m.id::text,m.kind,m.quantity,m.delta,m.before_quantity,m.after_quantity,m.reason,m.actor_name,m.created_at,m.receipt_id::text
    FROM stewardship_stock_movements m JOIN users actor ON actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
    WHERE m.item_id=${id} ORDER BY m.id DESC LIMIT 50`;
}

export async function writeGiftStock(actor, body, db = sql) {
  const command = stockCommand(body);
  if (!allowed(actor) || !command) return null;
  const result = await db.transaction([
    db`SELECT pg_advisory_xact_lock(734019,97)`,
    db`SELECT id FROM users WHERE id=${actor.id} FOR UPDATE`,
    db`WITH eligible AS MATERIALIZED (
      SELECT i.*,actor.name AS actor_name,
        CASE WHEN ${command.kind} IN ('opening','adjustment') THEN ${command.quantity} ELSE i.on_hand+${command.quantity} END AS balance
      FROM stewardship_gift_items i JOIN users actor ON actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
      WHERE i.id=${command.id} AND i.stock_version=${command.stockVersion} AND i.archived_at IS NULL
        AND ((${command.kind}='opening' AND i.on_hand IS NULL) OR (${command.kind}<>'opening' AND i.on_hand IS NOT NULL))
        AND NOT EXISTS (SELECT 1 FROM stewardship_stock_movements WHERE request_token=${command.token}::uuid)
    ), changed AS (
      UPDATE stewardship_gift_items i SET on_hand=e.balance,stock_version=i.stock_version+1,stock_updated_at=NOW()
      FROM eligible e WHERE i.id=e.id AND e.balance BETWEEN 0 AND ${STOCK_LIMIT}
      RETURNING i.*
    ), audited AS (
      INSERT INTO stewardship_stock_movements(item_id,kind,quantity,delta,before_quantity,after_quantity,stock_version,reason,actor_id,actor_name,request_token)
      SELECT i.id,${command.kind},${command.quantity},i.on_hand-COALESCE(e.on_hand,0),e.on_hand,i.on_hand,i.stock_version,
        ${command.reason},${actor.id},e.actor_name,${command.token}::uuid
      FROM changed i JOIN eligible e ON e.id=i.id RETURNING id
    ) SELECT * FROM changed
      UNION ALL
      SELECT i.* FROM stewardship_gift_items i JOIN stewardship_stock_movements m ON m.item_id=i.id
      JOIN users actor ON actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
      WHERE m.request_token=${command.token}::uuid AND m.actor_id=actor.id AND m.item_id=${command.id}
        AND m.kind=${command.kind} AND m.quantity=${command.quantity} AND m.reason=${command.reason}
        AND NOT EXISTS (SELECT 1 FROM changed)`,
  ]);
  return result.at(-1);
}
