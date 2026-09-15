import { calendarDate, latestDatedAction } from "@/utils/prospectActivity";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

export const ACTIVITY_BATCH_CALLS = 8;
export const ACTIVITY_DAILY_CALLS = 360;
export const ACTIVITY_FRESH_MS = 24 * 60 * 60 * 1000;
const recordId = value => typeof value === "string" && value.trim() && value.length <= 200
  ? value.trim() : typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : null;

// No implicit all-workspace rollout. An empty or malformed allowlist fails closed.
export function activityWorkspaceIds(value = process.env.PORTFOLIO_ACTIVITY_WORKSPACE_IDS || "") {
  const ids = value.split(",").map(id => id.trim()).filter(Boolean);
  if (!ids.length || ids.length > 50 || ids.some(id => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) return [];
  return [...new Set(ids)];
}

export function activityOrigin(value = process.env.PORTFOLIO_ACTIVITY_ORIGIN || "") {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value ? value : null;
  } catch { return null; }
}

export function savedActivityEntry(payload, now = new Date()) {
  const checkedAt = Date.parse(payload?.fetchedAt);
  if (payload?.version !== 1 || !Number.isFinite(checkedAt) || checkedAt > now.getTime()) return null;
  if (payload.data === null) return { id: null, date: null, checkedAt: new Date(checkedAt).toISOString() };
  const date = calendarDate(payload.data?.date);
  if (typeof payload.data?.id !== "string" || !payload.data.id.trim() || !date ||
      date > getStandingsPeriods(new Date(checkedAt)).asOf) return null;
  return { id: payload.data.id, date, checkedAt: new Date(checkedAt).toISOString() };
}

export function activityPath(constituentId, kind) {
  return `/constituent/v1/constituents/${encodeURIComponent(constituentId)}/${kind === "gift" ? "givingsummary/latest" : "actions"}`;
}

export function actionCursorPath(value, constituentId) {
  const next = new URL(value, "https://api.sky.blackbaud.com");
  if (next.origin !== "https://api.sky.blackbaud.com" || next.pathname !== activityPath(constituentId, "action") ||
      next.username || next.password || next.hash) throw new Error("invalid_action_cursor");
  return next.pathname + next.search;
}

export function activityRequestPath(row, now = new Date()) {
  if (!row.scan) return activityPath(row.constituent_id, row.kind);
  const scan = row.scan;
  if (row.kind !== "action" || !Array.isArray(scan.ids) || !Array.isArray(scan.paths) ||
      scan.ids.length > 10000 || scan.paths.length > 100 ||
      scan.ids.some(id => typeof id !== "string" || recordId(id) !== id) || new Set(scan.ids).size !== scan.ids.length ||
      (scan.latest && (!scan.ids.includes(scan.latest.id) || !calendarDate(scan.latest.date))) ||
      !Number.isFinite(Date.parse(scan.startedAt)) || Date.parse(scan.startedAt) > now.getTime() ||
      now.getTime() - Date.parse(scan.startedAt) > ACTIVITY_FRESH_MS ||
      typeof scan.nextPath !== "string" || scan.paths.at(-1) !== scan.nextPath) throw new Error("invalid_action_scan");
  return actionCursorPath(scan.nextPath, row.constituent_id);
}

export function latestGiftDate(response, now = new Date()) {
  if (response && typeof response === "object" && !Array.isArray(response) && !Object.keys(response).length) return null;
  const date = calendarDate(response?.date);
  const id = recordId(response?.id);
  if (!id || !date || date > getStandingsPeriods(now).asOf) throw new Error("invalid_gift");
  return { id, date };
}

// Persist only IDs/dates and a validated cursor, never action descriptions.
export function actionDatePage(response, constituentId, previous, now = new Date()) {
  if (!Array.isArray(response?.value)) throw new Error("invalid_actions");
  const scan = previous || { startedAt: now.toISOString(), ids: [], paths: [], latest: null, count: null };
  if (now.getTime() - Date.parse(scan.startedAt) > 24 * 60 * 60 * 1000) throw new Error("expired_scan");
  const ids = new Set(scan.ids);
  const dates = [];
  for (const item of response.value) {
    const date = calendarDate(item?.date);
    const id = recordId(item?.id);
    if (!id || !date || (item.constituent_id != null && String(item.constituent_id) !== constituentId) || ids.has(id)) {
      throw new Error("invalid_actions");
    }
    ids.add(id);
    dates.push({ id, date });
  }
  const count = response.count == null ? scan.count : Number(response.count);
  if (count != null && (!Number.isSafeInteger(count) || count < ids.size ||
      (scan.count != null && count !== scan.count))) throw new Error("incomplete_actions");
  let nextPath = null;
  if (response.next_link) {
    nextPath = actionCursorPath(response.next_link, constituentId);
    if (scan.paths.includes(nextPath) || !response.value.length) throw new Error("repeated_action_cursor");
  }
  if (ids.size > 10000 || scan.paths.length >= 100 || (!nextPath && count != null && ids.size !== count)) {
    throw new Error("incomplete_actions");
  }
  const latest = latestDatedAction([scan.latest, ...dates].filter(Boolean), new Date(scan.startedAt));
  return {
    data: latest,
    checkedAt: scan.startedAt,
    scan: nextPath ? { ...scan, ids: [...ids], paths: [...scan.paths, nextPath], latest, count, nextPath } : null,
  };
}
