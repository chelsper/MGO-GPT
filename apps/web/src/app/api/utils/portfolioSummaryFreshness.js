export const PORTFOLIO_SUMMARY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getPortfolioSummaryStaleAfter(payload, now = Date.now()) {
  const refreshedAt = Date.parse(payload?.summaryRefreshedAt || "");
  return new Date((Number.isFinite(refreshedAt) ? refreshedAt : now) + PORTFOLIO_SUMMARY_TTL_MS).toISOString();
}

export function isPortfolioSummaryCurrent(snapshot, now = Date.now()) {
  return snapshot?.data_complete === true && Boolean(snapshot?.summary_payload) &&
    !snapshot?.last_error_stage && Date.parse(snapshot?.stale_after || "") > now;
}

export function isPortfolioGivingCurrent(snapshot, now = Date.now()) {
  return Boolean(snapshot?.giving_payload) && Date.parse(snapshot?.giving_stale_after || "") > now;
}

export function selectPortfolioRefreshIds(ids, snapshots, mode, now = Date.now()) {
  if (mode === "full") return ids;
  const byId = new Map(snapshots.map((row) => [String(row.constituent_id), row]));
  return ids.filter((id) => {
    const row = byId.get(id);
    return !isPortfolioSummaryCurrent(row, now) ||
      (mode === "nightly" && !isPortfolioGivingCurrent(row, now));
  }).sort((a, b) => {
    const priority = (id) => {
      const row = byId.get(id);
      return !row?.summary_payload || row?.last_error_stage || row?.data_complete === false ? 0
        : mode === "nightly" && !row?.giving_payload ? 1 : 2;
    };
    const dueAt = (id) => {
      const row = byId.get(id);
      const deadlines = [!isPortfolioSummaryCurrent(row, now) ? row?.stale_after : null,
        mode === "nightly" && !isPortfolioGivingCurrent(row, now) ? row?.giving_stale_after : null]
        .filter(Boolean).map(Date.parse).filter(Number.isFinite);
      return deadlines.length ? Math.min(...deadlines) : 0;
    };
    return priority(a) - priority(b) || dueAt(a) - dueAt(b);
  });
}

export function hasPortfolioSummaryChanges(summary, giving) {
  if (!summary?.mapped || !giving?.mapped) return false;
  // Compare inputs, not freshness timestamps: unchanged donors stay weekly.
  return ["lifetimeGiving", "proposalSummary"].some((field) =>
    JSON.stringify(summary.mapped[field]) !== JSON.stringify(giving.mapped[field]));
}
