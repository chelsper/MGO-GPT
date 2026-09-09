import { createHash } from "node:crypto";
import sql from "./sql";
import { blackbaudApiFetch } from "./blackbaud";
import { calendarDate, latestDatedAction } from "@/utils/prospectActivity";

export const ACTIVITY_TTL_MS = 60 * 60 * 1000;
const inFlight = new Map();
const text = (value) => typeof value === "string" ? value.slice(0, 2000) : "";

export function normalizeRecentActions(response, constituentId, now = new Date()) {
  if (!Array.isArray(response?.value) || response.next_link ||
      (response.count != null && Number(response.count) !== response.value.length)) throw new Error("Incomplete action response");
  if (response.value.some((item) => !item?.id || !calendarDate(item.date) ||
    (item.constituent_id != null && String(item.constituent_id) !== String(constituentId)))) throw new Error("Malformed action response");
  const action = latestDatedAction(response.value, now);
  return action ? {
    id: String(action.id), date: calendarDate(action.date), summary: text(action.summary) || "NXT action",
    category: text(action.category), type: text(action.type), status: text(action.computed_status || action.status),
  } : null;
}

export function normalizeLatestGift(response) {
  if (response && typeof response === "object" && !Array.isArray(response) && Object.keys(response).length === 0) return null;
  if (!response?.id || !calendarDate(response.date) || typeof response.amount?.value !== "number" || !Number.isFinite(response.amount.value)) throw new Error("Malformed gift response");
  return {
    id: String(response.id), date: calendarDate(response.date), amount: response.amount.value,
    type: text(response.type), funds: (Array.isArray(response.funds) ? response.funds : [])
      .map((fund) => text(fund.description || fund.name)).filter(Boolean).slice(0, 25),
  };
}

// Only opened prospects use this cache; no portfolio-wide enrichment or AI work.
// Each section retains its last good value independently when SKY is unavailable.
export async function loadProspectRecentActivity({ userId, authUserId, origin, constituentId }) {
  const digest = createHash("sha256").update(JSON.stringify([origin, String(constituentId)])).digest("hex");
  const result = {};
  for (const kind of ["action", "gift"]) {
    const key = `prospect-activity-v1|${kind}|${digest}`;
    const flightKey = JSON.stringify([userId, authUserId, key]);
    let pending = inFlight.get(flightKey);
    if (!pending) {
      pending = (async () => {
        let cached = null;
        try {
          const [row] = await sql`SELECT payload FROM blackbaud_constituent_summary_cache
            WHERE workspace_user_id = ${userId} AND auth_user_id = ${authUserId}
              AND constituent_id = ${String(constituentId)} AND cache_key = ${key} LIMIT 1`;
          if (row?.payload?.version === 1 && Number.isFinite(Date.parse(row.payload.fetchedAt))) cached = row.payload;
        } catch { /* A missing cache must not prevent a live read. */ }
        if (cached && Date.now() - Date.parse(cached.fetchedAt) >= 0 && Date.now() - Date.parse(cached.fetchedAt) < ACTIVITY_TTL_MS) {
          return { ...cached, stale: false };
        }
        try {
          const response = await blackbaudApiFetch(`/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}/${kind === "action" ? "actions" : "givingsummary/latest"}`, { userId, authUserId, origin });
          const entry = { version: 1, data: kind === "action" ? normalizeRecentActions(response, constituentId) : normalizeLatestGift(response), fetchedAt: new Date().toISOString() };
          try {
            await sql`INSERT INTO blackbaud_constituent_summary_cache (workspace_user_id, auth_user_id, constituent_id, cache_key, payload, updated_at)
              VALUES (${userId}, ${authUserId}, ${String(constituentId)}, ${key}, ${JSON.stringify(entry)}::jsonb, ${entry.fetchedAt}::timestamptz)
              ON CONFLICT (workspace_user_id, auth_user_id, cache_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
              WHERE blackbaud_constituent_summary_cache.updated_at <= EXCLUDED.updated_at`;
          } catch { /* Still display a successful NXT read if storage is unavailable. */ }
          return { ...entry, stale: false };
        } catch {
          return { data: cached?.data ?? null, fetchedAt: cached?.fetchedAt || null, stale: true, unavailable: !cached };
        }
      })();
      inFlight.set(flightKey, pending);
      pending.finally(() => { if (inFlight.get(flightKey) === pending) inFlight.delete(flightKey); }).catch(() => {});
    }
    result[kind] = await pending;
  }
  return result;
}
