export default async function stewardshipStockSchema(db) {
  await db`DO $stewardship_stock_schema$
    BEGIN
      PERFORM pg_advisory_xact_lock(734019,101);
      ALTER TABLE stewardship_gift_receipts ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity BETWEEN 0 AND 1000000);
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='stewardship_gift_receipts'::regclass AND conname='stewardship_history_no_stock') THEN
        ALTER TABLE stewardship_gift_receipts ADD CONSTRAINT stewardship_history_no_stock CHECK (source_kind<>'nxt_history' OR stock_quantity=0);
      END IF;
      CREATE TABLE IF NOT EXISTS stewardship_stock_movements (
        id BIGSERIAL PRIMARY KEY,
        item_id BIGINT NOT NULL REFERENCES stewardship_gift_items(id),
        kind TEXT NOT NULL CHECK (kind IN ('opening','restock','return','adjustment','fulfillment')),
        quantity INTEGER NOT NULL CHECK (quantity BETWEEN 0 AND 1000000),
        delta INTEGER NOT NULL,
        before_quantity INTEGER CHECK (before_quantity BETWEEN 0 AND 1000000),
        after_quantity INTEGER NOT NULL CHECK (after_quantity BETWEEN 0 AND 1000000),
        stock_version INTEGER NOT NULL CHECK (stock_version>0),
        reason TEXT NOT NULL CHECK (length(reason)<=1000),
        actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        actor_name TEXT NOT NULL,
        request_token UUID NOT NULL UNIQUE,
        receipt_id BIGINT UNIQUE REFERENCES stewardship_gift_receipts(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(item_id,stock_version),
        CHECK ((kind='opening' AND before_quantity IS NULL AND delta=after_quantity) OR
          (kind<>'opening' AND before_quantity IS NOT NULL AND before_quantity+delta=after_quantity)),
        CHECK ((kind='fulfillment' AND receipt_id IS NOT NULL AND delta=-quantity AND quantity>0) OR
          (kind<>'fulfillment' AND receipt_id IS NULL)),
        CHECK (kind NOT IN ('restock','return') OR (delta=quantity AND quantity>0)),
        CHECK (kind NOT IN ('opening','adjustment') OR after_quantity=quantity)
      );
    END $stewardship_stock_schema$`;
}
