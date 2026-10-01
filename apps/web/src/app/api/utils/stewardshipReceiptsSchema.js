export default async function stewardshipReceiptsSchema(db) {
  await db`
    DO $stewardship_receipts_schema$
    BEGIN
      PERFORM pg_advisory_xact_lock(734019, 99);
      CREATE TABLE IF NOT EXISTS stewardship_gift_receipts (
        id BIGSERIAL PRIMARY KEY,
        request_id BIGINT NOT NULL REFERENCES data_change_requests(id),
        item_id BIGINT NOT NULL REFERENCES stewardship_gift_items(id),
        item_snapshot JSONB NOT NULL,
        constituent_id TEXT NOT NULL CHECK (constituent_id ~ '^[1-9][0-9]*$'),
        constituent_name TEXT NOT NULL,
        owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        owner_name TEXT NOT NULL,
        received_on DATE NOT NULL,
        note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
        request_token UUID NOT NULL UNIQUE,
        recorded_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        recorded_by_name TEXT NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        voided_at TIMESTAMPTZ,
        voided_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        voided_by_name TEXT,
        void_reason TEXT CHECK (length(void_reason) BETWEEN 1 AND 1000)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stewardship_receipt_active_request
        ON stewardship_gift_receipts(request_id) WHERE voided_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_stewardship_receipt_item ON stewardship_gift_receipts(item_id,id DESC);
      CREATE INDEX IF NOT EXISTS idx_stewardship_receipt_constituent ON stewardship_gift_receipts(constituent_id,id DESC);
      CREATE INDEX IF NOT EXISTS idx_stewardship_receipt_owner ON stewardship_gift_receipts(owner_user_id,id DESC);
    END $stewardship_receipts_schema$;
  `;
}
