import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import { normalizeConstituentName } from "@/app/api/utils/constituents";

export async function findLinkedProspectForUser({
  userId,
  constituentId,
  name,
}) {
  await ensureAppSchema();

  const normalizedName = normalizeConstituentName(name);

  const result = await sql`
    SELECT *
    FROM prospects
    WHERE
      user_id = ${userId}
      AND (
        (${constituentId || null} IS NOT NULL AND constituent_id = ${constituentId || null})
        OR (
          ${normalizedName} <> ''
          AND LOWER(TRIM(REGEXP_REPLACE(prospect_name, '\s+', ' ', 'g'))) = ${normalizedName}
        )
      )
    ORDER BY
      CASE WHEN status = 'Active' THEN 0 ELSE 1 END,
      updated_at DESC,
      created_at DESC
    LIMIT 1
  `;

  return result[0] || null;
}

export async function getProspectOpportunities(prospectId) {
  await ensureAppSchema();

  return sql`
    SELECT *
    FROM prospect_opportunities
    WHERE prospect_id = ${prospectId}
    ORDER BY
      CASE WHEN opportunity_status = 'Active' THEN 0 ELSE 1 END,
      updated_at DESC,
      created_at DESC
  `;
}

export async function getLinkedProspectContext({ userId, constituentId, name }) {
  const prospect = await findLinkedProspectForUser({ userId, constituentId, name });

  if (!prospect) {
    return { prospect: null, opportunities: [] };
  }

  const opportunities = await getProspectOpportunities(prospect.id);
  return { prospect, opportunities };
}

export async function syncProspectAskAmount(prospectId) {
  await ensureAppSchema();

  const totals = await sql`
    SELECT COALESCE(SUM(COALESCE(estimated_amount, 0)), 0) AS total_pipeline
    FROM prospect_opportunities
    WHERE prospect_id = ${prospectId} AND opportunity_status = 'Active'
  `;

  const totalPipeline = parseFloat(totals[0]?.total_pipeline) || 0;

  const result = await sql`
    UPDATE prospects
    SET ask_amount = ${totalPipeline}, updated_at = NOW()
    WHERE id = ${prospectId}
    RETURNING *
  `;

  return result[0] || null;
}

export async function saveProspectOpportunity({
  userId,
  prospectId,
  constituentId,
  opportunityId,
  title,
  currentStage,
  estimatedAmount,
  latestNotes,
  submissionId,
}) {
  await ensureAppSchema();

  const prospectRows = await sql`
    SELECT *
    FROM prospects
    WHERE id = ${prospectId} AND user_id = ${userId}
    LIMIT 1
  `;

  const prospect = prospectRows[0] || null;
  if (!prospect) {
    throw new Error("Linked prospect could not be found.");
  }

  let opportunity;

  if (opportunityId) {
    const existingRows = await sql`
      SELECT po.*
      FROM prospect_opportunities po
      INNER JOIN prospects p ON p.id = po.prospect_id
      WHERE po.id = ${opportunityId} AND p.user_id = ${userId}
      LIMIT 1
    `;

    const existing = existingRows[0] || null;
    if (!existing) {
      throw new Error("Linked opportunity could not be found.");
    }

    const updatedRows = await sql`
      UPDATE prospect_opportunities
      SET
        title = ${title || existing.title},
        current_stage = ${currentStage || existing.current_stage},
        estimated_amount = ${estimatedAmount ?? existing.estimated_amount},
        latest_notes = ${
          latestNotes && latestNotes.trim()
            ? latestNotes.trim()
            : existing.latest_notes
        },
        last_submission_id = ${submissionId || existing.last_submission_id},
        constituent_id = ${constituentId || existing.constituent_id},
        updated_at = NOW()
      WHERE id = ${existing.id}
      RETURNING *
    `;
    opportunity = updatedRows[0] || null;
  } else {
    const defaultTitle =
      title?.trim() ||
      `${prospect.prospect_name} opportunity ${new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}`;

    const insertedRows = await sql`
      INSERT INTO prospect_opportunities (
        prospect_id,
        constituent_id,
        title,
        current_stage,
        opportunity_status,
        estimated_amount,
        latest_notes,
        last_submission_id
      ) VALUES (
        ${prospect.id},
        ${constituentId || prospect.constituent_id || null},
        ${defaultTitle},
        ${currentStage},
        'Active',
        ${estimatedAmount ?? null},
        ${latestNotes?.trim() || null},
        ${submissionId || null}
      )
      RETURNING *
    `;
    opportunity = insertedRows[0] || null;
  }

  await syncProspectAskAmount(prospect.id);

  return {
    prospectId: prospect.id,
    opportunity,
  };
}
