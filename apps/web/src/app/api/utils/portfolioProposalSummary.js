import sql from "./sql";

export default async function loadProposalSummary({ workspaceUserId, constituentId, currentFYNumber }) {
  try {
    return await sql`
      WITH proposals AS (
        SELECT
          p.prospect_name,
          p.ask_amount,
          CASE WHEN po.expected_date IS NOT NULL
            THEN 'FY' || RIGHT(EXTRACT(YEAR FROM po.expected_date + INTERVAL '6 months')::text, 2)
            ELSE p.expected_close_fy
          END AS expected_close_fy,
          po.title AS opportunity_title,
          po.current_stage,
          p.ask_type,
          po.estimated_amount
        FROM prospects p
        LEFT JOIN constituents c ON c.id = p.constituent_id
        LEFT JOIN prospect_opportunities po ON po.prospect_id = p.id
        WHERE p.user_id = ${workspaceUserId}
          AND COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id) = ${constituentId}
          AND COALESCE(po.opportunity_status, 'Active') = 'Active'
          AND LOWER(COALESCE(po.current_stage, p.ask_type, '')) IN ('solicitation', 'cultivation', 'solicitation - verbal')
      )
      SELECT * FROM proposals
      WHERE CAST(NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(expected_close_fy, ''), '[^0-9]', '', 'g'), 2), '') AS INTEGER) >= ${currentFYNumber}
      ORDER BY
        CAST(NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(expected_close_fy, ''), '[^0-9]', '', 'g'), 2), '') AS INTEGER) ASC,
        COALESCE(estimated_amount, ask_amount, 0) DESC
      LIMIT 3
    `;
  } catch (error) {
    // This is a local database step, not a failed Blackbaud request.
    error.stage = "proposal_summary";
    throw error;
  }
}
