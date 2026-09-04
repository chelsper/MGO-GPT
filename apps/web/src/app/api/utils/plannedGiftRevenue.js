import { listBlackbaudRealizedPlannedGiftRevenueGifts } from "./blackbaud.js";
import {
  getCachedReportSnapshot,
  saveReportSnapshot,
} from "./reportCache.js";

const CACHE_VERSION = 1;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_NETWORK_LOOKUPS = 25;
const LOOKUP_CONCURRENCY = 2;
const PLANNED_GIFT_TYPE_TOKENS = new Set(["plannedgift", "plannedgiving"]);
const REALIZED_PLANNED_GIFT_REVENUE_TYPE_TOKENS = new Set([
  "realizedplannedgiftrevenue",
]);
const inFlightLookups = new Map();

function getNestedValue(source, path) {
  return path.split(".").reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, source);
}

function firstDefined(source, paths) {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function getTextValue(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim() || null;
  }
  if (typeof value === "object") {
    return getTextValue(
      firstDefined(value, ["name", "description", "value", "label", "id"]),
    );
  }
  return null;
}

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function getBlackbaudGiftId(gift) {
  const giftId = firstDefined(gift, [
    "id",
    "gift_id",
    "giftId",
    "gift.id",
    "gift.gift_id",
  ]);
  return giftId == null ? "" : String(giftId).trim();
}

function getGiftTypeToken(gift) {
  return normalizeToken(
    getTextValue(
      firstDefined(gift, ["gift_type", "giftType", "type", "type_name", "category"]),
    ),
  );
}

function isPlannedGift(gift) {
  return PLANNED_GIFT_TYPE_TOKENS.has(getGiftTypeToken(gift));
}

function isRealizedPlannedGiftRevenue(gift) {
  return REALIZED_PLANNED_GIFT_REVENUE_TYPE_TOKENS.has(getGiftTypeToken(gift));
}

function toIdSet(values) {
  return new Set(
    (values instanceof Set ? [...values] : Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
}

function getEmbeddedRealizedRevenueRows(gift) {
  const rows = [];
  for (const path of [
    "realized_revenue_gifts",
    "realizedRevenueGifts",
    "realized_revenue",
    "realizedRevenue",
    "planned_gift.realized_revenue_gifts",
    "plannedGift.realizedRevenueGifts",
  ]) {
    const value = getNestedValue(gift, path);
    if (Array.isArray(value)) rows.push(...value);
  }
  return rows;
}

function getRelatedPlannedGiftId(gift) {
  return String(
    firstDefined(gift, [
      "planned_gift_id",
      "plannedGiftId",
      "planned_gift.id",
      "plannedGift.id",
      "planned_gift.gift_id",
      "plannedGift.giftId",
    ]) || "",
  ).trim();
}

// List responses sometimes already contain the relationship. Use it before
// making any Gift V2 calls, and never infer a relationship from amount/date.
export function getEmbeddedRealizedPlannedGiftIds(gifts = []) {
  const realizedPlannedGiftIds = new Set();

  for (const gift of gifts) {
    const giftId = getBlackbaudGiftId(gift);
    if (!giftId) continue;

    if (isPlannedGift(gift) && getEmbeddedRealizedRevenueRows(gift).length > 0) {
      realizedPlannedGiftIds.add(giftId);
    }

    if (isRealizedPlannedGiftRevenue(gift)) {
      const plannedGiftId = getRelatedPlannedGiftId(gift);
      if (plannedGiftId) realizedPlannedGiftIds.add(plannedGiftId);
    }
  }

  return realizedPlannedGiftIds;
}

function getRelationCacheKey(connectionUserId, plannedGiftId) {
  return [
    "blackbaud:planned-gift-realized-revenue:v1",
    String(connectionUserId || "unknown"),
    String(plannedGiftId),
  ].join(":");
}

function isFreshCacheEntry(payload) {
  if (!payload || payload.version !== CACHE_VERSION) return false;
  const expiresAt = new Date(payload.expiresAt || "").getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function getCachedRelation(cacheKey) {
  try {
    const payload = await getCachedReportSnapshot(cacheKey);
    return isFreshCacheEntry(payload) ? payload : null;
  } catch {
    return null;
  }
}

async function saveCachedRelation(cacheKey, hasRealizedRevenue, realizedRevenueGiftIds) {
  try {
    await saveReportSnapshot(cacheKey, {
      version: CACHE_VERSION,
      hasRealizedRevenue: Boolean(hasRealizedRevenue),
      realizedRevenueGiftIds: Array.from(toIdSet(realizedRevenueGiftIds)),
      checkedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    });
  } catch {
    // Database cache failures must not change reporting behavior.
  }
}

async function lookupRealizedRevenue({
  cacheKey,
  userId,
  authUserId,
  origin,
  plannedGiftId,
}) {
  const existingLookup = inFlightLookups.get(cacheKey);
  if (existingLookup) return existingLookup;

  const lookup = (async () => {
    const realizedRevenueGifts = await listBlackbaudRealizedPlannedGiftRevenueGifts({
      userId,
      authUserId,
      origin,
      plannedGiftId,
    });
    const revenueGifts = Array.isArray(realizedRevenueGifts)
      ? realizedRevenueGifts
      : [];
    const realizedRevenueGiftIds = revenueGifts
      .map((gift) => getBlackbaudGiftId(gift))
      .filter(Boolean);
    const result = {
      hasRealizedRevenue: revenueGifts.length > 0,
      realizedRevenueGiftIds,
    };
    await saveCachedRelation(
      cacheKey,
      result.hasRealizedRevenue,
      result.realizedRevenueGiftIds,
    );
    return result;
  })();

  inFlightLookups.set(cacheKey, lookup);
  try {
    return await lookup;
  } finally {
    inFlightLookups.delete(cacheKey);
  }
}

// A bounded, cached supplement to Gift V1. A confirmed relationship removes
// only the originating planned gift; the realized revenue stays credited to
// the fundraiser and constituent shown on that revenue record.
export async function getRealizedPlannedGiftIds({
  gifts = [],
  userId,
  authUserId,
  origin,
  maxNetworkLookups = MAX_NETWORK_LOOKUPS,
  strict = false,
} = {}) {
  const realizedPlannedGiftIds = getEmbeddedRealizedPlannedGiftIds(gifts);
  const plannedGiftIds = Array.from(
    new Set(
      gifts
        .filter(isPlannedGift)
        .map(getBlackbaudGiftId)
        .filter(Boolean),
    ),
  );

  if (!plannedGiftIds.length || !origin || !(userId || authUserId)) {
    return realizedPlannedGiftIds;
  }

  const connectionUserId = authUserId || userId;
  const pendingLookupIds = [];
  for (const plannedGiftId of plannedGiftIds) {
    if (realizedPlannedGiftIds.has(plannedGiftId)) continue;

    const cacheKey = getRelationCacheKey(connectionUserId, plannedGiftId);
    const cached = await getCachedRelation(cacheKey);
    if (cached) {
      if (cached.hasRealizedRevenue) realizedPlannedGiftIds.add(plannedGiftId);
      continue;
    }
    pendingLookupIds.push(plannedGiftId);
  }

  const lookupIds = pendingLookupIds.slice(
    0,
    Math.max(0, Number(maxNetworkLookups) || 0),
  );
  if (strict && lookupIds.length < pendingLookupIds.length) {
    throw new Error("Planned-gift relationship lookup limit reached; previous giving snapshot retained");
  }
  let nextIndex = 0;
  let shouldStop = false;

  await Promise.all(
    Array.from(
      { length: Math.min(LOOKUP_CONCURRENCY, lookupIds.length) },
      async () => {
        while (!shouldStop && nextIndex < lookupIds.length) {
          const plannedGiftId = lookupIds[nextIndex++];
          const cacheKey = getRelationCacheKey(connectionUserId, plannedGiftId);
          try {
            const result = await lookupRealizedRevenue({
              cacheKey,
              userId,
              authUserId,
              origin,
              plannedGiftId,
            });
            if (result.hasRealizedRevenue) {
              realizedPlannedGiftIds.add(plannedGiftId);
            }
          } catch (error) {
            // Do not make more calls after Blackbaud becomes unavailable. The
            // conservative result is to keep any unconfirmed planned gift.
            shouldStop = true;
            if (strict) throw error;
          }
        }
      },
    ),
  );

  return realizedPlannedGiftIds;
}
