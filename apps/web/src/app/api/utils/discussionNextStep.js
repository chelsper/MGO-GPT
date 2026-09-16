import sql from "@/app/api/utils/sql";
import { canEditWorkspace } from "@/utils/workspaceRoles";

export async function loadDiscussionNextStep(id, context) {
  const workspaceId = context.workspaceUser.id;
  const [discussion] = await sql`
    SELECT di.*, di.updated_at::text AS version, p.constituent_id AS prospect_constituent_id
    FROM discussion_items di
    LEFT JOIN prospects p ON p.id = di.prospect_id
    WHERE di.id = ${id} AND (
      di.owner_user_id = ${workspaceId} OR di.assigned_user_id = ${workspaceId}
      OR EXISTS (SELECT 1 FROM discussion_item_participants dip
        WHERE dip.discussion_item_id = di.id AND dip.user_id = ${workspaceId})
    )
  `;
  if (!discussion) return null;
  const topicRows = await sql`
    SELECT c.id AS constituent_id, c.name, c.blackbaud_constituent_id, c.user_id
    FROM constituents c WHERE c.id = ${discussion.constituent_id}
      OR c.id = ${discussion.prospect_constituent_id}
      OR EXISTS (SELECT 1 FROM discussion_item_constituents dic
        WHERE dic.discussion_item_id = ${id} AND dic.constituent_id = c.id)
    ORDER BY c.id
  `;
  const topics = [];
  for (const row of topicRows) {
    const nxtId = row.blackbaud_constituent_id || null;
    const key = nxtId ? `nxt:${nxtId}` : `local:${row.constituent_id}`;
    if (!topics.some(topic => topic.key === key)) topics.push({ ...row, key });
  }
  if (!topics.length) topics.push({ key: "general", name: "General follow-up (no constituent)" });
  const users = await sql`
    SELECT u.id, u.name, u.role, u.active FROM users u
    WHERE u.active IS NOT FALSE AND (
      u.id = ${discussion.owner_user_id} OR u.id = ${discussion.assigned_user_id}
      OR EXISTS (SELECT 1 FROM discussion_item_participants dip
        WHERE dip.discussion_item_id = ${id} AND dip.user_id = u.id)
    ) ORDER BY LOWER(u.name), u.id
  `;
  const owners = users.filter(user => canEditWorkspace({ sessionUser: context.sessionUser,
    workspaceUser: user, isActing: String(user.id) !== String(context.sessionUser.id) }));
  const tasks = await sql`
    SELECT pa.id, pa.owner_user_id, u.name AS owner_name, pa.status, pa.due_date,
      pa.source_topic_key
    FROM pending_actions pa JOIN users u ON u.id = pa.owner_user_id
    WHERE pa.source_discussion_id = ${id} ORDER BY pa.id
  `;
  return { discussion, topics, owners, tasks };
}

export async function createDiscussionNextStep({ id, context, source, owner, topic, draft }) {
  const workspaceId = context.workspaceUser.id;
  // Serialize submissions for this discussion. The following statement gets a fresh
  // READ COMMITTED snapshot, so retries see the first committed reminder and local link.
  const results = await sql.transaction([
    sql`SELECT id FROM discussion_items WHERE id = ${id} FOR UPDATE`,
    sql`
      WITH eligible AS (
        SELECT di.* FROM discussion_items di
        JOIN users target ON target.id = ${owner.id} AND target.role = ${owner.role} AND target.active IS NOT FALSE
        JOIN users actor ON actor.id = ${context.sessionUser.id} AND actor.role = ${context.sessionUser.role} AND actor.active IS NOT FALSE
        JOIN users workspace ON workspace.id = ${workspaceId} AND workspace.role = ${context.workspaceUser.role} AND workspace.active IS NOT FALSE
        WHERE di.id = ${id} AND di.updated_at = ${source.version}::timestamptz
          AND (di.owner_user_id = ${workspaceId} OR di.assigned_user_id = ${workspaceId}
            OR EXISTS (SELECT 1 FROM discussion_item_participants dip WHERE dip.discussion_item_id = di.id AND dip.user_id = ${workspaceId}))
          AND (di.owner_user_id = target.id OR di.assigned_user_id = target.id
            OR EXISTS (SELECT 1 FROM discussion_item_participants dip WHERE dip.discussion_item_id = di.id AND dip.user_id = target.id))
          AND ((${topic.key === "general"} AND NOT EXISTS (
            SELECT 1 FROM constituents c WHERE c.id = di.constituent_id
              OR c.id = (SELECT p.constituent_id FROM prospects p WHERE p.id = di.prospect_id)
              OR EXISTS (SELECT 1 FROM discussion_item_constituents dic WHERE dic.discussion_item_id = di.id AND dic.constituent_id = c.id)
          )) OR EXISTS (
            SELECT 1 FROM constituents c WHERE c.id = ${topic.constituent_id || null}
              AND c.blackbaud_constituent_id IS NOT DISTINCT FROM ${topic.blackbaud_constituent_id || null}
              AND c.name IS NOT DISTINCT FROM ${topic.name}
              AND (c.blackbaud_constituent_id IS NOT NULL OR c.user_id = target.id)
              AND (c.id = di.constituent_id OR c.id = (SELECT p.constituent_id FROM prospects p WHERE p.id = di.prospect_id)
                OR EXISTS (SELECT 1 FROM discussion_item_constituents dic WHERE dic.discussion_item_id = di.id AND dic.constituent_id = c.id))
          ))
      ), existing_task AS (
        SELECT pa.* FROM pending_actions pa JOIN eligible e ON e.id = pa.source_discussion_id
        WHERE pa.owner_user_id = ${owner.id} AND pa.source_topic_key = ${topic.key}
      ), existing_constituent AS (
        SELECT c.id FROM constituents c WHERE c.user_id = ${owner.id}
          AND ((${topic.blackbaud_constituent_id || null}::text IS NOT NULL AND c.blackbaud_constituent_id = ${topic.blackbaud_constituent_id || null})
            OR (${topic.blackbaud_constituent_id || null}::text IS NULL AND c.id = ${topic.constituent_id || null}))
        ORDER BY c.id LIMIT 1
      ), new_constituent AS (
        INSERT INTO constituents (user_id, name, normalized_name, blackbaud_constituent_id)
        SELECT ${owner.id}, ${topic.name}, LOWER(${topic.name}), ${topic.blackbaud_constituent_id || null}
        FROM eligible WHERE ${Boolean(topic.blackbaud_constituent_id)}
          AND NOT EXISTS (SELECT 1 FROM existing_constituent) AND NOT EXISTS (SELECT 1 FROM existing_task)
        RETURNING id
      ), local_constituent AS (
        SELECT id FROM existing_constituent UNION ALL SELECT id FROM new_constituent
      ), target_prospect AS (
        SELECT p.id FROM prospects p WHERE p.user_id = ${owner.id}
          AND (p.constituent_id = (SELECT id FROM local_constituent)
            OR (${topic.blackbaud_constituent_id || null}::text IS NOT NULL AND p.blackbaud_constituent_id = ${topic.blackbaud_constituent_id || null}
              AND (p.constituent_id IS NULL OR p.constituent_id = (SELECT id FROM local_constituent))))
        ORDER BY (p.id = ${source.prospect_id || null}) DESC NULLS LAST, (p.status = 'Active') DESC, p.id LIMIT 1
      ), inserted AS (
        INSERT INTO pending_actions (owner_user_id, entered_by_user_id, title, details, due_date,
          constituent_id, prospect_id, prospect_opportunity_id, category, status, is_primary,
          needs_discussion, discussion_item_id, source_discussion_id, source_topic_key)
        SELECT ${owner.id}, ${context.sessionUser.id}, ${draft.title.trim()}, ${draft.details?.trim() || null}, ${draft.dueDate || null}::date,
          (SELECT id FROM local_constituent), (SELECT id FROM target_prospect),
          (SELECT po.id FROM prospect_opportunities po WHERE po.id = e.prospect_opportunity_id AND po.prospect_id = (SELECT id FROM target_prospect)),
          'General', 'Open', FALSE, FALSE, e.id, e.id, ${topic.key}
        FROM eligible e WHERE NOT EXISTS (SELECT 1 FROM existing_task)
        ON CONFLICT (source_discussion_id, owner_user_id, source_topic_key) WHERE source_discussion_id IS NOT NULL DO NOTHING
        RETURNING *
      )
      SELECT id, owner_user_id, status, due_date, source_topic_key, FALSE AS already_exists FROM inserted
      UNION ALL
      SELECT id, owner_user_id, status, due_date, source_topic_key, TRUE AS already_exists FROM existing_task
    `,
  ]);
  return results[1]?.[0] || null;
}
