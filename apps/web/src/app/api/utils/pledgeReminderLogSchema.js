export default async function pledgeReminderLogSchema(db) {
  await db`DO $pledge_reminder_log_schema$
  BEGIN
    PERFORM pg_advisory_xact_lock(734019, 131);
    CREATE TABLE IF NOT EXISTS pledge_reminder_snapshots (
      id UUID PRIMARY KEY, owner_id BIGINT NOT NULL REFERENCES users(id), origin TEXT NOT NULL,
      event_key TEXT NOT NULL, snapshot_hash TEXT NOT NULL, snapshot JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(owner_id, origin, event_key, snapshot_hash)
    );
    CREATE TABLE IF NOT EXISTS pledge_reminder_logs (
      id UUID PRIMARY KEY, snapshot_id UUID NOT NULL REFERENCES pledge_reminder_snapshots(id),
      owner_id BIGINT NOT NULL REFERENCES users(id), origin TEXT NOT NULL,
      event_key TEXT NOT NULL UNIQUE, pledge_id TEXT NOT NULL, constituent_id TEXT NOT NULL,
      sent_date DATE NOT NULL, payload JSONB NOT NULL,
      state TEXT NOT NULL DEFAULT 'processing' CHECK(state IN ('processing','review','saved')),
      action_id TEXT, verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(origin, pledge_id, sent_date)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS pledge_reminder_unresolved
      ON pledge_reminder_logs(origin, pledge_id) WHERE state IN ('processing','review');
    CREATE INDEX IF NOT EXISTS pledge_reminder_snapshots_owner
      ON pledge_reminder_snapshots(owner_id, origin, created_at DESC);
  END $pledge_reminder_log_schema$`;
}
