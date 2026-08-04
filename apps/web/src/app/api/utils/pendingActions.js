import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import sql from "@/app/api/utils/sql";

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

export async function syncPrimaryPendingAction({
  ownerUserId,
  prospectId,
  constituentId = null,
  prospectOpportunityId = null,
  title,
  details = null,
  dueDate = null,
  category = "General",
  completedAt = null,
  needsDiscussion = false,
  discussionNote = null,
}) {
  await ensureAppSchema();

  const normalizedTitle = normalizeText(title);
  const normalizedDetails = normalizeText(details);
  const normalizedDiscussionNote = normalizeText(discussionNote);
  const normalizedDueDate = dueDate || null;
  const normalizedCompletedAt = completedAt || null;
  const normalizedCategory = normalizeText(category) || "General";

  const existingRows = await sql`
    SELECT *
    FROM pending_actions
    WHERE owner_user_id = ${ownerUserId}
      AND prospect_id = ${prospectId}
      AND is_primary = TRUE
    ORDER BY
      CASE WHEN status = 'Open' THEN 0 ELSE 1 END,
      updated_at DESC
    LIMIT 1
  `;

  const existing = existingRows[0] || null;

  if (!normalizedTitle) {
    if (!existing) return null;

    const rows = await sql`
      UPDATE pending_actions
      SET
        status = 'Done',
        completed_at = COALESCE(${normalizedCompletedAt}, completed_at, NOW()),
        updated_at = NOW()
      WHERE id = ${existing.id}
      RETURNING *
    `;

    return rows[0] || null;
  }

  await sql`
    UPDATE pending_actions
    SET is_primary = FALSE
    WHERE owner_user_id = ${ownerUserId}
      AND prospect_id = ${prospectId}
      AND id <> COALESCE(${existing?.id || null}, 0)
  `;

  if (existing) {
    const rows = await sql`
      UPDATE pending_actions
      SET
        constituent_id = COALESCE(${constituentId}, constituent_id),
        prospect_opportunity_id = COALESCE(${prospectOpportunityId}, prospect_opportunity_id),
        title = ${normalizedTitle},
        details = ${normalizedDetails},
        due_date = ${normalizedDueDate},
        category = ${normalizedCategory},
        status = ${normalizedCompletedAt ? "Done" : "Open"},
        is_primary = TRUE,
        needs_discussion = ${Boolean(needsDiscussion)},
        discussion_note = ${normalizedDiscussionNote},
        completed_at = ${normalizedCompletedAt},
        updated_at = NOW()
      WHERE id = ${existing.id}
      RETURNING *
    `;

    return rows[0] || null;
  }

  const rows = await sql`
    INSERT INTO pending_actions (
      owner_user_id,
      prospect_id,
      constituent_id,
      prospect_opportunity_id,
      title,
      details,
      due_date,
      category,
      status,
      is_primary,
      needs_discussion,
      discussion_note,
      completed_at
    ) VALUES (
      ${ownerUserId},
      ${prospectId},
      ${constituentId},
      ${prospectOpportunityId},
      ${normalizedTitle},
      ${normalizedDetails},
      ${normalizedDueDate},
      ${normalizedCategory},
      ${normalizedCompletedAt ? "Done" : "Open"},
      TRUE,
      ${Boolean(needsDiscussion)},
      ${normalizedDiscussionNote},
      ${normalizedCompletedAt}
    )
    RETURNING *
  `;

  return rows[0] || null;
}

export async function getPendingActionsForProspect({ ownerUserId, prospectId, constituentId }) {
  await ensureAppSchema();

  return sql`
    SELECT
      pa.*,
      assigned_user.name AS owner_user_name,
      po.title AS opportunity_title,
      di.status AS discussion_status,
      di.subject AS discussion_subject
    FROM pending_actions pa
    LEFT JOIN users assigned_user ON assigned_user.id = pa.owner_user_id
    LEFT JOIN prospect_opportunities po ON po.id = pa.prospect_opportunity_id
    LEFT JOIN discussion_items di ON di.id = pa.discussion_item_id
    WHERE pa.owner_user_id = ${ownerUserId}
      AND (
        pa.prospect_id = ${prospectId}
        OR (${constituentId || null}::BIGINT IS NOT NULL AND pa.constituent_id = ${constituentId || null})
      )
    ORDER BY
      CASE WHEN pa.status = 'Open' THEN 0 ELSE 1 END,
      CASE WHEN pa.is_primary THEN 0 ELSE 1 END,
      pa.due_date ASC NULLS LAST,
      pa.updated_at DESC
  `;
}

export async function syncPendingActionDiscussion({
  ownerUserId,
  createdByUserId,
  pendingActionId,
  prospectId = null,
  constituentId = null,
  title,
  dueDate = null,
  needsDiscussion = false,
  discussionNote = null,
  existingDiscussionItemId = null,
}) {
  await ensureAppSchema();

  const normalizedTitle = normalizeText(title);
  const normalizedDiscussionNote = normalizeText(discussionNote);

  if (!pendingActionId || !normalizedTitle) {
    return null;
  }

  if (!needsDiscussion) {
    if (existingDiscussionItemId) {
      await sql`
        UPDATE discussion_items
        SET
          status = 'Resolved',
          updated_at = NOW()
        WHERE id = ${existingDiscussionItemId}
          AND owner_user_id = ${ownerUserId}
      `;
    }

    await sql`
      UPDATE pending_actions
      SET discussion_item_id = NULL
      WHERE id = ${pendingActionId}
        AND owner_user_id = ${ownerUserId}
    `;

    return null;
  }

  if (existingDiscussionItemId) {
    const updatedRows = await sql`
      UPDATE discussion_items
      SET
        subject = ${normalizedTitle},
        body = ${normalizedDiscussionNote || "Pending action flagged for discussion."},
        due_date = ${dueDate || null},
        status = 'Open',
        updated_at = NOW()
      WHERE id = ${existingDiscussionItemId}
        AND owner_user_id = ${ownerUserId}
      RETURNING id
    `;

    if (updatedRows[0]?.id) {
      return updatedRows[0].id;
    }
  }

  const createdRows = await sql`
    INSERT INTO discussion_items (
      owner_user_id,
      created_by,
      prospect_id,
      constituent_id,
      subject,
      body,
      due_date,
      status,
      created_at,
      updated_at
    ) VALUES (
      ${ownerUserId},
      ${createdByUserId || ownerUserId},
      ${prospectId || null},
      ${constituentId || null},
      ${normalizedTitle},
      ${normalizedDiscussionNote || "Pending action flagged for discussion."},
      ${dueDate || null},
      'Open',
      NOW(),
      NOW()
    )
    RETURNING id
  `;

  const discussionItemId = createdRows[0]?.id || null;

  if (discussionItemId) {
    await sql`
      UPDATE pending_actions
      SET discussion_item_id = ${discussionItemId}
      WHERE id = ${pendingActionId}
        AND owner_user_id = ${ownerUserId}
    `;
  }

  return discussionItemId;
}
