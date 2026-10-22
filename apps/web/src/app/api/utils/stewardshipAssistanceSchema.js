export default async function stewardshipAssistanceSchema(db) {
  await db`
    DO $stewardship_assistance_schema$
    BEGIN
      PERFORM pg_advisory_xact_lock(734019, 81);
      ALTER TABLE data_change_requests
        ADD COLUMN IF NOT EXISTS source_pending_action_id BIGINT,
        ADD COLUMN IF NOT EXISTS source_gift_snapshot JSONB,
        ADD COLUMN IF NOT EXISTS needed_by DATE,
        ADD COLUMN IF NOT EXISTS request_version INTEGER NOT NULL DEFAULT 1;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_data_requests_stewardship_origin
        ON data_change_requests(source_pending_action_id) WHERE source_pending_action_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS stewardship_request_events (
        id BIGSERIAL PRIMARY KEY,
        request_id BIGINT NOT NULL REFERENCES data_change_requests(id),
        actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        actor_name TEXT NOT NULL,
        status TEXT NOT NULL,
        note TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(request_id, version)
      );
    END $stewardship_assistance_schema$
  `;
}
