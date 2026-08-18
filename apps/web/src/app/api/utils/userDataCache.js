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

  await sql`
    UPDATE users
    SET
      blackbaud_portfolio_cache = NULL,
      blackbaud_portfolio_cache_key = NULL,
      blackbaud_portfolio_cached_at = NULL,
      blackbaud_summary_cache = NULL,
      blackbaud_summary_cache_key = NULL,
      blackbaud_summary_cached_at = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function clearAllDashboardDataCaches() {
  await sql`
    UPDATE users
    SET
      blackbaud_portfolio_cache = NULL,
      blackbaud_portfolio_cache_key = NULL,
      blackbaud_portfolio_cached_at = NULL,
      blackbaud_summary_cache = NULL,
      blackbaud_summary_cache_key = NULL,
      blackbaud_summary_cached_at = NULL,
      updated_at = NOW()
    WHERE blackbaud_portfolio_cache IS NOT NULL
       OR blackbaud_portfolio_cache_key IS NOT NULL
       OR blackbaud_portfolio_cached_at IS NOT NULL
       OR blackbaud_summary_cache IS NOT NULL
       OR blackbaud_summary_cache_key IS NOT NULL
       OR blackbaud_summary_cached_at IS NOT NULL
  `;
}
