export default async function stewardshipFulfillmentSchema(db) {
  await db`DO $stewardship_fulfillment_schema$
    BEGIN
      PERFORM pg_advisory_xact_lock(734019, 106);
      ALTER TABLE data_change_requests ADD COLUMN IF NOT EXISTS stewardship_fulfillment JSONB;
      ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS source_stewardship_request_id BIGINT REFERENCES data_change_requests(id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_actions_stewardship_origin
        ON pending_actions(source_stewardship_request_id) WHERE source_stewardship_request_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS stewardship_fulfillment_events (
        id BIGSERIAL PRIMARY KEY,
        request_id BIGINT NOT NULL REFERENCES data_change_requests(id),
        request_token UUID NOT NULL UNIQUE,
        command JSONB NOT NULL,
        summary JSONB NOT NULL,
        actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        actor_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_stewardship_fulfillment_request ON stewardship_fulfillment_events(request_id,id DESC);
      CREATE TABLE IF NOT EXISTS stewardship_fulfillment_notices (
        request_id BIGINT NOT NULL REFERENCES data_change_requests(id),
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        seen_version INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(request_id,user_id)
      );
    END $stewardship_fulfillment_schema$`;
}
