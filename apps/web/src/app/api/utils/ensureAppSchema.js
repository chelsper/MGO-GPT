import sql from "@/app/api/utils/sql";

let schemaReadyPromise;

export default async function ensureAppSchema() {
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'mgo',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS submissions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        officer_name TEXT,
        submission_type TEXT NOT NULL,
        donor_name TEXT,
        interaction_type TEXT,
        transcript TEXT,
        notes TEXT,
        next_step TEXT,
        estimated_ask_amount NUMERIC,
        opportunity_stage TEXT,
        estimated_amount NUMERIC,
        constituent_name TEXT,
        organization TEXT,
        email TEXT,
        phone TEXT,
        assign_to_me TEXT,
        business_card_url TEXT,
        attachments JSONB,
        status TEXT NOT NULL DEFAULT 'Pending',
        notification_email_status TEXT NOT NULL DEFAULT 'not_requested',
        notification_email_recipient TEXT,
        notification_email_id TEXT,
        notification_email_error TEXT,
        notification_email_sent_at TIMESTAMPTZ,
        reviewer_notes TEXT,
        reviewer_notes_updated_at TIMESTAMPTZ,
        reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        date_submitted TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS notification_email_status TEXT NOT NULL DEFAULT 'not_requested'
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS notification_email_recipient TEXT
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS notification_email_id TEXT
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS notification_email_error TEXT
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS notification_email_sent_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS reviewer_notes TEXT
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS reviewer_notes_updated_at TIMESTAMPTZ
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS list_requests (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        requester_name TEXT,
        date_needed DATE,
        purpose TEXT,
        purpose_other TEXT,
        output_type TEXT,
        excel_fields JSONB,
        excel_fields_other TEXT,
        who_included JSONB,
        who_included_other TEXT,
        giving_level TEXT,
        giving_level_custom NUMERIC,
        gift_timeframe TEXT,
        gift_timeframe_custom_start DATE,
        gift_timeframe_custom_end DATE,
        location_filter TEXT,
        location_state TEXT,
        location_city TEXT,
        location_zip TEXT,
        location_radius_address TEXT,
        location_radius_miles INTEGER,
        assigned_mgo TEXT,
        special_instructions TEXT,
        exclusions JSONB,
        exclusions_other TEXT,
        priority_level TEXT,
        status TEXT NOT NULL DEFAULT 'Pending',
        queue_priority INTEGER NOT NULL DEFAULT 3,
        reviewer_notes TEXT,
        reviewer_notes_updated_at TIMESTAMPTZ,
        reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE list_requests
      ADD COLUMN IF NOT EXISTS queue_priority INTEGER NOT NULL DEFAULT 3
    `;
    await sql`
      ALTER TABLE list_requests
      ADD COLUMN IF NOT EXISTS reviewer_notes TEXT
    `;
    await sql`
      ALTER TABLE list_requests
      ADD COLUMN IF NOT EXISTS reviewer_notes_updated_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE list_requests
      ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE list_requests
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_base_article_overrides (
        article_id TEXT PRIMARY KEY,
        title TEXT,
        summary TEXT,
        tags JSONB,
        sections JSONB,
        updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  })();

  return schemaReadyPromise;
}
