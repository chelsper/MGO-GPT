import { blackbaudApiFetch, isBlackbaudQuotaExceededError } from "./blackbaud";
import { isReviewerRole } from "@/utils/workspaceRoles";
import {
  ACTIVITY_BATCH_CALLS, ACTIVITY_FRESH_MS, actionDatePage, activityRequestPath,
  latestGiftDate, savedActivityEntry,
} from "./portfolioActivityData";
import {
  claimActivityGate, deferActivityRow, dueActivityRows, markActivitySeeded,
  readActivitySeed, releaseActivityGate, reserveActivityCall, saveActivityResult, seedActivityQueue,
} from "./portfolioActivityStore";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function refreshPortfolioActivity({ workspaceIds, origin, refreshUser, catchup = false }) {
  if (!workspaceIds.length || !refreshUser?.id || !isReviewerRole(refreshUser.role)) return { status: "disabled" };
  const claimed = await claimActivityGate(origin);
  const gate = catchup && claimed ? { ...claimed, catchup: true } : claimed;
  if (!gate) return { status: "paused", reason: "busy_or_cooldown" };
  const progress = { status: "complete", calls: 0, reused: 0, updated: 0, deferred: 0 };
  const startedAt = Date.now();
  let cooldownMs = 1000;
  try {
    await seedActivityQueue(workspaceIds, origin);
    const rows = await dueActivityRows(workspaceIds, origin);
    for (const row of rows) {
      if (progress.calls >= ACTIVITY_BATCH_CALLS || Date.now() - startedAt > 90_000) {
        progress.status = "queued";
        break;
      }
      if (!row.seed_complete) {
        const saved = savedActivityEntry(await readActivitySeed(row, refreshUser.id), new Date(), row.kind);
        if (saved && (!row.checked_at || Date.parse(row.checked_at) <= Date.parse(saved.checkedAt))) {
          if (!await saveActivityResult(row, saved, refreshUser.id, gate)) return { ...progress, status: "paused", reason: "lease_lost" };
          if (Date.now() - Date.parse(saved.checkedAt) < ACTIVITY_FRESH_MS &&
              (!row.requested_at || Date.parse(row.requested_at) <= Date.parse(saved.checkedAt))) {
            progress.reused += 1;
            continue;
          }
        } else await markActivitySeeded(row);
      }
      if (!await reserveActivityCall(gate)) return { ...progress, status: "paused", reason: "budget_cooldown_window_or_lease" };
      progress.calls += 1;
      try {
        const now = new Date();
        const response = await blackbaudApiFetch(activityRequestPath(row, now), {
          userId: row.workspace_user_id, authUserId: refreshUser.id, origin,
          timeoutMs: 8_000, maxRetries: 0,
        }).catch(error => {
          // This endpoint reports a verified absence as a named 404. Other
          // not-found/access errors must never clear a saved gift or action.
          if (row.kind === "gift" && error?.httpStatus === 404 &&
              error.blackbaudErrorCode === 404 &&
              error.blackbaudErrorName === "ConstituentDoesNotHaveGifts") return {};
          throw error;
        });
        const result = row.kind === "gift"
          ? { data: latestGiftDate(response, now), checkedAt: now.toISOString(), scan: null }
          : actionDatePage(response, row.constituent_id, row.scan, now);
        if (result.scan) {
          await deferActivityRow(row, { scan: result.scan }, gate);
          progress.deferred += 1;
        } else {
          const entry = { ...(result.data || { id: null, date: null }), checkedAt: result.checkedAt };
          if (!await saveActivityResult(row, entry, refreshUser.id, gate)) return { ...progress, status: "paused", reason: "lease_lost" };
          progress.updated += 1;
        }
      } catch (error) {
        const throttled = error?.httpStatus === 429 || isBlackbaudQuotaExceededError(error);
        const connectionFailed = [401, 403].includes(error?.httpStatus);
        const retryMs = Number(error?.retryAfterMs);
        const waitMs = Math.max(throttled ? 60_000 : 3_600_000, Number.isFinite(retryMs) ? retryMs : 0);
        await deferActivityRow(row, {
          // Failed/incomplete responses never replace a last successful date.
          scan: throttled || connectionFailed ? row.scan : null,
          error: throttled ? "throttled" : connectionFailed ? "connection" : "unverified_response",
          delayMs: waitMs,
        }, gate);
        progress.deferred += 1;
        if (throttled || connectionFailed) {
          cooldownMs = waitMs;
          return { ...progress, status: "paused", reason: throttled ? "throttled" : "connection" };
        }
      }
      await delay(500);
    }
    return { ...progress, status: progress.deferred || rows.length === 20 ? "queued" : progress.status };
  } finally {
    // Failure to release is safe: a short durable lease expires automatically.
    await releaseActivityGate(gate, cooldownMs).catch(() => {});
  }
}
