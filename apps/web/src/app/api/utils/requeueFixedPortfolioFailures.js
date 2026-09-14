import sql from "./sql";

export default async function requeueFixedPortfolioFailures(jobId) {
  // Only retry the pre-fix schema error. New failures use a different stage/status,
  // so a persisting failure cannot enter an automatic retry loop.
  return sql`
    UPDATE portfolio_refresh_items
    SET status = 'pending', stage = 'fixed_proposal_query_retry',
      completed_at = NULL, updated_at = NOW()
    WHERE job_id = ${jobId} AND status = 'failed'
      AND stage = 'blackbaud_retrieval' AND http_status = 200
      AND error_message = 'column po.opportunity_title does not exist'
    RETURNING id
  `;
}
