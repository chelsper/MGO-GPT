export default async function stewardshipHistorySchema(db) {
  await db`
    DO $stewardship_history_schema$
    BEGIN
      PERFORM pg_advisory_xact_lock(734019,100);
      ALTER TABLE stewardship_gift_receipts ALTER COLUMN request_id DROP NOT NULL;
      ALTER TABLE stewardship_gift_receipts ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'app';
      ALTER TABLE stewardship_gift_receipts ADD COLUMN IF NOT EXISTS source_key TEXT;
      ALTER TABLE stewardship_gift_receipts ADD COLUMN IF NOT EXISTS source_snapshot JSONB;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='stewardship_gift_receipts'::regclass AND conname='stewardship_receipt_source_contract') THEN
        ALTER TABLE stewardship_gift_receipts ADD CONSTRAINT stewardship_receipt_source_contract CHECK (
          (source_kind='app' AND request_id IS NOT NULL AND source_key IS NULL) OR
          (source_kind='nxt_history' AND request_id IS NULL AND source_key IS NOT NULL AND source_key ~ '^[1-9][0-9]*:[A-Za-z0-9_-]{1,100}$' AND source_snapshot IS NOT NULL)
        );
      END IF;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stewardship_receipt_source ON stewardship_gift_receipts(source_key) WHERE source_key IS NOT NULL;
      CREATE TABLE IF NOT EXISTS stewardship_gift_import_state (
        id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL DEFAULT 1,
        config JSONB NOT NULL DEFAULT '{}', job JSONB, lease UUID, lease_until TIMESTAMPTZ
      );
      INSERT INTO stewardship_gift_import_state(id) VALUES(1) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS stewardship_gift_import_events (
        id BIGSERIAL PRIMARY KEY, actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        actor_name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        operation TEXT NOT NULL, snapshot JSONB NOT NULL
      );
    END $stewardship_history_schema$;
  `;
}
