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
      CREATE TABLE IF NOT EXISTS constituents (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        organization TEXT,
        email TEXT,
        phone TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS submissions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL,
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
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL
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
      CREATE TABLE IF NOT EXISTS prospect_pool (
        id BIGSERIAL PRIMARY KEY,
        assigned_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL,
        prospect_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        note TEXT,
        email TEXT,
        phone TEXT,
        needs_contact_info BOOLEAN NOT NULL DEFAULT FALSE,
        contact_info_request_note TEXT,
        solicitor_requested BOOLEAN NOT NULL DEFAULT FALSE,
        solicitor_requested_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS assigned_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS prospect_name TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS normalized_name TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS note TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS email TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS phone TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS needs_contact_info BOOLEAN NOT NULL DEFAULT FALSE
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS contact_info_request_note TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS solicitor_requested BOOLEAN NOT NULL DEFAULT FALSE
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS solicitor_requested_at TIMESTAMPTZ
    `;
    await sql`
      UPDATE prospect_pool
      SET normalized_name = LOWER(TRIM(COALESCE(prospect_name, '')))
      WHERE normalized_name IS NULL OR normalized_name = ''
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS prospects (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL,
        prospect_name TEXT NOT NULL,
        expected_close_fy TEXT NOT NULL,
        ask_amount NUMERIC,
        ask_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active',
        priority_order INTEGER NOT NULL DEFAULT 1,
        closed_amount NUMERIC,
        close_date DATE,
        decline_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE prospects
      ADD COLUMN IF NOT EXISTS constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE prospects
      ADD COLUMN IF NOT EXISTS next_action_text TEXT
    `;
    await sql`
      ALTER TABLE prospects
      ADD COLUMN IF NOT EXISTS next_action_due_date DATE
    `;
    await sql`
      ALTER TABLE prospects
      ADD COLUMN IF NOT EXISTS next_action_completed_at TIMESTAMPTZ
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS prospect_opportunities (
        id BIGSERIAL PRIMARY KEY,
        prospect_id BIGINT REFERENCES prospects(id) ON DELETE CASCADE,
        constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        current_stage TEXT NOT NULL,
        estimated_amount NUMERIC,
        latest_notes TEXT,
        last_submission_id BIGINT REFERENCES submissions(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS title TEXT
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS current_stage TEXT
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS estimated_amount NUMERIC
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS latest_notes TEXT
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS last_submission_id BIGINT REFERENCES submissions(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS opportunity_status TEXT NOT NULL DEFAULT 'Active'
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS closed_amount NUMERIC
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS close_date DATE
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS decline_reason TEXT
    `;

    await sql`
      UPDATE prospect_opportunities
      SET title = COALESCE(NULLIF(title, ''), 'Untitled opportunity')
      WHERE title IS NULL OR title = ''
    `;
    await sql`
      UPDATE prospect_opportunities
      SET current_stage = COALESCE(NULLIF(current_stage, ''), 'Identification')
      WHERE current_stage IS NULL OR current_stage = ''
    `;
    await sql`
      UPDATE prospect_opportunities
      SET opportunity_status = COALESCE(NULLIF(opportunity_status, ''), 'Active')
      WHERE opportunity_status IS NULL OR opportunity_status = ''
    `;

    await sql`
      ALTER TABLE prospect_opportunities
      ALTER COLUMN title SET NOT NULL
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ALTER COLUMN current_stage SET NOT NULL
    `;

    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS prospect_id BIGINT REFERENCES prospects(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS prospect_opportunity_id BIGINT REFERENCES prospect_opportunities(id) ON DELETE SET NULL
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS prospect_updates (
        id BIGSERIAL PRIMARY KEY,
        prospect_id BIGINT REFERENCES prospects(id) ON DELETE CASCADE,
        update_date DATE NOT NULL DEFAULT CURRENT_DATE,
        update_notes TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS blackbaud_connections (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_type TEXT,
        scope TEXT,
        expires_at TIMESTAMPTZ,
        connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE blackbaud_connections
      ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
    `;
    await sql`
      ALTER TABLE blackbaud_connections
      ADD COLUMN IF NOT EXISTS access_token TEXT
    `;
    await sql`
      ALTER TABLE blackbaud_connections
      ADD COLUMN IF NOT EXISTS refresh_token TEXT
    `;
    await sql`
      ALTER TABLE blackbaud_connections
      ADD COLUMN IF NOT EXISTS token_type TEXT
    `;
    await sql`
      ALTER TABLE blackbaud_connections
      ADD COLUMN IF NOT EXISTS scope TEXT
    `;
    await sql`
      ALTER TABLE blackbaud_connections
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE blackbaud_connections
      ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;
    await sql`
      ALTER TABLE blackbaud_connections
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS blackbaud_oauth_states (
        state TEXT PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        redirect_path TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `;

    await sql`
      ALTER TABLE blackbaud_oauth_states
      ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
    `;
    await sql`
      ALTER TABLE blackbaud_oauth_states
      ADD COLUMN IF NOT EXISTS redirect_path TEXT
    `;
    await sql`
      ALTER TABLE blackbaud_oauth_states
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;
    await sql`
      ALTER TABLE blackbaud_oauth_states
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ
    `;
    await sql`
      DELETE FROM blackbaud_oauth_states
      WHERE expires_at IS NOT NULL AND expires_at < NOW()
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
