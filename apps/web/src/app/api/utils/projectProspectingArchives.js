import sql from "./sql";
import { listError } from "./listConfigurations";

// Called only after mapped membership and bounded IDs have been validated.
export async function mutateProjectArchives(context, state, body, ids) {
  const project = context.report.key, userId = context.user.id;
  const results = await sql.transaction([
    sql`SELECT report_key FROM report_configurations WHERE report_key = ${project} FOR UPDATE`,
    sql`SELECT id FROM users WHERE id = ${userId} FOR SHARE`,
    sql`SELECT report_key FROM report_snapshots_cache WHERE report_key = ${state.keys.snapshot} FOR SHARE`,
    sql`WITH allowed AS (
      SELECT r.report_key FROM report_configurations r JOIN users u ON u.id = ${userId}
      WHERE r.report_key = ${project} AND r.active = TRUE AND u.active = TRUE
        AND r.configuration_kind = 'constituent_list' AND r.visibility = 'specific_users'
        AND r.specific_user_ids @> ${JSON.stringify([Number(userId)])}::jsonb
        AND r.data_configuration->>'section' = 'project-prospecting'
        AND r.updated_at::text = ${context.report.revision}
        AND EXISTS (SELECT 1 FROM report_snapshots_cache s WHERE s.report_key = ${state.keys.snapshot}
          AND s.payload->>'generatedAt' = ${body.snapshotAt})
    ), archived AS (
      INSERT INTO project_prospect_archives (project_key, constituent_id, archived_by)
      SELECT a.report_key, i.id, ${userId}::bigint FROM allowed a CROSS JOIN unnest(${ids}::text[]) i(id)
      WHERE ${body.action === "archive"} ON CONFLICT DO NOTHING RETURNING constituent_id
    ), restored AS (
      DELETE FROM project_prospect_archives p USING allowed a
      WHERE ${body.action === "restore"} AND p.project_key = a.report_key
        AND p.constituent_id = ANY(${ids}::text[]) RETURNING p.constituent_id
    ), events AS (
      INSERT INTO project_prospect_archive_events (project_key, constituent_id, action, actor_id)
      SELECT ${project}, constituent_id, 'archive', ${userId}::bigint FROM archived
      UNION ALL SELECT ${project}, constituent_id, 'restore', ${userId}::bigint FROM restored
    )
    SELECT ((SELECT count(*) FROM archived) + (SELECT count(*) FROM restored))::integer AS changed FROM allowed`,
  ], { isolationLevel: "ReadCommitted" });
  if (!results[3]?.length) throw listError("Project access, settings, or saved results changed. Reload before continuing.", 409);
  return { changed: results[3][0].changed };
}
