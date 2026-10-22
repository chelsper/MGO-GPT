import sql from "@/app/api/utils/sql";
import { replaceAnnualSocieties } from "./societyGivingSource";

// Eligible again the next overnight window, without requiring an exact 24h interval.
const NIGHTLY_ELIGIBILITY_MS = 20 * 60 * 60 * 1000;

export async function readPortfolioGivingSnapshots(workspaceUserId, ids) {
  if (!ids.length) return new Map();
  const rows = await sql`
    SELECT constituent_id, payload, refreshed_at, stale_after
    FROM portfolio_giving_snapshots
    WHERE workspace_user_id = ${workspaceUserId} AND constituent_id = ANY(${ids})
  `;
  return new Map(rows.map((row) => [String(row.constituent_id), row]));
}

export async function savePortfolioGivingSnapshot(workspaceUserId, constituentId, payload, startedAt) {
  if (!payload?.mapped?.lifetimeGiving || !payload?.mapped?.annualGivingSocieties ||
      !payload?.currentFyGiving || Object.values(payload?.warnings || {}).some(Boolean)) {
    throw new Error("Incomplete giving refresh; the previous giving snapshot was retained");
  }
  await sql`
    INSERT INTO portfolio_giving_snapshots (workspace_user_id, constituent_id, payload, refreshed_at, stale_after)
    VALUES (${workspaceUserId}, ${constituentId}, ${JSON.stringify(payload)}::jsonb,
      ${new Date(startedAt).toISOString()}, ${new Date(startedAt + NIGHTLY_ELIGIBILITY_MS).toISOString()})
    ON CONFLICT (workspace_user_id, constituent_id) DO UPDATE SET
      payload = CASE WHEN COALESCE(portfolio_giving_snapshots.payload #>> '{mapped,annualGivingSocieties,recognitionSource,checkedAt}', '') >
          COALESCE(EXCLUDED.payload #>> '{mapped,annualGivingSocieties,recognitionSource,checkedAt}', '')
        THEN jsonb_set(EXCLUDED.payload, '{mapped,annualGivingSocieties}', portfolio_giving_snapshots.payload #> '{mapped,annualGivingSocieties}')
        ELSE EXCLUDED.payload END,
      refreshed_at = EXCLUDED.refreshed_at, stale_after = EXCLUDED.stale_after
    WHERE portfolio_giving_snapshots.refreshed_at <= EXCLUDED.refreshed_at
  `;
}

export async function withPortfolioGivingSnapshot(workspaceUserId, constituentId, summary) {
  const snapshots = await readPortfolioGivingSnapshots(workspaceUserId, [String(constituentId)]);
  const row = snapshots.get(String(constituentId));
  if (!row?.payload?.mapped) return summary;
  if (Date.parse(row.refreshed_at) < Date.parse(summary?.summaryRefreshedAt || "")) {
    const annual = row.payload.mapped.annualGivingSocieties;
    const previous = summary?.mapped?.annualGivingSocieties;
    if (!annual?.recognitionSource || (previous?.recognitionSource &&
        Date.parse(previous.recognitionSource.checkedAt) >= Date.parse(annual.recognitionSource.checkedAt))) return summary;
    return { ...summary, mapped: { ...summary.mapped,
      annualGivingSocieties: previous ? replaceAnnualSocieties(previous, annual) : annual } };
  }
  return {
    ...summary,
    givingRefreshedAt: row.refreshed_at,
    mapped: {
      ...summary.mapped,
      lifetimeGiving: row.payload.mapped.lifetimeGiving,
      annualGivingSocieties: Date.parse(summary?.mapped?.annualGivingSocieties?.recognitionSource?.checkedAt || "") >
          (Date.parse(row.payload.mapped.annualGivingSocieties?.recognitionSource?.checkedAt || "") || 0)
        ? replaceAnnualSocieties(row.payload.mapped.annualGivingSocieties || {}, summary.mapped.annualGivingSocieties)
        : row.payload.mapped.annualGivingSocieties,
    },
  };
}
