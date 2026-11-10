export default async function projectProspectingSchema(db) {
  await db`DO $project_prospecting_schema$
    BEGIN
      PERFORM pg_advisory_xact_lock(734019, 130);
      CREATE TABLE IF NOT EXISTS project_prospect_tags (
        id UUID PRIMARY KEY,
        project_key TEXT NOT NULL REFERENCES report_configurations(report_key),
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
        name_key TEXT NOT NULL,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(project_key, name_key), UNIQUE(project_key, id)
      );
      CREATE TABLE IF NOT EXISTS project_prospect_tag_assignments (
        project_key TEXT NOT NULL,
        tag_id UUID NOT NULL,
        constituent_id TEXT NOT NULL CHECK (constituent_id ~ '^[1-9][0-9]{0,18}$'),
        assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(project_key, tag_id, constituent_id),
        FOREIGN KEY(project_key, tag_id) REFERENCES project_prospect_tags(project_key, id)
      );
      CREATE TABLE IF NOT EXISTS project_prospect_tag_events (
        id BIGSERIAL PRIMARY KEY,
        project_key TEXT NOT NULL REFERENCES report_configurations(report_key),
        tag_id UUID NOT NULL,
        constituent_id TEXT,
        action TEXT NOT NULL CHECK (action IN ('create','apply','remove')),
        actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO report_configurations (report_key, configuration_kind, title, description, active, visibility, specific_user_ids, data_configuration)
      VALUES ('list-project-center', 'constituent_list', 'The Center Prospects - JUMGOGPT',
        'Work together on prospects for The Center. Project tags stay in the app, not NXT.', FALSE, 'specific_users', '[]'::jsonb,
        '{"version":1,"source":"saved_query","queryId":"31110","fieldCategory":"","fieldDescription":"","section":"project-prospecting","systemIdColumn":""}'::jsonb)
      ON CONFLICT (report_key) DO NOTHING;
    END $project_prospecting_schema$`;
}
