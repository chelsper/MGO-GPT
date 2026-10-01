export default async function stewardshipGiftRequestsSchema(db) {
  await db`
    DO $stewardship_gift_requests_schema$
    BEGIN
      PERFORM pg_advisory_xact_lock(734019, 98);
      ALTER TABLE data_change_requests
        ADD COLUMN IF NOT EXISTS stewardship_gift_item_id BIGINT REFERENCES stewardship_gift_items(id),
        ADD COLUMN IF NOT EXISTS stewardship_gift_item_snapshot JSONB;
      ALTER TABLE stewardship_request_events
        ADD COLUMN IF NOT EXISTS gift_item_id BIGINT REFERENCES stewardship_gift_items(id),
        ADD COLUMN IF NOT EXISTS gift_item_snapshot JSONB;
    END $stewardship_gift_requests_schema$
  `;
}
