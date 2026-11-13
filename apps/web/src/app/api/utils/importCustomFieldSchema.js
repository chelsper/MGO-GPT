export default async function importCustomFieldSchema(db) {
  // Serialize first installation across independent serverless cold starts.
  await db`DO $import_custom_field_schema$
    BEGIN
      PERFORM pg_advisory_xact_lock(734019, 171);
      CREATE TABLE IF NOT EXISTS constituency_import_custom_field_claims (
        constituent_id TEXT NOT NULL,
        category_key TEXT NOT NULL,
        row_id BIGINT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (constituent_id, category_key)
      );
    END $import_custom_field_schema$`;
}
