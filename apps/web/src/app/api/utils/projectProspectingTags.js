import { randomUUID } from "node:crypto";
import sql from "./sql";
import { listError } from "./listConfigurations";
import { listSnapshotKeys } from "./constituentListRefresh";
import { readPortfolioReport } from "./portfolioGivingReportStore";
import { isProjectProspecting, normalizeProjectTag, projectIdentity, projectConstituentId,
  PROJECT_SELECTION_LIMIT, PROJECT_TAG_LIMIT } from "@/utils/projectProspecting";

export async function projectTagSnapshot(context) {
  if (!isProjectProspecting(context.report)) throw listError("Project not found.", 404);
  const keys = listSnapshotKeys(context.report, context.origin);
  const saved = await readPortfolioReport(keys);
  const snapshot = saved?.snapshot;
  return { keys, snapshot, identity: projectIdentity(snapshot, context.report.dataConfiguration) };
}

export async function readProjectTags(context, state) {
  const tags = await sql`SELECT id, name FROM project_prospect_tags
    WHERE project_key = ${context.report.key} ORDER BY name_key, id`;
  const assignments = state.identity.ids.length ? await sql`
    SELECT tag_id AS "tagId", constituent_id AS "constituentId" FROM project_prospect_tag_assignments
    WHERE project_key = ${context.report.key} AND constituent_id = ANY(${state.identity.ids})
    ORDER BY constituent_id, tag_id` : [];
  return { tags, assignments, revision: context.report.revision, snapshotAt: state.snapshot?.generatedAt || null };
}

export function validateProjectTagMutation(body, context, state) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).some(key => !["action", "name", "tagId", "constituentIds", "revision", "snapshotAt"].includes(key)) ||
    !["create", "apply", "remove"].includes(body.action)) throw listError("Choose a valid project tag action.");
  if (body.revision !== context.report.revision) throw listError("Project settings changed. Reload the project before changing tags.", 409);
  if (body.action === "create") {
    if (body.tagId !== undefined || body.constituentIds !== undefined || !normalizeProjectTag(body.name))
      throw listError("Enter a tag name between 1 and 50 characters.");
    return { tag: normalizeProjectTag(body.name), ids: [] };
  }
  if (body.name !== undefined || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.tagId || ""))
    throw listError("Choose a saved project tag.");
  if (!state.snapshot?.generatedAt || body.snapshotAt !== state.snapshot.generatedAt)
    throw listError("The saved list changed. Reload the project before changing tags.", 409);
  if (state.identity.error) throw listError(state.identity.error, 422);
  const ids = body.constituentIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > PROJECT_SELECTION_LIMIT ||
    ids.some(id => projectConstituentId(id) !== id) || new Set(ids).size !== ids.length)
    throw listError(`Select between 1 and ${PROJECT_SELECTION_LIMIT} distinct constituents.`);
  if (ids.some(id => !state.identity.ids.includes(id)))
    throw listError("A selected constituent is not in this saved project list. Reload before continuing.", 409);
  return { ids };
}

export async function mutateProjectTags(context, state, body) {
  const { ids, tag } = validateProjectTagMutation(body, context, state);
  const project = context.report.key;
  const userId = context.user.id;
  const create = body.action === "create";
  // Serialize edits per project and hold the access/snapshot rows through commit.
  // A refresh or revoked access must not slip between validation and mutation.
  const lock = [
    sql`SELECT report_key FROM report_configurations WHERE report_key = ${project} FOR UPDATE`,
    sql`SELECT id FROM users WHERE id = ${userId} FOR SHARE`,
    sql`SELECT report_key FROM report_snapshots_cache WHERE report_key = ${state.keys.snapshot} FOR SHARE`,
  ];
  const allowed = sql`
    SELECT r.report_key FROM report_configurations r JOIN users u ON u.id = ${userId}
    WHERE r.report_key = ${project} AND r.active = TRUE AND u.active = TRUE
      AND r.configuration_kind = 'constituent_list' AND r.visibility = 'specific_users'
      AND r.specific_user_ids @> ${JSON.stringify([Number(userId)])}::jsonb
      AND r.data_configuration->>'section' = 'project-prospecting'
      AND r.updated_at::text = ${context.report.revision}
      AND (${create} OR EXISTS (SELECT 1 FROM report_snapshots_cache s
        WHERE s.report_key = ${state.keys.snapshot} AND s.payload->>'generatedAt' = ${body.snapshotAt || ""}))
  `;
  // Neon tagged queries cannot be interpolated as SQL fragments; repeat the
  // access predicate inside the mutation rather than trusting the earlier read.
  const mutation = sql`
    WITH allowed AS (
      SELECT r.report_key FROM report_configurations r JOIN users u ON u.id = ${userId}
      WHERE r.report_key = ${project} AND r.active = TRUE AND u.active = TRUE
        AND r.configuration_kind = 'constituent_list' AND r.visibility = 'specific_users'
        AND r.specific_user_ids @> ${JSON.stringify([Number(userId)])}::jsonb
        AND r.data_configuration->>'section' = 'project-prospecting'
        AND r.updated_at::text = ${context.report.revision}
        AND (${create} OR EXISTS (SELECT 1 FROM report_snapshots_cache s
          WHERE s.report_key = ${state.keys.snapshot} AND s.payload->>'generatedAt' = ${body.snapshotAt || ""}))
    ), new_tag AS (
      INSERT INTO project_prospect_tags (id, project_key, name, name_key, created_by)
      SELECT ${randomUUID()}::uuid, report_key, ${tag?.name || ""}, ${tag?.key || ""}, ${userId} FROM allowed
      WHERE ${create} AND (SELECT COUNT(*) FROM project_prospect_tags WHERE project_key = ${project}) < ${PROJECT_TAG_LIMIT}
      ON CONFLICT (project_key, name_key) DO NOTHING RETURNING id, name
    ), target_tag AS (
      SELECT t.id, t.name FROM project_prospect_tags t JOIN allowed a ON a.report_key = t.project_key
      WHERE (${create} AND t.name_key = ${tag?.key || ""}) OR (NOT ${create} AND t.id = ${body.tagId || null}::uuid)
      UNION ALL SELECT id, name FROM new_tag
    ), added AS (
      INSERT INTO project_prospect_tag_assignments (project_key, tag_id, constituent_id, assigned_by)
      SELECT ${project}, t.id, i.id, ${userId} FROM target_tag t CROSS JOIN unnest(${ids}::text[]) i(id)
      WHERE ${body.action === "apply"} ON CONFLICT DO NOTHING RETURNING tag_id, constituent_id
    ), removed AS (
      DELETE FROM project_prospect_tag_assignments a USING target_tag t
      WHERE ${body.action === "remove"} AND a.project_key = ${project} AND a.tag_id = t.id
        AND a.constituent_id = ANY(${ids}::text[]) RETURNING a.tag_id, a.constituent_id
    ), events AS (
      INSERT INTO project_prospect_tag_events (project_key, tag_id, constituent_id, action, actor_id)
      SELECT ${project}, id, NULL, 'create', ${userId} FROM new_tag
      UNION ALL SELECT ${project}, tag_id, constituent_id, 'apply', ${userId} FROM added
      UNION ALL SELECT ${project}, tag_id, constituent_id, 'remove', ${userId} FROM removed
    )
    SELECT t.id, t.name, ((SELECT COUNT(*) FROM added) + (SELECT COUNT(*) FROM removed))::integer AS changed
    FROM target_tag t
  `;
  const results = await sql.transaction([...lock, allowed, mutation], { isolationLevel: "ReadCommitted" });
  if (!results[3]?.length) throw listError("Project access, settings, or saved results changed. Reload before continuing.", 409);
  const result = results[4]?.[0];
  if (!result) throw listError(create ? `This project has reached its ${PROJECT_TAG_LIMIT}-tag limit. Reuse an existing tag.` : "That tag is not available in this project. Reload before continuing.", 409);
  return { tag: { id: result.id, name: result.name }, changed: result.changed };
}
