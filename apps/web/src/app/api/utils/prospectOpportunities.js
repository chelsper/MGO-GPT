import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  normalizeConstituentName,
  resolveConstituent,
} from "@/app/api/utils/constituents";

export const FUNDED_OPPORTUNITY_STAGE = "Funded";
export const DECLINED_OPPORTUNITY_STAGE = "Declined";
export const ACTIVE_OPPORTUNITY_STATUS = "Active";
export const FUNDED_OPPORTUNITY_STATUS = "Closed – Gift Secured";
export const DECLINED_OPPORTUNITY_STATUS = "Closed – Declined";

export function normalizeOpportunityStatusLabel(value) {
  return String(value || "")
    .trim()
    .replace(/\s*[–—-]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isFundedOpportunityStage(value) {
  const normalized = normalizeOpportunityStatusLabel(value);
  return normalized === "funded" || normalized === "closed - gift secured";
}

export function isDeclinedOpportunityStage(value) {
  const normalized = normalizeOpportunityStatusLabel(value);
  return normalized === "declined" || normalized === "closed - declined";
}

export function getOpportunityStatusForStage(stage) {
  if (isFundedOpportunityStage(stage)) {
    return FUNDED_OPPORTUNITY_STATUS;
  }
  if (isDeclinedOpportunityStage(stage)) {
    return DECLINED_OPPORTUNITY_STATUS;
  }
  return ACTIVE_OPPORTUNITY_STATUS;
}

export function getOpportunityStageForStatus(status, fallbackStage = "Identification") {
  if (isFundedOpportunityStage(status)) {
    return FUNDED_OPPORTUNITY_STAGE;
  }
  if (isDeclinedOpportunityStage(status)) {
    return DECLINED_OPPORTUNITY_STAGE;
  }
  return fallbackStage || "Identification";
}

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
        (${constituentId || null}::BIGINT IS NOT NULL AND constituent_id = ${constituentId || null}::BIGINT)
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
    SELECT
      po.*,
      COALESCE(gift_links.linked_gifts, '[]'::json) AS linked_gifts
    FROM prospect_opportunities po
    LEFT JOIN LATERAL (
      SELECT json_agg(
        json_build_object(
          'id', pogl.id,
          'blackbaud_gift_id', pogl.blackbaud_gift_id,
          'gift_date', pogl.gift_date,
          'gift_amount', pogl.gift_amount,
          'gift_type', pogl.gift_type,
          'gift_fund', pogl.gift_fund,
          'applied_amount', pogl.applied_amount,
          'nxt_sync_state', pogl.nxt_sync_state,
          'nxt_sync_error', pogl.nxt_sync_error,
          'created_at', pogl.created_at,
          'updated_at', pogl.updated_at
        )
        ORDER BY pogl.gift_date DESC NULLS LAST, pogl.created_at DESC
      ) AS linked_gifts
      FROM prospect_opportunity_gift_links pogl
      WHERE pogl.prospect_opportunity_id = po.id
    ) gift_links ON true
    WHERE po.prospect_id = ${prospectId}
    ORDER BY
      CASE WHEN po.opportunity_status = 'Active' THEN 0 ELSE 1 END,
      po.updated_at DESC,
      po.created_at DESC
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

  const statuses = await sql`
    SELECT
      COUNT(*) FILTER (WHERE opportunity_status = 'Active') AS active_count,
      COUNT(*) FILTER (WHERE opportunity_status = 'Closed – Gift Secured') AS secured_count,
      COUNT(*) FILTER (WHERE opportunity_status = 'Closed – Declined') AS declined_count,
      COALESCE(SUM(COALESCE(closed_amount, 0)) FILTER (WHERE opportunity_status = 'Closed – Gift Secured'), 0) AS closed_total,
      MAX(close_date) FILTER (
        WHERE opportunity_status IN ('Closed – Gift Secured', 'Closed – Declined')
      ) AS latest_close_date
    FROM prospect_opportunities
    WHERE prospect_id = ${prospectId}
  `;

  const activeCount = Number(statuses[0]?.active_count || 0);
  const securedCount = Number(statuses[0]?.secured_count || 0);
  const declinedCount = Number(statuses[0]?.declined_count || 0);
  const closedTotal = parseFloat(statuses[0]?.closed_total) || 0;
  const latestCloseDate = statuses[0]?.latest_close_date || null;

  let nextStatus = "Active";
  let nextClosedAmount = securedCount > 0 ? closedTotal : null;
  let nextCloseDate = null;

  if (activeCount === 0 && securedCount > 0 && declinedCount === 0) {
    nextStatus = "Closed – Gift Secured";
    nextCloseDate = latestCloseDate;
  } else if (activeCount === 0 && declinedCount > 0 && securedCount === 0) {
    nextStatus = "Closed – Declined";
    nextClosedAmount = null;
    nextCloseDate = latestCloseDate;
  }

  const result = await sql`
    UPDATE prospects
    SET
      ask_amount = ${totalPipeline},
      status = ${nextStatus},
      closed_amount = ${nextClosedAmount},
      close_date = ${nextCloseDate},
      decline_reason = CASE
        WHEN ${nextStatus} = 'Active' OR ${nextStatus} = 'Closed – Gift Secured'
          THEN NULL
        ELSE decline_reason
      END,
      updated_at = NOW()
    WHERE id = ${prospectId}
    RETURNING *
  `;

  return result[0] || null;
}

export function getFiscalYearFromExpectedDate(expectedDate) {
  if (!expectedDate) {
    const now = new Date();
    const fiscalYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
    return `FY${String(fiscalYear).slice(-2)}`;
  }

  const parsedDate = new Date(expectedDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return getFiscalYearFromExpectedDate(null);
  }

  const fiscalYear =
    parsedDate.getUTCMonth() >= 6
      ? parsedDate.getUTCFullYear() + 1
      : parsedDate.getUTCFullYear();
  return `FY${String(fiscalYear).slice(-2)}`;
}

async function findOrCreateProspectForUser({
  userId,
  donorName,
  blackbaudConstituentId,
  askAmount,
  expectedDate,
}) {
  await ensureAppSchema();

  const constituent = await resolveConstituent({
    userId,
    name: donorName,
    blackbaudConstituentId,
    createNew: true,
  });

  const existingRows = await sql`
    SELECT
      p.*,
      c.blackbaud_constituent_id AS linked_blackbaud_constituent_id
    FROM prospects p
    LEFT JOIN constituents c ON c.id = p.constituent_id
    WHERE
      p.user_id = ${userId}
      AND (
        (${constituent?.id || null}::BIGINT IS NOT NULL AND p.constituent_id = ${constituent?.id || null}::BIGINT)
        OR (
          ${blackbaudConstituentId || null}::TEXT IS NOT NULL
          AND c.blackbaud_constituent_id = ${blackbaudConstituentId || null}::TEXT
        )
        OR (
          ${normalizeConstituentName(donorName)} <> ''
          AND LOWER(TRIM(REGEXP_REPLACE(p.prospect_name, '\s+', ' ', 'g'))) = ${normalizeConstituentName(
            donorName,
          )}
        )
      )
    ORDER BY
      CASE WHEN p.status = 'Active' THEN 0 ELSE 1 END,
      p.updated_at DESC,
      p.created_at DESC
    LIMIT 1
  `;

  if (existingRows[0]) {
    return existingRows[0];
  }

  const maxOrderRows = await sql`
    SELECT COALESCE(MAX(priority_order), 0) AS max_order
    FROM prospects
    WHERE user_id = ${userId} AND status = 'Active'
  `;

  const insertedRows = await sql`
    INSERT INTO prospects (
      user_id,
      constituent_id,
      prospect_name,
      expected_close_fy,
      ask_amount,
      ask_type,
      priority_order
    ) VALUES (
      ${userId},
      ${constituent?.id || null},
      ${donorName},
      ${getFiscalYearFromExpectedDate(expectedDate)},
      ${askAmount ?? null},
      'Major Gift',
      ${(maxOrderRows[0]?.max_order || 0) + 1}
    )
    RETURNING *
  `;

  return insertedRows[0] || null;
}

export async function saveProspectOpportunity({
  userId,
  prospectId,
  constituentId,
  opportunityId,
  blackbaudOpportunityId = null,
  title,
  purpose,
  currentStage,
  opportunityStatus,
  askAmount,
  askDate,
  expectedDate,
  latestNotes,
  submissionId,
  jointMgoUserIds = [],
  sharedOpportunityKey = null,
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
    const stageSource =
      opportunityStatus ?? currentStage ?? existing.opportunity_status;
    const nextStage = getOpportunityStageForStatus(
      stageSource,
      currentStage || existing.current_stage,
    );
    const nextOpportunityStatus = getOpportunityStatusForStage(nextStage);
    const nextCloseDate =
      nextOpportunityStatus === ACTIVE_OPPORTUNITY_STATUS
        ? null
        : existing.close_date || new Date().toISOString().slice(0, 10);
    const nextClosedAmount =
      nextOpportunityStatus === FUNDED_OPPORTUNITY_STATUS
        ? askAmount ?? existing.closed_amount ?? existing.estimated_amount ?? 0
        : nextOpportunityStatus === DECLINED_OPPORTUNITY_STATUS
          ? 0
          : null;

    const updatedRows = await sql`
      UPDATE prospect_opportunities
      SET
        blackbaud_opportunity_id = COALESCE(${blackbaudOpportunityId}, blackbaud_opportunity_id),
        title = ${title || existing.title},
        purpose = ${purpose || existing.purpose},
        current_stage = ${nextStage},
        opportunity_status = ${nextOpportunityStatus},
        estimated_amount = ${askAmount ?? existing.estimated_amount},
        ask_date = ${askDate || existing.ask_date},
        expected_date = ${expectedDate || existing.expected_date},
        latest_notes = ${
          latestNotes && latestNotes.trim()
            ? latestNotes.trim()
            : existing.latest_notes
        },
        joint_mgo_user_ids = ${JSON.stringify(jointMgoUserIds)},
        shared_opportunity_key = ${sharedOpportunityKey || existing.shared_opportunity_key},
        last_submission_id = ${submissionId || existing.last_submission_id},
        constituent_id = ${constituentId || existing.constituent_id},
        closed_amount = ${nextClosedAmount},
        close_date = ${nextCloseDate},
        decline_reason = CASE
          WHEN ${nextOpportunityStatus} = ${DECLINED_OPPORTUNITY_STATUS}
            THEN COALESCE(decline_reason, 'Declined')
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE id = ${existing.id}
      RETURNING *
    `;
    opportunity = updatedRows[0] || null;
  } else {
    const nextStage = getOpportunityStageForStatus(
      opportunityStatus,
      currentStage || "Identification",
    );
    const nextOpportunityStatus = getOpportunityStatusForStage(nextStage);
    const nextCloseDate =
      nextOpportunityStatus === ACTIVE_OPPORTUNITY_STATUS
        ? null
        : new Date().toISOString().slice(0, 10);
    const nextClosedAmount =
      nextOpportunityStatus === FUNDED_OPPORTUNITY_STATUS
        ? askAmount ?? 0
        : nextOpportunityStatus === DECLINED_OPPORTUNITY_STATUS
          ? 0
          : null;
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
        blackbaud_opportunity_id,
        title,
        purpose,
        current_stage,
        opportunity_status,
        estimated_amount,
        ask_date,
        expected_date,
        latest_notes,
        joint_mgo_user_ids,
        shared_opportunity_key,
        last_submission_id
      ) VALUES (
        ${prospect.id},
        ${constituentId || prospect.constituent_id || null},
        ${blackbaudOpportunityId},
        ${defaultTitle},
        ${purpose?.trim() || null},
        ${nextStage},
        ${nextOpportunityStatus},
        ${askAmount ?? null},
        ${askDate || null},
        ${expectedDate || null},
        ${latestNotes?.trim() || null},
        ${JSON.stringify(jointMgoUserIds)},
        ${sharedOpportunityKey || null},
        ${submissionId || null}
      )
      RETURNING *
    `;
    if (nextCloseDate || nextClosedAmount != null) {
      const closedRows = await sql`
        UPDATE prospect_opportunities
        SET
          closed_amount = ${nextClosedAmount},
          close_date = ${nextCloseDate},
          decline_reason = CASE
            WHEN ${nextOpportunityStatus} = ${DECLINED_OPPORTUNITY_STATUS}
              THEN 'Declined'
            ELSE NULL
          END,
          updated_at = NOW()
        WHERE id = ${insertedRows[0]?.id || null}
        RETURNING *
      `;
      opportunity = closedRows[0] || insertedRows[0] || null;
    } else {
      opportunity = insertedRows[0] || null;
    }
  }

  await syncProspectAskAmount(prospect.id);

  return {
    prospectId: prospect.id,
    opportunity,
  };
}

export async function syncJointSolicitationOpportunities({
  ownerUserId,
  jointUserIds,
  donorName,
  blackbaudConstituentId,
  title,
  purpose,
  currentStage,
  opportunityStatus,
  askAmount,
  askDate,
  expectedDate,
  latestNotes,
  submissionId,
  sharedOpportunityKey,
}) {
  await ensureAppSchema();

  const uniqueUserIds = Array.from(
    new Set(
      (jointUserIds || [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0 && value !== Number(ownerUserId)),
    ),
  );

  const createdLinks = [];

  for (const userId of uniqueUserIds) {
    const prospect = await findOrCreateProspectForUser({
      userId,
      donorName,
      blackbaudConstituentId,
      askAmount,
      expectedDate,
    });

    if (!prospect) continue;

    const existingRows = await sql`
      SELECT po.*
      FROM prospect_opportunities po
      INNER JOIN prospects p ON p.id = po.prospect_id
      WHERE
        p.user_id = ${userId}
        AND po.prospect_id = ${prospect.id}
        AND (
          (${sharedOpportunityKey || null}::TEXT IS NOT NULL AND po.shared_opportunity_key = ${sharedOpportunityKey || null}::TEXT)
          OR (
            ${sharedOpportunityKey || null}::TEXT IS NULL
            AND LOWER(TRIM(po.title)) = LOWER(TRIM(${title || ""}))
          )
        )
      ORDER BY po.updated_at DESC, po.created_at DESC
      LIMIT 1
    `;

    const linkedOpportunity = await saveProspectOpportunity({
      userId,
      prospectId: prospect.id,
      constituentId: prospect.constituent_id || null,
      opportunityId: existingRows[0]?.id || null,
      title,
      purpose,
      currentStage,
      opportunityStatus,
      askAmount,
      askDate,
      expectedDate,
      latestNotes,
      submissionId,
      jointMgoUserIds: [ownerUserId, ...uniqueUserIds],
      sharedOpportunityKey,
    });

    createdLinks.push({
      userId,
      prospectId: prospect.id,
      opportunityId: linkedOpportunity.opportunity?.id || null,
    });
  }

  return createdLinks;
}
