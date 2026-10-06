export default async function relationshipOriginatorSchema(db) {
  await db`DO $originator_schema$ BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('relationship-originator-v1'));
    CREATE TABLE IF NOT EXISTS relationship_originator_changes (
      id BIGSERIAL PRIMARY KEY,
      constituent_id TEXT NOT NULL,
      owner_user_id BIGINT NOT NULL REFERENCES users(id),
      entered_by_user_id BIGINT NOT NULL REFERENCES users(id),
      originator_name TEXT NOT NULL,
      origin_date TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      previous_fields JSONB NOT NULL,
      remote_field_id TEXT,
      state TEXT NOT NULL CHECK(state IN ('pending','review','confirmed','not_sent')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS relationship_originator_pending
      ON relationship_originator_changes(constituent_id) WHERE state IN ('pending','review');
    CREATE INDEX IF NOT EXISTS relationship_originator_history
      ON relationship_originator_changes(constituent_id,id);
    CREATE TABLE IF NOT EXISTS relationship_originator_refresh_locks (
      cache_key TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
    );
  END $originator_schema$`;
}
