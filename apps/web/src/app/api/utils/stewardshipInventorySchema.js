export default async function stewardshipInventorySchema(db) {
  await db`
    DO $stewardship_inventory_schema$
    BEGIN
      PERFORM pg_advisory_xact_lock(734019, 96);
      CREATE TABLE IF NOT EXISTS stewardship_gift_items (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
        name_key TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
        location TEXT NOT NULL DEFAULT '' CHECK (length(location) <= 240),
        availability TEXT NOT NULL DEFAULT 'unknown' CHECK (availability IN ('unknown','available','unavailable')),
        source_key TEXT NOT NULL UNIQUE,
        source_label TEXT NOT NULL,
        archived_at TIMESTAMPTZ,
        archive_reason TEXT NOT NULL DEFAULT '' CHECK (length(archive_reason) <= 1000),
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS stewardship_gift_item_events (
        id BIGSERIAL PRIMARY KEY,
        item_id BIGINT NOT NULL REFERENCES stewardship_gift_items(id),
        actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        actor_name TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('create','import','update','archive','restore')),
        snapshot JSONB NOT NULL,
        version INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(item_id, version)
      );
    END $stewardship_inventory_schema$
  `;
}
