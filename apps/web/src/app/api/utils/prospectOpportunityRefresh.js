import sql from "./sql";
import { blackbaudApiFetch } from "./blackbaud";
import { clearUserDashboardDataCaches } from "./userDataCache";
import { calendarDate } from "@/utils/prospectActivity";
import { ACTIVE_OPPORTUNITY_STATUS, FUNDED_OPPORTUNITY_STATUS, DECLINED_OPPORTUNITY_STATUS } from "./prospectOpportunities";

const FRESH_MS = 5 * 60_000;
// SKY's opportunity status can lag writes by about ten minutes.
const LOCAL_WRITE_GRACE_MS = 10 * 60_000;
const MAX_READS = 8;
const FIELDS = ["title", "purpose", "current_stage", "estimated_amount", "ask_date", "expected_date", "opportunity_status", "closed_amount", "close_date"];

function optionalDate(source, key, fallback) {
  if (source[key] === undefined) return calendarDate(fallback);
  if (source[key] === null) return null;
  const date = calendarDate(source[key]);
  if (!date) throw new Error("Invalid opportunity date");
  return date;
}

function optionalAmount(source, key, fallback) {
  if (source[key] === undefined) return fallback == null ? null : Number(fallback);
  if (source[key] === null) return null;
  const amount = source[key]?.value;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) throw new Error("Invalid opportunity amount");
  return amount;
}

export function normalizeLinkedOpportunity(remote, saved, constituentId) {
  if (!remote || String(remote.id || "") !== String(saved.blackbaud_opportunity_id) ||
      !constituentId || String(remote.constituent_id || "") !== String(constituentId) ||
      typeof remote.name !== "string" || !remote.name.trim() ||
      typeof remote.status !== "string" || !remote.status.trim()) {
    throw new Error("Unverified opportunity identity or fields");
  }
  if (remote.purpose != null && typeof remote.purpose !== "string") throw new Error("Invalid opportunity purpose");
  const stage = remote.status.trim();
  const normalized = stage.toLowerCase().replace(/[\u2013\u2014]/g, "-");
  const closedAmount = optionalAmount(remote, "funded_amount", saved.closed_amount);
  const closedDate = optionalDate(remote, "funded_date", saved.close_date);
  const declined = /declined|withdrawn|lost|cancel|rejected/.test(normalized);
  const funded = !declined && (normalized === "funded" || normalized === "closed - gift secured" || remote.funded_amount?.value > 0 ||
    Boolean(remote.funded_date));
  const inactive = remote.inactive === true;
  if (remote.inactive != null && typeof remote.inactive !== "boolean") throw new Error("Invalid opportunity active flag");
  const archived = inactive && saved.opportunity_status === "Archived";
  const status = archived ? "Archived" : declined ? DECLINED_OPPORTUNITY_STATUS : funded ? FUNDED_OPPORTUNITY_STATUS : inactive ? "Inactive" : ACTIVE_OPPORTUNITY_STATUS;
  return {
    title: remote.name.trim(),
    purpose: remote.purpose === undefined ? saved.purpose ?? null : remote.purpose,
    current_stage: inactive && !archived && !declined && !funded ? "Inactive" : stage,
    estimated_amount: optionalAmount(remote, "ask_amount", saved.estimated_amount),
    ask_date: optionalDate(remote, "ask_date", saved.ask_date),
    expected_date: optionalDate(remote, "expected_date", saved.expected_date),
    opportunity_status: status,
    closed_amount: archived ? closedAmount : funded ? closedAmount : declined ? 0 : null,
    close_date: archived ? closedDate : funded ? closedDate : declined ? calendarDate(saved.close_date) : null,
  };
}

function comparable(row, key) {
  if (key.endsWith("_date")) return calendarDate(row[key]);
  if (key.endsWith("_amount")) return row[key] == null ? null : Number(row[key]);
  return row[key] ?? null;
}

export function opportunityRefreshDue(row, { force = false, now = Date.now() } = {}) {
  if (row.pipeline_change_id) return false;
  if (Date.parse(row.nxt_retry_after || "") > now) return false;
  if (Date.parse(row.revision || row.updated_at || "") > now - LOCAL_WRITE_GRACE_MS) return false;
  return !(Date.parse(row.nxt_checked_at || "") > now - (force ? 30_000 : FRESH_MS));
}

async function refreshTotals(prospectId, userId) {
  // Refresh only derived values. Preserve manual ranking, follow-ups, archives,
  // and activity timestamps; checking NXT is not a donor interaction.
  await sql`
    WITH totals AS (
      SELECT COUNT(*) FILTER (WHERE opportunity_status = 'Active') AS active_count,
        COUNT(*) FILTER (WHERE opportunity_status = ${FUNDED_OPPORTUNITY_STATUS}) AS funded_count,
        COUNT(*) FILTER (WHERE opportunity_status = ${DECLINED_OPPORTUNITY_STATUS}) AS declined_count,
        COUNT(*) AS total_count,
        COALESCE(SUM(estimated_amount) FILTER (WHERE opportunity_status = 'Active'), 0) AS pipeline,
        SUM(closed_amount) FILTER (WHERE opportunity_status = ${FUNDED_OPPORTUNITY_STATUS}) AS funded,
        MAX(close_date) AS closed_on
      FROM prospect_opportunities WHERE prospect_id = ${prospectId}
    )
    UPDATE prospects p SET ask_amount = totals.pipeline,
      closed_amount = totals.funded,
      close_date = CASE WHEN totals.active_count > 0 THEN NULL ELSE totals.closed_on END,
      status = CASE WHEN p.status = 'Archived' THEN p.status
        WHEN totals.active_count > 0 THEN 'Active'
        WHEN totals.funded_count = totals.total_count THEN ${FUNDED_OPPORTUNITY_STATUS}
        WHEN totals.declined_count = totals.total_count THEN ${DECLINED_OPPORTUNITY_STATUS}
        ELSE p.status END
    FROM totals WHERE p.id = ${prospectId} AND p.user_id = ${userId} AND totals.total_count > 0
  `;
  await clearUserDashboardDataCaches(userId);
}

export async function refreshLinkedProspectOpportunities({ userId, authUserId, origin, prospectId, constituentId, force = false }) {
  const rows = await sql`
    SELECT po.*, po.updated_at::text AS revision, po.nxt_checked_at::text AS checked_revision
    FROM prospect_opportunities po INNER JOIN prospects p ON p.id = po.prospect_id
    WHERE po.prospect_id = ${prospectId} AND p.user_id = ${userId}
      AND po.blackbaud_opportunity_id IS NOT NULL
    ORDER BY po.nxt_checked_at ASC NULLS FIRST, po.id
  `;
  const result = { checked: 0, changed: 0, deferred: 0, unavailable: 0, total: rows.length };
  if (!constituentId) return { ...result, unavailable: rows.length };
  const start = Date.now();
  let reads = 0;
  let paused = false;
  for (const row of rows) {
    if (!opportunityRefreshDue(row, { force })) {
      if (row.pipeline_change_id || Date.parse(row.nxt_retry_after || "") > Date.now() || Date.parse(row.revision) > Date.now() - LOCAL_WRITE_GRACE_MS) result.deferred++;
      continue;
    }
    if (paused || reads >= MAX_READS || Date.now() - start >= 16_000) { result.deferred++; continue; }
    const leaseUntil = new Date(Date.now() + 60_000).toISOString();
    const claimed = await sql`
      UPDATE prospect_opportunities SET nxt_retry_after = ${leaseUntil}::timestamptz
      WHERE id = ${row.id} AND prospect_id = ${prospectId}
        AND pipeline_change_id IS NULL
        AND updated_at::text IS NOT DISTINCT FROM ${row.revision}
        AND nxt_checked_at::text IS NOT DISTINCT FROM ${row.checked_revision}
        AND (nxt_retry_after IS NULL OR nxt_retry_after <= NOW())
      RETURNING id
    `;
    if (!claimed.length) { result.deferred++; continue; }
    reads++;
    try {
      const remote = await blackbaudApiFetch(`/opportunity/v1/opportunities/${encodeURIComponent(String(row.blackbaud_opportunity_id))}`, {
        userId, authUserId, origin, method: "GET", maxRetries: 0, timeoutMs: 8_000,
      });
      const next = normalizeLinkedOpportunity(remote, row, constituentId);
      const changed = FIELDS.some((key) => comparable(row, key) !== comparable(next, key));
      const saved = await sql`
        UPDATE prospect_opportunities SET title = ${next.title}, purpose = ${next.purpose},
          current_stage = ${next.current_stage}, estimated_amount = ${next.estimated_amount},
          ask_date = ${next.ask_date}::date, expected_date = ${next.expected_date}::date,
          opportunity_status = ${next.opportunity_status}, closed_amount = ${next.closed_amount},
          close_date = ${next.close_date}::date, nxt_checked_at = NOW(), nxt_retry_after = NULL
        WHERE id = ${row.id} AND prospect_id = ${prospectId}
          AND pipeline_change_id IS NULL
          AND blackbaud_opportunity_id = ${row.blackbaud_opportunity_id}
          AND updated_at::text IS NOT DISTINCT FROM ${row.revision}
          AND nxt_checked_at::text IS NOT DISTINCT FROM ${row.checked_revision}
          AND nxt_retry_after = ${leaseUntil}::timestamptz
        RETURNING id
      `;
      if (saved.length) { result.checked++; if (changed) result.changed++; }
      else result.deferred++;
    } catch (error) {
      result.unavailable++;
      paused = Number(error?.httpStatus) === 429 || Number(error?.retryAfterMs) > 0 || /QuotaExceeded/.test(error?.name || "");
      const retryAt = new Date(Date.now() + Math.max(60_000, Number(error?.retryAfterMs) || 0)).toISOString();
      await sql`
        UPDATE prospect_opportunities SET nxt_retry_after = ${retryAt}::timestamptz
        WHERE id = ${row.id} AND nxt_retry_after = ${leaseUntil}::timestamptz
      `;
    }
  }
  // Also reconcile unchanged reads: a prior request may have saved the NXT
  // fields before its derived-total/cache step failed.
  if (result.checked || (force && rows.some(row => row.nxt_checked_at))) {
    await refreshTotals(prospectId, userId);
    result.reconciled = true;
  }
  return result;
}
