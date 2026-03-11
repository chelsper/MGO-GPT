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
        reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        date_submitted TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  })();

  return schemaReadyPromise;
}
