export default async function campaignPrioritiesSchema(db) {
  await db`DO $campaign_schema$ BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('campaign-priorities-v1'));
    CREATE TABLE IF NOT EXISTS campaign_priority_state (
      id INTEGER PRIMARY KEY CHECK(id=1), version BIGINT NOT NULL DEFAULT 1,
      config JSONB NOT NULL DEFAULT '{}', published_run UUID, job JSONB,
      lease UUID, lease_until TIMESTAMPTZ
    );
    INSERT INTO campaign_priority_state(id) VALUES(1) ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS campaign_priority_runs (
      id UUID PRIMARY KEY, source_key TEXT NOT NULL, query_id TEXT NOT NULL,
      config JSONB NOT NULL, created_by BIGINT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('staging','complete','failed')),
      raw_rows INTEGER, unique_rows INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS campaign_priority_rows (
      run_id UUID NOT NULL REFERENCES campaign_priority_runs(id) ON DELETE CASCADE,
      item_key TEXT NOT NULL, gift_id TEXT NOT NULL, split_id TEXT, fund_id TEXT NOT NULL,
      fund_name TEXT NOT NULL, donor_name TEXT NOT NULL, gift_date TEXT NOT NULL, gift_type TEXT NOT NULL,
      amount_cents BIGINT NOT NULL, base_hash TEXT NOT NULL, row_hash TEXT NOT NULL,
      conflict BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY(run_id,item_key)
    );
    CREATE INDEX IF NOT EXISTS campaign_priority_row_fund ON campaign_priority_rows(run_id,fund_id);
    CREATE TABLE IF NOT EXISTS campaign_priority_funds (
      source_key TEXT NOT NULL, fund_id TEXT NOT NULL, priority TEXT NOT NULL,
      PRIMARY KEY(source_key,fund_id)
    );
    CREATE TABLE IF NOT EXISTS campaign_priority_overrides (
      source_key TEXT NOT NULL, item_key TEXT NOT NULL, priority TEXT, amount_cents BIGINT,
      base_hash TEXT NOT NULL, reason TEXT NOT NULL, updated_by BIGINT NOT NULL REFERENCES users(id),
      updated_by_name TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(source_key,item_key)
    );
    CREATE TABLE IF NOT EXISTS campaign_priority_events (
      id BIGSERIAL PRIMARY KEY, actor_id BIGINT NOT NULL REFERENCES users(id), actor_name TEXT NOT NULL,
      operation TEXT NOT NULL, source_key TEXT NOT NULL, item_key TEXT,
      reason TEXT NOT NULL, before_value JSONB, after_value JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS campaign_priority_events_item ON campaign_priority_events(source_key,item_key,id);
    IF to_regclass('campaign_priority_effective') IS NULL THEN
    CREATE VIEW campaign_priority_effective AS
    SELECT g.*, r.source_key, COALESCE(f.priority,'unassigned') AS fund_priority,
      CASE WHEN o.base_hash=g.base_hash THEN COALESCE(o.priority,f.priority,'unassigned') ELSE COALESCE(f.priority,'unassigned') END AS priority,
      CASE WHEN o.base_hash=g.base_hash THEN COALESCE(o.amount_cents,g.amount_cents) ELSE g.amount_cents END AS effective_cents,
      o.item_key IS NOT NULL AS has_override, (o.item_key IS NOT NULL AND o.base_hash<>g.base_hash) AS needs_review,
      o.priority AS override_priority,o.amount_cents AS override_cents,o.reason,o.updated_by_name,o.updated_at AS override_updated_at
    FROM campaign_priority_rows g JOIN campaign_priority_runs r ON r.id=g.run_id
      LEFT JOIN campaign_priority_funds f ON f.source_key=r.source_key AND f.fund_id=g.fund_id
      LEFT JOIN campaign_priority_overrides o ON o.source_key=r.source_key AND o.item_key=g.item_key;
    END IF;
  END $campaign_schema$`;
}
