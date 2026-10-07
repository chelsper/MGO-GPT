export const LEGACY_CAMPAIGN_IMPORT_ERROR = "The query has conflicting duplicate gift allocations or more than 2,000 funds. Check its output fields; the previous dataset is unchanged.";

export function campaignImportIssue(counts, giftIds = [], mode = "split", rawRows) {
  if (counts.conflicts > 0) {
    const count = Number(counts.conflicts), label = mode === "gift" ? "gift" : "gift allocation";
    const ids = [...new Set(giftIds)].filter(id => /^[1-9]\d{0,18}$/.test(id)).slice(0, 5);
    const funds = Number(counts.funds);
    return `${count.toLocaleString("en-US")} ${label}${count === 1 ? " has" : "s have"} conflicting query rows.${ids.length ? ` Gift system record IDs to check: ${ids.join(", ")}.` : ""} Review these gifts' funds, amounts, and mapped output fields; the app has not chosen one row or counted both. ${funds.toLocaleString("en-US")} fund${funds === 1 ? " was" : "s were"} found${funds <= 2000 ? ", below the 2,000-fund limit" : ", also above the 2,000-fund limit"}. No new totals were published; any previous complete results remain unchanged.`;
  }
  if (counts.funds > 2000) return `The query contains ${Number(counts.funds).toLocaleString("en-US")} funds; this dashboard supports up to 2,000. Review the query's fund scope. No new totals were published; any previous complete results remain unchanged.`;
  if (Number.isSafeInteger(rawRows) && counts.total > rawRows) return "The saved import has more unique allocations than downloaded query rows. No new totals were published; any previous complete results remain unchanged. Ask an administrator to inspect this import before retrying.";
  return null;
}

export async function campaignConflictGiftIds(runId, db) {
  const rows = await db`SELECT DISTINCT gift_id FROM campaign_priority_rows WHERE run_id=${runId}::uuid AND conflict ORDER BY gift_id LIMIT 5`;
  return rows.map(row => row.gift_id);
}

// Diagnose already-failed imports without resubmitting NXT jobs or changing the
// saved run. Only report managers call this; donor names and amounts stay private.
export async function describeLegacyCampaignFailure(job, mode, db) {
  if (job?.stage !== "failed" || job.error !== LEGACY_CAMPAIGN_IMPORT_ERROR || !/^[a-f0-9-]{36}$/.test(job.runId || "")) return job?.error;
  const [counts] = await db`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE conflict)::int AS conflicts,
    COUNT(DISTINCT fund_id)::int AS funds FROM campaign_priority_rows WHERE run_id=${job.runId}::uuid`;
  if (!counts?.total) return job.error;
  const ids = counts.conflicts > 0 ? await campaignConflictGiftIds(job.runId, db) : [];
  return campaignImportIssue(counts, ids, mode) || "This import failed row-count validation. No new totals were published; any previous complete results remain unchanged. Ask an administrator to inspect this import before retrying.";
}
