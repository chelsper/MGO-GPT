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
    CREATE INDEX IF NOT EXISTS campaign_priority_row_gift ON campaign_priority_rows(run_id,gift_id);
    ALTER TABLE campaign_priority_rows ADD COLUMN IF NOT EXISTS write_off_cents BIGINT;
    ALTER TABLE campaign_priority_rows ADD COLUMN IF NOT EXISTS pledge_balance_cents BIGINT;
    ALTER TABLE campaign_priority_rows ADD COLUMN IF NOT EXISTS is_investment BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS campaign_priority_pledge_checks (
      run_id UUID NOT NULL REFERENCES campaign_priority_runs(id) ON DELETE CASCADE,
      gift_id TEXT NOT NULL,stage TEXT NOT NULL DEFAULT 'gift',draft JSONB NOT NULL DEFAULT '{}',
      result JSONB,checked_at TIMESTAMPTZ,PRIMARY KEY(run_id,gift_id)
    );
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
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
      AND table_name='campaign_priority_effective' AND column_name='is_investment') THEN
    CREATE OR REPLACE VIEW campaign_priority_effective AS
    SELECT g.run_id,g.item_key,g.gift_id,g.split_id,g.fund_id,g.fund_name,g.donor_name,g.gift_date,g.gift_type,
      g.amount_cents,g.base_hash,g.row_hash,g.conflict, r.source_key, COALESCE(f.priority,'unassigned') AS fund_priority,
      CASE WHEN o.base_hash=g.base_hash THEN COALESCE(o.priority,f.priority,'unassigned') ELSE COALESCE(f.priority,'unassigned') END AS priority,
      calculated.effective_cents,
      o.item_key IS NOT NULL AS has_override, (o.item_key IS NOT NULL AND o.base_hash<>g.base_hash) AS needs_review,
      o.priority AS override_priority,o.amount_cents AS override_cents,o.reason,o.updated_by_name,o.updated_at AS override_updated_at,
      g.write_off_cents,g.pledge_balance_cents,net.net_cents,
      CASE WHEN g.write_off_cents IS NOT NULL AND g.pledge_balance_cents IS NOT NULL
        THEN calculated.effective_cents-g.pledge_balance_cents END AS received_cents,g.is_investment
    FROM campaign_priority_rows g JOIN campaign_priority_runs r ON r.id=g.run_id
      LEFT JOIN campaign_priority_funds f ON f.source_key=r.source_key AND f.fund_id=g.fund_id
      LEFT JOIN campaign_priority_overrides o ON o.source_key=r.source_key AND o.item_key=g.item_key
      CROSS JOIN LATERAL (SELECT g.amount_cents-COALESCE(g.write_off_cents,0) AS net_cents) net
      CROSS JOIN LATERAL (SELECT CASE WHEN o.base_hash=g.base_hash THEN COALESCE(o.amount_cents,net.net_cents)
        ELSE net.net_cents END AS effective_cents) calculated;
    END IF;
  END $campaign_schema$`;
}
