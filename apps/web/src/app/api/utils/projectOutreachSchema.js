export default async function projectOutreachSchema(db) {
  await db`DO $project_outreach_schema$
  BEGIN
    PERFORM pg_advisory_xact_lock(734019, 132);
    CREATE TABLE IF NOT EXISTS project_outreach_projects (
      project_key TEXT NOT NULL REFERENCES report_configurations(report_key), origin TEXT NOT NULL,
      settings JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
      updated_by BIGINT NOT NULL REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(project_key, origin)
    );
    CREATE TABLE IF NOT EXISTS project_outreach_tasks (
      id UUID PRIMARY KEY, project_key TEXT NOT NULL, origin TEXT NOT NULL,
      constituent_id TEXT NOT NULL CHECK(constituent_id ~ '^[1-9][0-9]{0,18}$'),
      assignee_id BIGINT NOT NULL REFERENCES users(id), assigned_by BIGINT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL, due_date DATE NOT NULL, stage TEXT NOT NULL DEFAULT 'not_started'
        CHECK(stage IN ('not_started','follow_up','complete')),
      revision INTEGER NOT NULL DEFAULT 1, assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY(project_key, origin) REFERENCES project_outreach_projects(project_key, origin),
      UNIQUE(project_key, origin, constituent_id)
    );
    CREATE TABLE IF NOT EXISTS project_outreach_events (
      id UUID PRIMARY KEY, task_id UUID NOT NULL REFERENCES project_outreach_tasks(id),
      actor_id BIGINT NOT NULL REFERENCES users(id), result JSONB NOT NULL,
      state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','processing','review','confirmed')),
      payload JSONB, receipt_id BIGINT, action_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS project_outreach_one_unresolved
      ON project_outreach_events(task_id) WHERE state IN ('processing','review');
    CREATE TABLE IF NOT EXISTS project_outreach_audits (
      id BIGSERIAL PRIMARY KEY, project_key TEXT NOT NULL, origin TEXT NOT NULL,
      task_id UUID REFERENCES project_outreach_tasks(id), actor_id BIGINT NOT NULL REFERENCES users(id),
      operation TEXT NOT NULL, details JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS project_outreach_task_assignee ON project_outreach_tasks(origin, assignee_id);
    CREATE INDEX IF NOT EXISTS project_outreach_event_task ON project_outreach_events(task_id, created_at);
  END $project_outreach_schema$`;
}
