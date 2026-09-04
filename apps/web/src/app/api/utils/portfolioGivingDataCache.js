import { createHash } from "node:crypto";
import sql from "@/app/api/utils/sql";
import { blackbaudApiFetch, listBlackbaudGifts } from "./blackbaud.js";

export const PORTFOLIO_GIVING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const inFlight = new Map();
const MAX_CACHE_BYTES = 2 * 1024 * 1024;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function isLifetimeGiving(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return ["total_giving", "total_received_giving", "total_soft_credits", "total_pledge_balance"]
    .some((key) => typeof value[key]?.value === "number" && Number.isFinite(value[key].value));
}

function isCompleteGiftList(value) {
  return value?.hasMore === false && Array.isArray(value.gifts) &&
    value.gifts.every((gift) => gift && typeof gift === "object" && !Array.isArray(gift) &&
      (gift.id || gift.gift_id || gift.giftId));
}

// Scoped to the same workspace AND Blackbaud connection. Never reuse another
// user's more privileged API response. Completed data survives server restarts;
// simultaneous requests in one worker also share the outstanding API call.
export function createPortfolioGivingDataSource({
  userId, authUserId, origin, constituentId, forceRefresh = false,
}) {
  if (!userId || !authUserId || !origin || !constituentId) {
    throw new Error("A workspace, connection, origin and constituent are required");
  }
  let freshUntil = Date.now() + PORTFOLIO_GIVING_CACHE_TTL_MS;

  async function read(kind, parameters, load, isValid) {
    const startedAt = Date.now();
    const digest = createHash("sha256")
      .update(JSON.stringify(canonical({ origin, constituentId: String(constituentId), parameters })))
      .digest("hex");
    const cacheKey = `portfolio-giving-v1|${kind}|${digest}`;
    const flightKey = JSON.stringify([userId, authUserId, cacheKey, Boolean(forceRefresh)]);
    let pending = inFlight.get(flightKey);
    if (!pending) {
      pending = (async () => {
        if (!forceRefresh) {
          try {
            const rows = await sql`
              SELECT payload FROM blackbaud_constituent_summary_cache
              WHERE workspace_user_id = ${userId}
                AND auth_user_id = ${authUserId}
                AND cache_key = ${cacheKey}
                AND constituent_id = ${String(constituentId)}
              LIMIT 1
            `;
            const entry = rows[0]?.payload;
            const expiresAt = Date.parse(entry?.expiresAt || "");
            const fetchedAt = Date.parse(entry?.fetchedAt || "");
            if (
              entry?.version === 1 && isValid(entry.data) &&
              Number.isFinite(fetchedAt) && fetchedAt <= Date.now() &&
              expiresAt > Date.now() && expiresAt <= fetchedAt + PORTFOLIO_GIVING_CACHE_TTL_MS
            ) return entry;
          } catch {
            // Cache storage is an optimization, not a prerequisite for NXT reads.
          }
        }
        const data = await load();
        const entry = {
          version: 1,
          data,
          fetchedAt: new Date(startedAt).toISOString(),
          expiresAt: new Date(startedAt + PORTFOLIO_GIVING_CACHE_TTL_MS).toISOString(),
        };
        if (isValid(data)) {
          try {
            const serialized = JSON.stringify(entry);
            if (Buffer.byteLength(serialized, "utf8") > MAX_CACHE_BYTES) return entry;
            await sql`
              WITH expired AS (
                DELETE FROM blackbaud_constituent_summary_cache
                WHERE workspace_user_id = ${userId} AND auth_user_id = ${authUserId}
                  AND constituent_id = ${String(constituentId)}
                  AND cache_key LIKE 'portfolio-giving-v1|%'
                  AND cache_key <> ${cacheKey}
                  AND updated_at < NOW() - INTERVAL '2 days'
              )
              INSERT INTO blackbaud_constituent_summary_cache
                (workspace_user_id, auth_user_id, cache_key, constituent_id, payload, updated_at)
              VALUES (${userId}, ${authUserId}, ${cacheKey}, ${String(constituentId)},
                ${serialized}::jsonb, ${entry.fetchedAt}::timestamptz)
              ON CONFLICT (workspace_user_id, auth_user_id, cache_key) DO UPDATE SET
                payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
              WHERE blackbaud_constituent_summary_cache.updated_at <= EXCLUDED.updated_at
            `;
          } catch {
            // Keep the successful live response, even if the cache write fails.
          }
        }
        return entry;
      })();
      inFlight.set(flightKey, pending);
      // Attach both handlers so failed API requests never become cached promises.
      pending.then(
        () => { if (inFlight.get(flightKey) === pending) inFlight.delete(flightKey); },
        () => { if (inFlight.get(flightKey) === pending) inFlight.delete(flightKey); },
      );
    }
    const entry = await pending;
    freshUntil = Math.min(freshUntil, Date.parse(entry.expiresAt));
    return entry.data;
  }

  return {
    get freshUntil() { return new Date(freshUntil).toISOString(); },
    loadLifetimeGiving: async () => {
      const value = await read("lifetime", {}, () => blackbaudApiFetch(
        `/constituent/v1/constituents/${encodeURIComponent(String(constituentId))}/givingsummary/lifetimegiving`,
        { userId, authUserId, origin },
      ), isLifetimeGiving);
      if (!isLifetimeGiving(value)) throw new Error("Blackbaud returned a malformed lifetime-giving response");
      return value;
    },
    listGifts: async ({ searchParams, pageLimit = 500, maxPages = 20, includePageMetadata = false }) => {
      if (String(searchParams?.constituent_id) !== String(constituentId) || Array.isArray(searchParams?.constituent_id)) {
        throw new Error("Portfolio giving cache requires an exact constituent filter");
      }
      const response = await read("gifts", { searchParams, pageLimit, maxPages }, () => listBlackbaudGifts({
        userId, authUserId, origin, searchParams, pageLimit, maxPages,
        includePageMetadata: true,
        strictResponse: true,
      }), isCompleteGiftList);
      if (!isCompleteGiftList(response)) {
        throw new Error("Portfolio gift history is incomplete; the last good summary was retained");
      }
      return includePageMetadata ? response : response.gifts;
    },
  };
}
