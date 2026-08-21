import sql from "@/app/api/utils/sql";

export async function clearUserPortfolioCache(userId) {
  if (!userId) return;

  await sql`
    UPDATE users
    SET
      blackbaud_portfolio_cache = NULL,
      blackbaud_portfolio_cache_key = NULL,
      blackbaud_portfolio_cached_at = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function clearUserProspectsSummaryCache(userId) {
  if (!userId) return;

  await sql`
    UPDATE users
    SET
      blackbaud_summary_cache = NULL,
      blackbaud_summary_cache_key = NULL,
      blackbaud_summary_cached_at = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function clearUserDashboardDataCaches(userId) {
  if (!userId) return;

  // Local prospects and pending actions affect dashboard summaries, but not
  // the NXT fundraiser-assignment snapshot. Preserve the latter so a local
  // edit cannot make the portfolio appear empty during a provider outage.
  await sql`
    UPDATE users
    SET
      blackbaud_summary_cache = NULL,
      blackbaud_summary_cache_key = NULL,
      blackbaud_summary_cached_at = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function clearAllDashboardDataCaches() {
  // The scheduled report refresh updates local dashboard/report snapshots. It
  // does not change NXT fundraiser assignments, so preserve each user's last
  // successful portfolio snapshot instead of forcing live provider calls.
  await sql`
    UPDATE users
    SET
      blackbaud_summary_cache = NULL,
      blackbaud_summary_cache_key = NULL,
      blackbaud_summary_cached_at = NULL,
      updated_at = NOW()
    WHERE blackbaud_summary_cache IS NOT NULL
       OR blackbaud_summary_cache_key IS NOT NULL
       OR blackbaud_summary_cached_at IS NOT NULL
  `;
}
