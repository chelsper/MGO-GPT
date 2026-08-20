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
        active BOOLEAN NOT NULL DEFAULT TRUE,
        deactivated_at TIMESTAMPTZ,
        blackbaud_constituent_id TEXT,
        blackbaud_lookup_id TEXT,
        blackbaud_fundraiser_alias_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        blackbaud_portfolio_seeded_at TIMESTAMPTZ,
        blackbaud_portfolio_seed_attempted_at TIMESTAMPTZ,
        blackbaud_portfolio_seed_error TEXT,
        blackbaud_portfolio_cache JSONB,
        blackbaud_portfolio_cache_key TEXT,
        blackbaud_portfolio_cached_at TIMESTAMPTZ,
        blackbaud_summary_cache JSONB,
        blackbaud_summary_cache_key TEXT,
        blackbaud_summary_cached_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE
    `;
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS blackbaud_constituent_id TEXT
    `;
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS blackbaud_lookup_id TEXT
    `;
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS blackbaud_fundraiser_alias_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    `;
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS blackbaud_portfolio_seeded_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS blackbaud_portfolio_seed_attempted_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS blackbaud_portfolio_seed_error TEXT
    `;
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS blackbaud_portfolio_cache JSONB
    `;
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS blackbaud_portfolio_cache_key TEXT
    `;
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS blackbaud_portfolio_cached_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS blackbaud_summary_cache JSONB
    `;
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS blackbaud_summary_cache_key TEXT
    `;
    await sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS blackbaud_summary_cached_at TIMESTAMPTZ
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS blackbaud_constituent_summary_cache (
        id BIGSERIAL PRIMARY KEY,
        workspace_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        auth_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cache_key TEXT NOT NULL,
        constituent_id TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_blackbaud_constituent_summary_cache_key
      ON blackbaud_constituent_summary_cache (workspace_user_id, auth_user_id, cache_key)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_blackbaud_constituent_summary_cache_updated_at
      ON blackbaud_constituent_summary_cache (updated_at)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS report_snapshots_cache (
        report_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_report_snapshots_cache_updated_at
      ON report_snapshots_cache (updated_at)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS user_invitations (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'mgo',
        blackbaud_constituent_id TEXT,
        blackbaud_lookup_id TEXT,
        blackbaud_name TEXT,
        invited_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        accepted_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE user_invitations
      ADD COLUMN IF NOT EXISTS blackbaud_constituent_id TEXT
    `;
    await sql`
      ALTER TABLE user_invitations
      ADD COLUMN IF NOT EXISTS blackbaud_lookup_id TEXT
    `;
    await sql`
      ALTER TABLE user_invitations
      ADD COLUMN IF NOT EXISTS blackbaud_name TEXT
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS constituents (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        blackbaud_constituent_id TEXT,
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
      ALTER TABLE constituents
      ADD COLUMN IF NOT EXISTS blackbaud_constituent_id TEXT
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
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS blackbaud_action_id TEXT
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS opportunity_title TEXT
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS ask_date DATE
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS expected_date DATE
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS joint_mgo_user_ids JSONB
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS blackbaud_sync_status TEXT NOT NULL DEFAULT 'not_requested'
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS blackbaud_sync_error TEXT
    `;
    await sql`
      ALTER TABLE submissions
      ADD COLUMN IF NOT EXISTS blackbaud_synced_at TIMESTAMPTZ
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
        requester_response TEXT,
        requester_response_updated_at TIMESTAMPTZ,
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
      ADD COLUMN IF NOT EXISTS requester_response TEXT
    `;
    await sql`
      ALTER TABLE list_requests
      ADD COLUMN IF NOT EXISTS requester_response_updated_at TIMESTAMPTZ
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
        solicitor_assignment_value NUMERIC(14, 2),
        solicitor_assignment_sync_state TEXT,
        solicitor_assignment_sync_error TEXT,
        solicitor_assignment_sync_attempted_at TIMESTAMPTZ,
        solicitor_assignment_synced_at TIMESTAMPTZ,
        solicitor_assignment_sync_debug JSONB,
        mgogpt_disposition_value TEXT,
        mgogpt_disposition_comment TEXT,
        mgogpt_disposition_updated_at TIMESTAMPTZ,
        mgogpt_disposition_sync_state TEXT,
        mgogpt_disposition_sync_error TEXT,
        mgogpt_disposition_sync_attempted_at TIMESTAMPTZ,
        mgogpt_disposition_synced_at TIMESTAMPTZ,
        mgogpt_disposition_sync_debug JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS data_change_requests (
        id BIGSERIAL PRIMARY KEY,
        requester_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        prospect_id BIGINT,
        prospect_pool_id BIGINT REFERENCES prospect_pool(id) ON DELETE SET NULL,
        constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL,
        blackbaud_constituent_id TEXT,
        constituent_name TEXT,
        request_type TEXT NOT NULL DEFAULT 'Record update',
        request_note TEXT,
        provided_data JSONB,
        source_context TEXT,
        status TEXT NOT NULL DEFAULT 'Open',
        reviewer_notes TEXT,
        reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS requester_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS prospect_id BIGINT
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS prospect_pool_id BIGINT REFERENCES prospect_pool(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS blackbaud_constituent_id TEXT
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS constituent_name TEXT
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'Record update'
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS request_note TEXT
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS provided_data JSONB
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS source_context TEXT
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Open'
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS reviewer_notes TEXT
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;
    await sql`
      ALTER TABLE data_change_requests
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      ADD COLUMN IF NOT EXISTS blackbaud_constituent_id TEXT
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
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS solicitor_assignment_value NUMERIC(14, 2)
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS solicitor_assignment_sync_state TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS solicitor_assignment_sync_error TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS solicitor_assignment_sync_attempted_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS solicitor_assignment_synced_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS solicitor_assignment_sync_debug JSONB
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS mgogpt_disposition_value TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS mgogpt_disposition_comment TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS mgogpt_disposition_updated_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS mgogpt_disposition_sync_state TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS mgogpt_disposition_sync_error TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS mgogpt_disposition_sync_attempted_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS mgogpt_disposition_synced_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS mgogpt_disposition_sync_debug JSONB
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS assignment_source TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS assignment_status TEXT NOT NULL DEFAULT 'active'
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS assignment_updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS nxt_status_sync_state TEXT NOT NULL DEFAULT 'manual_required'
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS nxt_status_sync_error TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS nxt_status_sync_debug JSONB
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS nxt_status_sync_attempted_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS nxt_status_synced_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS nxt_status_retry_count INTEGER NOT NULL DEFAULT 0
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS manual_nxt_update_required BOOLEAN NOT NULL DEFAULT FALSE
    `;
    await sql`
      UPDATE prospect_pool
      SET normalized_name = LOWER(TRIM(COALESCE(prospect_name, '')))
      WHERE normalized_name IS NULL OR normalized_name = ''
    `;
    await sql`
      UPDATE prospect_pool
      SET
        assigned_at = COALESCE(assigned_at, created_at),
        assignment_source = COALESCE(NULLIF(TRIM(COALESCE(assignment_source, '')), ''), 'Advancement Services'),
        assignment_status = COALESCE(NULLIF(TRIM(COALESCE(assignment_status, '')), ''), CASE
          WHEN assigned_user_id IS NULL THEN 'pending'
          ELSE 'active'
        END),
        assignment_updated_by = COALESCE(assignment_updated_by, created_by),
        nxt_status_sync_state = COALESCE(NULLIF(TRIM(COALESCE(nxt_status_sync_state, '')), ''), 'manual_required'),
        manual_nxt_update_required = CASE
          WHEN nxt_status_sync_state = 'success' THEN FALSE
          ELSE TRUE
        END,
        nxt_status_sync_error = CASE
          WHEN nxt_status_sync_error IS NULL AND nxt_status_sync_state <> 'success'
            THEN 'Legacy assignment requires manual NXT prospect status update review.'
          ELSE nxt_status_sync_error
        END
      WHERE
        assigned_at IS NULL
        OR assignment_source IS NULL
        OR assignment_source = ''
        OR assignment_status IS NULL
        OR assignment_status = ''
        OR assignment_updated_by IS NULL
        OR nxt_status_sync_state IS NULL
        OR nxt_status_sync_state = ''
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS prospect_pool_assignment_audits (
        id BIGSERIAL PRIMARY KEY,
        prospect_pool_id BIGINT REFERENCES prospect_pool(id) ON DELETE CASCADE,
        constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL,
        blackbaud_constituent_id TEXT,
        constituent_name TEXT NOT NULL,
        assigned_to_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        assigned_to_name TEXT NOT NULL,
        assigned_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        assigned_by_name TEXT NOT NULL,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        assignment_source TEXT NOT NULL DEFAULT 'Advancement Services',
        assignment_status TEXT NOT NULL,
        desired_nxt_prospect_status TEXT NOT NULL,
        desired_nxt_custom_field_category TEXT,
        desired_nxt_custom_field_value TEXT,
        desired_nxt_start_date DATE,
        desired_nxt_comment TEXT,
        nxt_sync_status TEXT NOT NULL,
        nxt_sync_error TEXT,
        nxt_sync_debug JSONB,
        nxt_sync_attempted_at TIMESTAMPTZ,
        nxt_synced_at TIMESTAMPTZ,
        retry_count INTEGER NOT NULL DEFAULT 0,
        manual_update_required BOOLEAN NOT NULL DEFAULT FALSE,
        exported_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      ALTER TABLE prospect_pool_assignment_audits
      ADD COLUMN IF NOT EXISTS desired_nxt_custom_field_category TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool_assignment_audits
      ADD COLUMN IF NOT EXISTS desired_nxt_custom_field_value TEXT
    `;
    await sql`
      ALTER TABLE prospect_pool_assignment_audits
      ADD COLUMN IF NOT EXISTS nxt_sync_debug JSONB
    `;
    await sql`
      UPDATE prospect_pool_assignment_audits
      SET
        desired_nxt_custom_field_category = COALESCE(NULLIF(TRIM(COALESCE(desired_nxt_custom_field_category, '')), ''), 'MGOGPT'),
        desired_nxt_custom_field_value = COALESCE(NULLIF(TRIM(COALESCE(desired_nxt_custom_field_value, '')), ''), NULLIF(TRIM(COALESCE(desired_nxt_prospect_status, '')), ''), 'Identification/Re-Qualification')
      WHERE
        desired_nxt_custom_field_category IS NULL
        OR desired_nxt_custom_field_category = ''
        OR desired_nxt_custom_field_value IS NULL
        OR desired_nxt_custom_field_value = ''
    `;
    await sql`
      ALTER TABLE prospect_pool
      ADD COLUMN IF NOT EXISTS current_assignment_audit_id BIGINT REFERENCES prospect_pool_assignment_audits(id) ON DELETE SET NULL
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospect_pool_assignment_audits_pool_id
      ON prospect_pool_assignment_audits (prospect_pool_id, assigned_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospect_pool_assignment_audits_sync_status
      ON prospect_pool_assignment_audits (nxt_sync_status, manual_update_required, assigned_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospect_pool_assigned_user
      ON prospect_pool (assigned_user_id, assignment_status, updated_at DESC)
    `;
    await sql`
      INSERT INTO prospect_pool_assignment_audits (
        prospect_pool_id,
        constituent_id,
        blackbaud_constituent_id,
        constituent_name,
        assigned_to_user_id,
        assigned_to_name,
        assigned_by_user_id,
        assigned_by_name,
        assigned_at,
        assignment_source,
        assignment_status,
        desired_nxt_prospect_status,
        desired_nxt_custom_field_category,
        desired_nxt_custom_field_value,
        desired_nxt_start_date,
        desired_nxt_comment,
        nxt_sync_status,
        nxt_sync_error,
        nxt_sync_debug,
        nxt_sync_attempted_at,
        nxt_synced_at,
        retry_count,
        manual_update_required,
        created_at,
        updated_at
      )
      SELECT
        pp.id,
        pp.constituent_id,
        pp.blackbaud_constituent_id,
        COALESCE(NULLIF(TRIM(COALESCE(pp.prospect_name, '')), ''), 'Unknown prospect'),
        pp.assigned_user_id,
        COALESCE(NULLIF(TRIM(COALESCE(assigned_user.name, '')), ''), COALESCE(assigned_user.email, 'Unknown MGO')),
        pp.assignment_updated_by,
        COALESCE(NULLIF(TRIM(COALESCE(assignment_user.name, '')), ''), COALESCE(assignment_user.email, 'Unknown reviewer')),
        COALESCE(pp.assigned_at, pp.created_at, NOW()),
        COALESCE(NULLIF(TRIM(COALESCE(pp.assignment_source, '')), ''), 'Advancement Services'),
        COALESCE(NULLIF(TRIM(COALESCE(pp.assignment_status, '')), ''), 'active'),
        'Identification/Re-Qualification',
        'MGOGPT',
        'Identification/Re-Qualification',
        COALESCE(COALESCE(pp.assigned_at, pp.created_at, NOW())::date, CURRENT_DATE),
        'Assigned by Advancement Services',
        COALESCE(NULLIF(TRIM(COALESCE(pp.nxt_status_sync_state, '')), ''), 'manual_required'),
        pp.nxt_status_sync_error,
        pp.nxt_status_sync_debug,
        pp.nxt_status_sync_attempted_at,
        pp.nxt_status_synced_at,
        COALESCE(pp.nxt_status_retry_count, 0),
        COALESCE(pp.manual_nxt_update_required, TRUE),
        COALESCE(pp.created_at, NOW()),
        COALESCE(pp.updated_at, NOW())
      FROM prospect_pool pp
      LEFT JOIN users assigned_user ON assigned_user.id = pp.assigned_user_id
      LEFT JOIN users assignment_user ON assignment_user.id = COALESCE(pp.assignment_updated_by, pp.created_by)
      WHERE NOT EXISTS (
        SELECT 1
        FROM prospect_pool_assignment_audits audit
        WHERE audit.prospect_pool_id = pp.id
      )
    `;
    await sql`
      UPDATE prospect_pool pp
      SET current_assignment_audit_id = latest_audit.id
      FROM (
        SELECT DISTINCT ON (prospect_pool_id)
          prospect_pool_id,
          id
        FROM prospect_pool_assignment_audits
        ORDER BY prospect_pool_id, assigned_at DESC, id DESC
      ) latest_audit
      WHERE
        pp.current_assignment_audit_id IS NULL
        AND latest_audit.prospect_pool_id = pp.id
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
      ADD COLUMN IF NOT EXISTS blackbaud_constituent_id TEXT
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
      CREATE TABLE IF NOT EXISTS pending_actions (
        id BIGSERIAL PRIMARY KEY,
        owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prospect_id BIGINT REFERENCES prospects(id) ON DELETE CASCADE,
        constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL,
        prospect_opportunity_id BIGINT REFERENCES prospect_opportunities(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        details TEXT,
        due_date DATE,
        category TEXT NOT NULL DEFAULT 'General',
        status TEXT NOT NULL DEFAULT 'Open',
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        needs_discussion BOOLEAN NOT NULL DEFAULT FALSE,
        discussion_note TEXT,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS prospect_id BIGINT REFERENCES prospects(id) ON DELETE CASCADE
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS prospect_opportunity_id BIGINT REFERENCES prospect_opportunities(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS title TEXT
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS details TEXT
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS due_date DATE
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'General'
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Open'
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS needs_discussion BOOLEAN NOT NULL DEFAULT FALSE
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS discussion_note TEXT
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE pending_actions
      ADD COLUMN IF NOT EXISTS discussion_item_id BIGINT REFERENCES discussion_items(id) ON DELETE SET NULL
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
      ADD COLUMN IF NOT EXISTS blackbaud_opportunity_id TEXT
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
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS ask_date DATE
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS expected_date DATE
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS joint_mgo_user_ids JSONB
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS shared_opportunity_key TEXT
    `;
    await sql`
      ALTER TABLE prospect_opportunities
      ADD COLUMN IF NOT EXISTS purpose TEXT
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS prospect_opportunity_gift_links (
        id BIGSERIAL PRIMARY KEY,
        prospect_opportunity_id BIGINT NOT NULL REFERENCES prospect_opportunities(id) ON DELETE CASCADE,
        blackbaud_opportunity_id TEXT,
        constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL,
        blackbaud_gift_id TEXT NOT NULL,
        gift_date DATE,
        gift_amount NUMERIC,
        gift_type TEXT,
        gift_fund TEXT,
        applied_amount NUMERIC,
        nxt_sync_state TEXT NOT NULL DEFAULT 'manual_required',
        nxt_sync_error TEXT,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (prospect_opportunity_id, blackbaud_gift_id)
      )
    `;
    await sql`
      ALTER TABLE prospect_opportunity_gift_links
      ADD COLUMN IF NOT EXISTS blackbaud_opportunity_id TEXT
    `;
    await sql`
      ALTER TABLE prospect_opportunity_gift_links
      ADD COLUMN IF NOT EXISTS constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE prospect_opportunity_gift_links
      ADD COLUMN IF NOT EXISTS gift_date DATE
    `;
    await sql`
      ALTER TABLE prospect_opportunity_gift_links
      ADD COLUMN IF NOT EXISTS gift_amount NUMERIC
    `;
    await sql`
      ALTER TABLE prospect_opportunity_gift_links
      ADD COLUMN IF NOT EXISTS gift_type TEXT
    `;
    await sql`
      ALTER TABLE prospect_opportunity_gift_links
      ADD COLUMN IF NOT EXISTS gift_fund TEXT
    `;
    await sql`
      ALTER TABLE prospect_opportunity_gift_links
      ADD COLUMN IF NOT EXISTS applied_amount NUMERIC
    `;
    await sql`
      ALTER TABLE prospect_opportunity_gift_links
      ADD COLUMN IF NOT EXISTS nxt_sync_state TEXT NOT NULL DEFAULT 'manual_required'
    `;
    await sql`
      ALTER TABLE prospect_opportunity_gift_links
      ADD COLUMN IF NOT EXISTS nxt_sync_error TEXT
    `;
    await sql`
      ALTER TABLE prospect_opportunity_gift_links
      ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL
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
        update_title TEXT,
        action_category TEXT,
        action_type TEXT,
        blackbaud_action_id TEXT,
        blackbaud_sync_variant TEXT,
        blackbaud_sync_warning TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE prospect_updates
      ADD COLUMN IF NOT EXISTS update_title TEXT
    `;
    await sql`
      ALTER TABLE prospect_updates
      ADD COLUMN IF NOT EXISTS action_category TEXT
    `;
    await sql`
      ALTER TABLE prospect_updates
      ADD COLUMN IF NOT EXISTS action_type TEXT
    `;
    await sql`
      ALTER TABLE prospect_updates
      ADD COLUMN IF NOT EXISTS blackbaud_action_id TEXT
    `;
    await sql`
      ALTER TABLE prospect_updates
      ADD COLUMN IF NOT EXISTS blackbaud_sync_variant TEXT
    `;
    await sql`
      ALTER TABLE prospect_updates
      ADD COLUMN IF NOT EXISTS blackbaud_sync_warning TEXT
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS discussion_items (
        id BIGSERIAL PRIMARY KEY,
        owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        assigned_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        prospect_id BIGINT REFERENCES prospects(id) ON DELETE CASCADE,
        constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL,
        prospect_opportunity_id BIGINT REFERENCES prospect_opportunities(id) ON DELETE SET NULL,
        initiative_name TEXT,
        subject TEXT NOT NULL,
        body TEXT,
        due_date DATE,
        status TEXT NOT NULL DEFAULT 'Open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE discussion_items
      ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
    `;
    await sql`
      ALTER TABLE discussion_items
      ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE discussion_items
      ADD COLUMN IF NOT EXISTS assigned_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE discussion_items
      ADD COLUMN IF NOT EXISTS prospect_id BIGINT REFERENCES prospects(id) ON DELETE CASCADE
    `;
    await sql`
      ALTER TABLE discussion_items
      ADD COLUMN IF NOT EXISTS constituent_id BIGINT REFERENCES constituents(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE discussion_items
      ADD COLUMN IF NOT EXISTS prospect_opportunity_id BIGINT REFERENCES prospect_opportunities(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE discussion_items
      ADD COLUMN IF NOT EXISTS initiative_name TEXT
    `;
    await sql`
      ALTER TABLE discussion_items
      ADD COLUMN IF NOT EXISTS subject TEXT
    `;
    await sql`
      ALTER TABLE discussion_items
      ADD COLUMN IF NOT EXISTS body TEXT
    `;
    await sql`
      ALTER TABLE discussion_items
      ADD COLUMN IF NOT EXISTS due_date DATE
    `;
    await sql`
      ALTER TABLE discussion_items
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Open'
    `;
    await sql`
      ALTER TABLE discussion_items
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;
    await sql`
      ALTER TABLE discussion_items
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS discussion_item_participants (
        discussion_item_id BIGINT NOT NULL REFERENCES discussion_items(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (discussion_item_id, user_id)
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_discussion_item_participants_user
      ON discussion_item_participants (user_id, discussion_item_id)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS portfolio_categories (
        id BIGSERIAL PRIMARY KEY,
        owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        parent_category_id BIGINT REFERENCES portfolio_categories(id) ON DELETE SET NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      ALTER TABLE portfolio_categories
      ADD COLUMN IF NOT EXISTS parent_category_id BIGINT
      REFERENCES portfolio_categories(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE portfolio_categories
      ADD COLUMN IF NOT EXISTS sort_order INTEGER
    `;
    await sql`
      WITH ordered_categories AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY owner_user_id
            ORDER BY created_at ASC, id ASC
          ) - 1 AS position
        FROM portfolio_categories
      )
      UPDATE portfolio_categories AS pc
      SET sort_order = ordered_categories.position
      FROM ordered_categories
      WHERE pc.id = ordered_categories.id
        AND pc.sort_order IS NULL
    `;
    await sql`UPDATE portfolio_categories SET sort_order = 0 WHERE sort_order IS NULL`;
    await sql`ALTER TABLE portfolio_categories ALTER COLUMN sort_order SET DEFAULT 0`;
    await sql`ALTER TABLE portfolio_categories ALTER COLUMN sort_order SET NOT NULL`;
    await sql`
      CREATE TABLE IF NOT EXISTS portfolio_category_assignments (
        id BIGSERIAL PRIMARY KEY,
        owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_id BIGINT NOT NULL REFERENCES portfolio_categories(id) ON DELETE CASCADE,
        blackbaud_constituent_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      CREATE INDEX IF NOT EXISTS idx_prospects_user_status_priority
      ON prospects (user_id, status, priority_order, created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospects_user_active_priority
      ON prospects (user_id, priority_order, created_at DESC)
      WHERE status = 'Active'
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospects_user_active_updated
      ON prospects (user_id, updated_at DESC)
      WHERE status = 'Active'
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospects_user_constituent
      ON prospects (user_id, constituent_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospects_user_constituent_updated
      ON prospects (user_id, constituent_id, updated_at DESC, created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospect_opportunities_prospect_status
      ON prospect_opportunities (prospect_id, opportunity_status, updated_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospect_opportunities_prospect_close
      ON prospect_opportunities (prospect_id, close_date)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospect_opportunities_prospect_updated_created
      ON prospect_opportunities (prospect_id, updated_at DESC, created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospect_opportunity_gift_links_opportunity
      ON prospect_opportunity_gift_links (prospect_opportunity_id, gift_date DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospect_opportunity_gift_links_gift
      ON prospect_opportunity_gift_links (blackbaud_gift_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospect_updates_prospect_created
      ON prospect_updates (prospect_id, created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospect_updates_prospect_date_created
      ON prospect_updates (prospect_id, update_date DESC, created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_submissions_user_prospect_activity
      ON submissions (user_id, prospect_id, updated_at DESC, date_submitted DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_submissions_user_constituent_activity
      ON submissions (user_id, constituent_id, updated_at DESC, date_submitted DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_discussion_items_owner_status_prospect
      ON discussion_items (owner_user_id, status, prospect_id, updated_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_discussion_items_owner_status_constituent
      ON discussion_items (owner_user_id, status, constituent_id, updated_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_discussion_items_assigned_status_due
      ON discussion_items (assigned_user_id, status, due_date, updated_at DESC)
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_categories_owner_name
      ON portfolio_categories (owner_user_id, LOWER(name))
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_portfolio_categories_owner_parent_order
      ON portfolio_categories (owner_user_id, parent_category_id, sort_order, id)
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_category_assignments_owner_constituent
      ON portfolio_category_assignments (owner_user_id, blackbaud_constituent_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_portfolio_category_assignments_owner_category
      ON portfolio_category_assignments (owner_user_id, category_id)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_pending_actions_owner_status_due
      ON pending_actions (owner_user_id, status, due_date, updated_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_pending_actions_owner_open_due_prospect
      ON pending_actions (owner_user_id, due_date, updated_at DESC, prospect_id)
      WHERE status = 'Open'
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_pending_actions_owner_category_status_due
      ON pending_actions (owner_user_id, category, status, due_date, updated_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_pending_actions_owner_prospect_primary
      ON pending_actions (owner_user_id, prospect_id, is_primary, status, updated_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_pending_actions_owner_constituent_primary
      ON pending_actions (owner_user_id, constituent_id, is_primary, status, updated_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_data_change_requests_status_updated
      ON data_change_requests (status, updated_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_data_change_requests_requester
      ON data_change_requests (requester_user_id, status, updated_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_data_change_requests_owner
      ON data_change_requests (owner_user_id, status, updated_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_prospect_pool_assigned_sync_updated
      ON prospect_pool (assigned_user_id, solicitor_assignment_sync_state, updated_at DESC)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS blackbaud_field_mappings (
        mapping_key TEXT PRIMARY KEY,
        app_entity TEXT NOT NULL,
        app_field TEXT NOT NULL,
        blackbaud_object TEXT,
        blackbaud_field TEXT,
        selection_rule TEXT,
        direction TEXT NOT NULL DEFAULT 'local only',
        source_of_truth TEXT,
        notes TEXT,
        reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE blackbaud_field_mappings
      ADD COLUMN IF NOT EXISTS app_entity TEXT
    `;
    await sql`
      ALTER TABLE blackbaud_field_mappings
      ADD COLUMN IF NOT EXISTS app_field TEXT
    `;
    await sql`
      ALTER TABLE blackbaud_field_mappings
      ADD COLUMN IF NOT EXISTS blackbaud_object TEXT
    `;
    await sql`
      ALTER TABLE blackbaud_field_mappings
      ADD COLUMN IF NOT EXISTS blackbaud_field TEXT
    `;
    await sql`
      ALTER TABLE blackbaud_field_mappings
      ADD COLUMN IF NOT EXISTS selection_rule TEXT
    `;
    await sql`
      ALTER TABLE blackbaud_field_mappings
      ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'local only'
    `;
    await sql`
      ALTER TABLE blackbaud_field_mappings
      ADD COLUMN IF NOT EXISTS source_of_truth TEXT
    `;
    await sql`
      ALTER TABLE blackbaud_field_mappings
      ADD COLUMN IF NOT EXISTS notes TEXT
    `;
    await sql`
      ALTER TABLE blackbaud_field_mappings
      ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE blackbaud_field_mappings
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE blackbaud_field_mappings
      ADD COLUMN IF NOT EXISTS updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE blackbaud_field_mappings
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS giving_society_configurations (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        basis TEXT NOT NULL DEFAULT 'annual',
        period_basis TEXT NOT NULL DEFAULT 'calendar_year',
        fiscal_year_start_month INTEGER NOT NULL DEFAULT 7,
        minimum_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
        maximum_amount NUMERIC(14, 2),
        count_sources JSONB NOT NULL DEFAULT '["received_revenue","recognition_credit"]'::jsonb,
        display_alongside BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        display_order INTEGER NOT NULL DEFAULT 1,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      ALTER TABLE giving_society_configurations
      ADD COLUMN IF NOT EXISTS basis TEXT NOT NULL DEFAULT 'annual'
    `;
    await sql`
      ALTER TABLE giving_society_configurations
      ADD COLUMN IF NOT EXISTS period_basis TEXT NOT NULL DEFAULT 'calendar_year'
    `;
    await sql`
      ALTER TABLE giving_society_configurations
      ADD COLUMN IF NOT EXISTS fiscal_year_start_month INTEGER NOT NULL DEFAULT 7
    `;
    await sql`
      ALTER TABLE giving_society_configurations
      ADD COLUMN IF NOT EXISTS minimum_amount NUMERIC(14, 2) NOT NULL DEFAULT 0
    `;
    await sql`
      ALTER TABLE giving_society_configurations
      ADD COLUMN IF NOT EXISTS maximum_amount NUMERIC(14, 2)
    `;
    await sql`
      ALTER TABLE giving_society_configurations
      ADD COLUMN IF NOT EXISTS count_sources JSONB NOT NULL DEFAULT '["received_revenue","recognition_credit"]'::jsonb
    `;
    await sql`
      ALTER TABLE giving_society_configurations
      ADD COLUMN IF NOT EXISTS display_alongside BOOLEAN NOT NULL DEFAULT FALSE
    `;
    await sql`
      ALTER TABLE giving_society_configurations
      ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE
    `;
    await sql`
      ALTER TABLE giving_society_configurations
      ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 1
    `;
    await sql`
      ALTER TABLE giving_society_configurations
      ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE giving_society_configurations
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;
    await sql`
      ALTER TABLE giving_society_configurations
      ADD COLUMN IF NOT EXISTS updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE giving_society_configurations
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_giving_society_configurations_active_order
      ON giving_society_configurations (active, display_order ASC)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS constituency_import_runs (
        id BIGSERIAL PRIMARY KEY,
        created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        workspace_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'previewed',
        source_filename TEXT,
        mappings JSONB,
        defaults JSONB,
        warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
        summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        row_count INTEGER NOT NULL DEFAULT 0,
        ready_count INTEGER NOT NULL DEFAULT 0,
        needs_review_count INTEGER NOT NULL DEFAULT 0,
        conflict_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        applied_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        applied_at TIMESTAMPTZ
      )
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS workspace_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'previewed'
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS source_filename TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS mappings JSONB
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS defaults JSONB
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS warnings JSONB NOT NULL DEFAULT '[]'::jsonb
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS summary JSONB NOT NULL DEFAULT '{}'::jsonb
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS row_count INTEGER NOT NULL DEFAULT 0
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS ready_count INTEGER NOT NULL DEFAULT 0
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS needs_review_count INTEGER NOT NULL DEFAULT 0
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS conflict_count INTEGER NOT NULL DEFAULT 0
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS skipped_count INTEGER NOT NULL DEFAULT 0
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS applied_count INTEGER NOT NULL DEFAULT 0
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS failed_count INTEGER NOT NULL DEFAULT 0
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;
    await sql`
      ALTER TABLE constituency_import_runs
      ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_constituency_import_runs_created
      ON constituency_import_runs (created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_constituency_import_runs_status
      ON constituency_import_runs (status, created_at DESC)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS constituency_import_rows (
        id BIGSERIAL PRIMARY KEY,
        run_id BIGINT NOT NULL REFERENCES constituency_import_runs(id) ON DELETE CASCADE,
        row_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        match_status TEXT,
        match_method TEXT,
        confidence INTEGER,
        matched_blackbaud_constituent_id TEXT,
        matched_lookup_id TEXT,
        constituent_name TEXT,
        action TEXT,
        source_constituency TEXT,
        target_constituency TEXT,
        start_date TEXT,
        end_date TEXT,
        raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
        preview JSONB NOT NULL DEFAULT '{}'::jsonb,
        requested_writes JSONB NOT NULL DEFAULT '[]'::jsonb,
        blackbaud_result JSONB,
        blackbaud_error TEXT,
        applied_at TIMESTAMPTZ,
        create_approved_at TIMESTAMPTZ,
        create_approved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_blackbaud_constituent_id TEXT,
        created_blackbaud_lookup_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS run_id BIGINT REFERENCES constituency_import_runs(id) ON DELETE CASCADE
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS row_number INTEGER
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS status TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS match_status TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS match_method TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS confidence INTEGER
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS matched_blackbaud_constituent_id TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS matched_lookup_id TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS constituent_name TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS action TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS source_constituency TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS target_constituency TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS start_date TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS end_date TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS raw_row JSONB NOT NULL DEFAULT '{}'::jsonb
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS preview JSONB NOT NULL DEFAULT '{}'::jsonb
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS requested_writes JSONB NOT NULL DEFAULT '[]'::jsonb
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS blackbaud_result JSONB
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS blackbaud_error TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS create_approved_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS create_approved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS created_blackbaud_constituent_id TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS created_blackbaud_lookup_id TEXT
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;
    await sql`
      ALTER TABLE constituency_import_rows
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_constituency_import_rows_run_row
      ON constituency_import_rows (run_id, row_number)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_constituency_import_rows_status
      ON constituency_import_rows (run_id, status)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_constituency_import_rows_create_approval
      ON constituency_import_rows (run_id, create_approved_at)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_base_article_overrides (
        article_id TEXT PRIMARY KEY,
        category_id TEXT,
        article_type TEXT,
        status TEXT,
        title TEXT,
        summary TEXT,
        tags JSONB,
        related_article_ids JSONB,
        related_system_ids JSONB,
        related_process_ids JSONB,
        related_request_links JSONB,
        owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        reviewer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        last_reviewed_at DATE,
        published_at TIMESTAMPTZ,
        template_key TEXT,
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INTEGER,
        sections JSONB,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS category_id TEXT
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS article_type TEXT
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS status TEXT
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS related_article_ids JSONB
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS related_system_ids JSONB
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS related_process_ids JSONB
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS related_request_links JSONB
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS reviewer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS last_reviewed_at DATE
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS template_key TEXT
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS sort_order INTEGER
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL
    `;
    await sql`
      ALTER TABLE knowledge_base_article_overrides
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_base_article_revisions (
        id BIGSERIAL PRIMARY KEY,
        article_id TEXT NOT NULL,
        snapshot JSONB NOT NULL,
        action TEXT NOT NULL DEFAULT 'save',
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_kb_revisions_article
      ON knowledge_base_article_revisions (article_id, created_at DESC)
    `;

    // Preserve existing access during the role vocabulary migration.
    await sql`
      UPDATE users
      SET role = CASE
        WHEN role IN ('reviewer', 'advancement_admin') THEN 'advancement_services'
        WHEN role = 'executive_admin' THEN 'executive'
        ELSE role
      END
      WHERE role IN ('reviewer', 'advancement_admin', 'executive_admin')
    `;
    await sql`
      UPDATE user_invitations
      SET
        role = CASE
          WHEN role IN ('reviewer', 'advancement_admin') THEN 'advancement_services'
          WHEN role = 'executive_admin' THEN 'executive'
          ELSE role
        END,
        updated_at = NOW()
      WHERE role IN ('reviewer', 'advancement_admin', 'executive_admin')
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS report_configurations (
        id BIGSERIAL PRIMARY KEY,
        report_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        visibility TEXT NOT NULL DEFAULT 'all_users',
        specific_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_report_configurations_visibility
      ON report_configurations (visibility)
    `;
    await sql`
      INSERT INTO report_configurations (
        report_key,
        title,
        description,
        visibility,
        specific_user_ids
      )
      VALUES (
        'portfolio-fy-giving',
        'Portfolio Giving',
        'Review current fiscal-year gift activity across an MGO portfolio.',
        'all_users',
        '[]'::jsonb
      )
      ON CONFLICT (report_key) DO NOTHING
    `;

    await sql`
      INSERT INTO report_configurations (
        report_key,
        title,
        description,
        visibility,
        specific_user_ids
      )
      VALUES (
        'executive-team-standings',
        'Executive Team Standings',
        'Compare local portfolio health, pipeline, and follow-up coverage across active MGOs.',
        'executive',
        '[]'::jsonb
      )
      ON CONFLICT (report_key) DO NOTHING
    `;
    await sql`
      INSERT INTO report_configurations (
        report_key,
        title,
        description,
        visibility,
        specific_user_ids
      )
      VALUES (
        'future-made-phase-ii',
        'Future. Made. Phase II',
        'View every constituent returned by the saved Future. Made. Phase II NXT query.',
        'all_users',
        '[]'::jsonb
      )
      ON CONFLICT (report_key) DO NOTHING
    `;
  })();

  return schemaReadyPromise;
}
