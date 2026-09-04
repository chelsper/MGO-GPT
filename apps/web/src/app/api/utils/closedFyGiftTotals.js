import sql from "@/app/api/utils/sql";
import { listBlackbaudGifts } from "@/app/api/utils/blackbaud";
import { getRealizedPlannedGiftIds } from "@/app/api/utils/plannedGiftRevenue";
import { calculateLifetimeFundraiserCredit } from "@/app/api/utils/lifetimeFundraiserCredit";
import { isInStandingsPeriod } from "@/utils/standingsPeriods";

const SUMMARY_CACHE_TTL_MS = 60 * 60 * 1000;
const LIFETIME_SUMMARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getNestedValue(source, path) {
  return path.split(".").reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, source);
}

function firstDefined(source, paths) {
  for (const path of paths) {
    const value = getNestedValue(source, path);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function normalizeGiftToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const CLOSED_FY_GIFT_TYPES = new Set(
  [
    "Donation",
    "Stock",
    "SoldStock",
    "Other",
    "RecurringGiftPayment",
    "RealizedPlannedGiftRevenue",
    "PlannedGift",
    "Pledge",
    "GiftInKind",
    "MatchingGiftPledge",
  ].map(normalizeGiftToken),
);

const CLOSED_FY_GIFT_TYPE_QUERIES = [
  "Donation",
  "Stock",
  "SoldStock",
  "Other",
  "RecurringGiftPayment",
  "PlannedGift",
  "Pledge",
  "GiftInKind",
  "MatchingGiftPledge",
];

// Lifetime solicitor credit intentionally reuses the same Gift API feed as
// FY Closed. It has no fiscal-year date parameters, and runs once for the
// entire team rather than launching one Blackbaud Query job per MGO.
const LIFETIME_GIFT_TYPE_QUERIES = [
  ...CLOSED_FY_GIFT_TYPE_QUERIES,
  // Unlike FY Closed, lifetime credit deliberately counts separately credited
  // realized planned-gift revenue. The calculator still requires an explicit
  // fundraiser credit on that record.
  "RealizedPlannedGiftRevenue",
];
const LIFETIME_GIFT_PAGE_LIMIT = 500;
const LIFETIME_GIFT_MAX_PAGES_PER_TYPE = 20;

function getGiftAmount(gift) {
  return firstDefined(gift, [
    "amount.value",
    "gift_amount.value",
    "giftAmount.value",
    "amount",
    "gift_amount",
    "giftAmount",
    "payments.0.amount.value",
  ]);
}

function getGiftDate(gift) {
  return firstDefined(gift, [
    "date",
    "gift_date",
    "giftDate",
    "date_received",
    "dateReceived",
    "received_date",
    "receivedDate",
  ]);
}

function getGiftType(gift) {
  return normalizeGiftToken(firstDefined(gift, [
    "gift_type",
    "giftType",
    "type",
    "type_name",
    "category",
  ]) || "");
}

function getGiftId(gift) {
  return String(
    firstDefined(gift, ["id", "gift_id", "giftId", "gift.id", "gift.gift_id"]) || "",
  ).trim();
}

function isPlannedGiftType(giftType) {
  return giftType === "plannedgift" || giftType === "plannedgiving";
}

function getGiftFundraiserName(fundraiser) {
  return String(
    firstDefined(fundraiser, [
      "fundraiser_name",
      "fundraiserName",
      "name",
      "full_name",
      "fullName",
      "display_name",
      "displayName",
    ]) || "",
  ).trim() || null;
}

function getGiftFundraiserCandidates(gift) {
  const arrayPaths = [
    "fundraisers",
    "solicitors",
    "gift_fundraisers",
    "giftFundraisers",
    "gift_fundraiser",
    "giftFundraiser",
    "gift_fundraiser_names",
    "giftFundraiserNames",
    "fundraiser_credits",
    "fundraiserCredits",
    "solicitor_credits",
    "solicitorCredits",
  ];
  const singlePaths = [
    "fundraiser",
    "solicitor",
    "gift_fundraiser",
    "giftFundraiser",
    "gift_fundraiser_name",
    "giftFundraiserName",
    "gift_fundraiser.full_name",
    "giftFundraiser.fullName",
  ];

  const candidates = [];
  for (const path of arrayPaths) {
    const value = getNestedValue(gift, path);
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item) candidates.push({ sourcePath: path, value: item });
    }
  }
  for (const path of singlePaths) {
    const value = getNestedValue(gift, path);
    if (!value) continue;
    if (typeof value === "string") {
      candidates.push({ sourcePath: path, value: { fundraiser_name: value.trim() } });
    } else {
      candidates.push({ sourcePath: path, value });
    }
  }
  return candidates.filter(Boolean);
}

function getGiftFundraiserId(fundraiser) {
  return fundraiser?.constituent_id || fundraiser?.fundraiser_id || fundraiser?.id || null;
}

export function normalizeBlackbaudFundraiserAliasIds(value) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/)
      : [];
  const seen = new Set();
  const results = [];

  for (const rawValue of rawValues) {
    const normalized = String(rawValue || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    results.push(normalized);
  }

  return results;
}

function normalizeWorkspaceFundraiserIds(user) {
  const results = [];
  const seen = new Set();
  const candidates = [
    {
      id: String(user?.blackbaud_constituent_id || "").trim(),
      source: "blackbaud_constituent_id",
    },
    {
      id: String(user?.blackbaud_lookup_id || "").trim(),
      source: "blackbaud_lookup_id",
    },
    ...normalizeBlackbaudFundraiserAliasIds(user?.blackbaud_fundraiser_alias_ids).map((id) => ({
      id,
      source: "blackbaud_fundraiser_alias_ids",
    })),
  ];

  for (const candidate of candidates) {
    if (!candidate.id || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    results.push(candidate);
  }
  return results;
}

function isWorkspaceFundraiserIdMatch(fundraiser, fundraiserIdentitySet) {
  const fundraiserId = getGiftFundraiserId(fundraiser);
  return Boolean(fundraiserId && fundraiserIdentitySet.has(fundraiserId));
}

function isFreshSummaryCache(cachedAt, maxAgeMs = SUMMARY_CACHE_TTL_MS) {
  if (!cachedAt) return false;
  const cachedTime = new Date(cachedAt).getTime();
  return Number.isFinite(cachedTime) && Date.now() - cachedTime <= maxAgeMs;
}

async function getCachedBlackbaudSummary(workspaceUserId, cacheKey) {
  if (!workspaceUserId || !cacheKey) return null;
  const rows = await sql`
    SELECT blackbaud_summary_cache, blackbaud_summary_cached_at, blackbaud_summary_cache_key
    FROM users
    WHERE id = ${workspaceUserId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row?.blackbaud_summary_cache) return null;
  if (String(row.blackbaud_summary_cache_key || "") !== String(cacheKey)) return null;
  return isFreshSummaryCache(row.blackbaud_summary_cached_at)
    ? row.blackbaud_summary_cache
    : null;
}

async function saveCachedBlackbaudSummary(workspaceUserId, cacheKey, payload) {
  if (!workspaceUserId || !cacheKey || !payload) return;
  await sql`
    UPDATE users
    SET blackbaud_summary_cache = ${JSON.stringify(payload)}::jsonb,
        blackbaud_summary_cache_key = ${String(cacheKey)},
        blackbaud_summary_cached_at = NOW(),
        updated_at = NOW()
    WHERE id = ${workspaceUserId}
  `;
}

function getSummaryIdentityCacheParts(workspaceUser) {
  return [
    workspaceUser.id,
    workspaceUser.blackbaud_constituent_id || "",
    workspaceUser.blackbaud_lookup_id || "",
    normalizeBlackbaudFundraiserAliasIds(workspaceUser.blackbaud_fundraiser_alias_ids).join(","),
    workspaceUser.email || "",
    workspaceUser.name || "",
  ];
}

function getLifetimeGivingCacheKey(workspaceUser, version = "v7-direct-gift-feed") {
  return [
    `metric:executive-team-standings:lifetime-giving:${version}`,
    ...getSummaryIdentityCacheParts(workspaceUser),
  ].join("|");
}

function getLegacyLifetimeGivingCacheKey(workspaceUser) {
  return getLifetimeGivingCacheKey(workspaceUser, "v6-query-multirow");
}

async function getCachedLifetimeGiving(cacheKey, { allowStale = false } = {}) {
  if (!cacheKey) return null;
  const rows = await sql`
    SELECT payload, updated_at
    FROM report_snapshots_cache
    WHERE report_key = ${cacheKey}
    LIMIT 1
  `;
  const row = rows[0];
  if (
    !row?.payload ||
    (!allowStale && !isFreshSummaryCache(row.updated_at, LIFETIME_SUMMARY_CACHE_TTL_MS))
  ) {
    return null;
  }

  const lifetimeGiving = Number(row.payload.lifetimeGiving);
  return Number.isFinite(lifetimeGiving) ? lifetimeGiving : null;
}

async function saveLifetimeGiving(cacheKey, lifetimeGiving) {
  const normalizedLifetimeGiving = Number(lifetimeGiving);
  if (!cacheKey || !Number.isFinite(normalizedLifetimeGiving)) return;
  await sql`
    INSERT INTO report_snapshots_cache (
      report_key,
      payload,
      updated_at
    )
    VALUES (
      ${cacheKey},
      ${JSON.stringify({ lifetimeGiving: normalizedLifetimeGiving })}::jsonb,
      NOW()
    )
    ON CONFLICT (report_key)
    DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;
}

function getWorkspaceFundraiserIdSet(workspaceUser) {
  return new Set(
    normalizeWorkspaceFundraiserIds(workspaceUser).map((candidate) => candidate.id),
  );
}

export function calculatePeriodGivingByWorkspaceUser({ workspaceUsers, gifts, periods, realizedPlannedGiftIds = new Set() }) {
  const uniqueGifts = dedupeGiftsById(gifts);
  return new Map(workspaceUsers.map((user) => {
    const identities = getWorkspaceFundraiserIdSet(user);
    const totals = Object.fromEntries(Object.keys(periods).map((key) => [key, identities.size ? 0 : null]));
    if (identities.size) for (const gift of uniqueGifts) {
      const type = getGiftType(gift);
      if (!CLOSED_FY_GIFT_TYPES.has(type) || (isPlannedGiftType(type) && realizedPlannedGiftIds.has(getGiftId(gift)))) continue;
      if (!getGiftFundraiserCandidates(gift).some(({ value }) => isWorkspaceFundraiserIdMatch(value, identities))) continue;
      const amount = Number(getGiftAmount(gift));
      if (!Number.isFinite(amount)) throw new Error("NXT returned an invalid credited gift amount");
      if (amount <= 0) continue;
      for (const [key, period] of Object.entries(periods)) {
        if (isInStandingsPeriod(getGiftDate(gift), period)) totals[key] += amount;
      }
    }
    return [Number(user.id), totals];
  }));
}

export async function getPeriodGivingByWorkspaceUser({ workspaceUsers, authUserId, origin, periods }) {
  if (!workspaceUsers.length) return new Map();
  const startsOn = Object.values(periods).map((period) => period.startsOn).sort()[0];
  const endsOn = Object.values(periods).map((period) => period.endsOn).sort().at(-1);
  const gifts = [];
  // One shared, sequential feed for all MGOs and periods, with the same FY credit rules.
  for (const giftType of CLOSED_FY_GIFT_TYPE_QUERIES) {
    const page = await listBlackbaudGifts({
      userId: workspaceUsers[0].id, authUserId, origin,
      searchParams: { limit: 500, gift_type: giftType, start_gift_date: startsOn, end_gift_date: endsOn },
      pageLimit: 500, maxPages: 20, includePageMetadata: true, strictResponse: true,
    });
    if (!Array.isArray(page?.gifts) || page.hasMore !== false) throw new Error("NXT comparison gift results are incomplete");
    gifts.push(...page.gifts);
  }
  const realizedPlannedGiftIds = await getRealizedPlannedGiftIds({ gifts, userId: workspaceUsers[0].id, authUserId, origin, strict: true });
  return calculatePeriodGivingByWorkspaceUser({ workspaceUsers, gifts, periods, realizedPlannedGiftIds });
}

function dedupeGiftsById(gifts) {
  const giftsById = new Map();
  for (const gift of gifts) {
    const giftId = getGiftId(gift);
    if (!giftId || giftsById.has(giftId)) continue;
    giftsById.set(giftId, gift);
  }
  return Array.from(giftsById.values());
}

export function calculateLifetimeGivingByWorkspaceUser({ workspaceUsers = [], gifts = [] } = {}) {
  const dedupedGifts = dedupeGiftsById(gifts);
  const totals = new Map();

  for (const workspaceUser of workspaceUsers) {
    const workspaceUserId = Number(workspaceUser?.id);
    if (!Number.isFinite(workspaceUserId)) continue;

    const fundraiserIds = getWorkspaceFundraiserIdSet(workspaceUser);
    if (fundraiserIds.size === 0) {
      totals.set(workspaceUserId, null);
      continue;
    }

    const { total } = calculateLifetimeFundraiserCredit({
      gifts: dedupedGifts,
      fundraiserIds,
    });
    totals.set(workspaceUserId, Number.isFinite(Number(total)) ? Number(total) : null);
  }

  return totals;
}

async function getLiveLifetimeGivingTotals({ workspaceUsers, authUserId, origin }) {
  const connectionUserId = workspaceUsers
    .map((workspaceUser) => Number(workspaceUser?.id))
    .find((workspaceUserId) => Number.isFinite(workspaceUserId));
  if (!Number.isFinite(connectionUserId) || !origin) {
    throw new Error("A connected Blackbaud user is required for lifetime solicitor credit");
  }

  const gifts = [];
  for (const giftType of LIFETIME_GIFT_TYPE_QUERIES) {
    const page = await listBlackbaudGifts({
      userId: connectionUserId,
      authUserId,
      origin,
      searchParams: {
        limit: LIFETIME_GIFT_PAGE_LIMIT,
        gift_type: giftType,
      },
      pageLimit: LIFETIME_GIFT_PAGE_LIMIT,
      maxPages: LIFETIME_GIFT_MAX_PAGES_PER_TYPE,
      includePageMetadata: true,
    });

    if (page?.hasMore) {
      throw new Error(
        `Lifetime solicitor credit needs more than ${LIFETIME_GIFT_PAGE_LIMIT * LIFETIME_GIFT_MAX_PAGES_PER_TYPE} ${giftType} gifts.`,
      );
    }
    gifts.push(...(page?.gifts || []));
  }

  return calculateLifetimeGivingByWorkspaceUser({ workspaceUsers, gifts });
}

async function getCachedLifetimeGivingWithLegacyFallback(workspaceUser, { allowStale = false } = {}) {
  const directCacheKey = getLifetimeGivingCacheKey(workspaceUser);
  const directValue = await getCachedLifetimeGiving(directCacheKey, { allowStale });
  if (directValue !== null) return directValue;

  // Preserve a known, previously completed query result during the one-time
  // migration. The old value is never used as a substitute for a failed
  // provider response unless it was actually saved by the previous calculator.
  const legacyCacheKey = getLegacyLifetimeGivingCacheKey(workspaceUser);
  return getCachedLifetimeGiving(legacyCacheKey, { allowStale });
}

export async function getLifetimeGivingTotalsForWorkspaceUsers({
  workspaceUsers = [],
  authUserId,
  origin,
} = {}) {
  const validUsers = workspaceUsers.filter((workspaceUser) =>
    Number.isFinite(Number(workspaceUser?.id)),
  );
  const totals = new Map();
  if (!origin || validUsers.length === 0) return totals;

  const usersWithFundraiserIds = validUsers.filter(
    (workspaceUser) => getWorkspaceFundraiserIdSet(workspaceUser).size > 0,
  );

  // A user without an NXT fundraiser identifier cannot safely receive a
  // credit total. Do not consume provider calls attempting to infer one.
  for (const workspaceUser of validUsers) {
    if (getWorkspaceFundraiserIdSet(workspaceUser).size === 0) {
      totals.set(Number(workspaceUser.id), null);
    }
  }

  if (usersWithFundraiserIds.length === 0) return totals;

  const cachedValues = await Promise.all(
    usersWithFundraiserIds.map(async (workspaceUser) => [
      Number(workspaceUser.id),
      await getCachedLifetimeGivingWithLegacyFallback(workspaceUser),
    ]),
  );
  for (const [workspaceUserId, lifetimeGiving] of cachedValues) {
    if (lifetimeGiving !== null) totals.set(workspaceUserId, lifetimeGiving);
  }

  // A complete fresh cache means this report refresh performs no historical
  // gift calls. Lifetime credit is intentionally refreshed at most daily.
  if (totals.size === validUsers.length) return totals;

  try {
    const liveTotals = await getLiveLifetimeGivingTotals({
      workspaceUsers: usersWithFundraiserIds,
      authUserId,
      origin,
    });
    await Promise.all(
      usersWithFundraiserIds.map(async (workspaceUser) => {
        const workspaceUserId = Number(workspaceUser.id);
        const lifetimeGiving = liveTotals.get(workspaceUserId);
        if (lifetimeGiving === null || lifetimeGiving === undefined) return;
        totals.set(workspaceUserId, lifetimeGiving);
        await saveLifetimeGiving(getLifetimeGivingCacheKey(workspaceUser), lifetimeGiving);
      }),
    );
  } catch {
    // Do not replace a valid older result with a zero when Blackbaud is slow,
    // disconnected, or rate-limited. The standings route will save a partial
    // snapshot only for the individual users without any usable cached value.
    const staleValues = await Promise.all(
      usersWithFundraiserIds.map(async (workspaceUser) => [
        Number(workspaceUser.id),
        await getCachedLifetimeGivingWithLegacyFallback(workspaceUser, { allowStale: true }),
      ]),
    );
    for (const [workspaceUserId, lifetimeGiving] of staleValues) {
      if (lifetimeGiving !== null) totals.set(workspaceUserId, lifetimeGiving);
    }
  }

  return totals;
}

async function getLiveBlackbaudAttributedGiving({
  workspaceUser,
  authUserId,
  origin,
  fiscalYearStart,
  fiscalYearEnd,
  debug = false,
  requireComplete = false,
}) {
  const workspaceFundraiserIds = normalizeWorkspaceFundraiserIds(workspaceUser);
  const fundraiserIdentitySet = new Set(
    workspaceFundraiserIds.map((candidate) => candidate.id),
  );
  if (fundraiserIdentitySet.size === 0) {
    if (requireComplete) throw new Error("NXT fundraiser identity is unavailable");
    return debug
      ? {
          closedTotal: 0,
          debug: {
            workspaceUser: {
              id: workspaceUser?.id || null,
              name: workspaceUser?.name || null,
              email: workspaceUser?.email || null,
              role: workspaceUser?.role || null,
              blackbaudConstituentId: workspaceUser?.blackbaud_constituent_id || null,
              blackbaudLookupId: workspaceUser?.blackbaud_lookup_id || null,
              blackbaudFundraiserAliasIds: normalizeBlackbaudFundraiserAliasIds(
                workspaceUser?.blackbaud_fundraiser_alias_ids,
              ),
            },
            workspaceFundraiserIdentitySet: [],
            fiscalYearRange: {
              start: fiscalYearStart,
              end: fiscalYearEnd,
            },
            reason: "no_workspace_blackbaud_ids",
          },
        }
      : 0;
  }

  const giftsById = new Map();
  const paginationByGiftType = [];
  let rawFetchedRows = 0;
  const hasFiscalYearWindow = Boolean(fiscalYearStart && fiscalYearEnd);
  for (const giftTypeQuery of CLOSED_FY_GIFT_TYPE_QUERIES) {
    const searchParams = {
      limit: 500,
      gift_type: giftTypeQuery,
    };
    if (hasFiscalYearWindow) {
      searchParams.start_gift_date = fiscalYearStart;
      searchParams.end_gift_date = fiscalYearEnd;
    }
    const typedGifts = await listBlackbaudGifts({
      userId: workspaceUser.id,
      authUserId,
      origin,
      searchParams,
      pageLimit: 500,
      maxPages: 20,
    }).catch((error) => {
      if (requireComplete) throw error;
      return [];
    });
    if (requireComplete && typedGifts.length >= 500 * 20) {
      throw new Error("NXT gift results reached the pagination limit");
    }

    rawFetchedRows += typedGifts.length;
    paginationByGiftType.push({
      giftType: giftTypeQuery,
      fetched: typedGifts.length,
      clientCap: 500 * 20,
      hitClientCap: typedGifts.length >= 500 * 20,
    });

    for (const gift of typedGifts) {
      const giftId = String(gift?.id || "").trim();
      if (!giftId) continue;
      if (!giftsById.has(giftId)) giftsById.set(giftId, gift);
    }
  }

  const realizedPlannedGiftIds = await getRealizedPlannedGiftIds({
    gifts: Array.from(giftsById.values()),
    userId: workspaceUser.id,
    authUserId,
    origin,
  });

  const fiscalStart = hasFiscalYearWindow
    ? new Date(`${fiscalYearStart}T00:00:00Z`).getTime()
    : null;
  const fiscalEnd = hasFiscalYearWindow
    ? new Date(`${fiscalYearEnd}T23:59:59Z`).getTime()
    : null;
  let closedTotal = 0;
  let fiscalYearGiftRows = 0;
  let eligibleFyGiftRows = 0;
  let excludedWrongFyCount = 0;
  let excludedWrongGiftTypeCount = 0;
  let excludedRealizedPlannedGiftCount = 0;
  let excludedNoMatchingFundraiserCount = 0;
  const countedGiftIds = [];
  const giftsMatchedByEachWorkspaceId = new Map();
  const matchedGiftRows = [];
  const sampledGifts = [];
  const unmatchedFundraiserSummary = new Map();
  for (const gift of giftsById.values()) {
    const giftDate = getGiftDate(gift);
    const giftTimestamp = giftDate ? new Date(giftDate).getTime() : Number.NaN;
    const inFiscalYear =
      !hasFiscalYearWindow ||
      (!Number.isNaN(giftTimestamp) &&
        giftTimestamp >= fiscalStart &&
        giftTimestamp <= fiscalEnd);
    if (!inFiscalYear) {
      excludedWrongFyCount += 1;
      continue;
    }

    fiscalYearGiftRows += 1;

    const giftType = getGiftType(gift);
    const giftId = getGiftId(gift);
    if (isPlannedGiftType(giftType) && realizedPlannedGiftIds.has(giftId)) {
      excludedRealizedPlannedGiftCount += 1;
      if (debug && sampledGifts.length < 50) {
        sampledGifts.push({
          id: giftId || null,
          date: giftDate || null,
          amount: Number(getGiftAmount(gift) ?? 0) || 0,
          giftType: giftType || null,
          included: false,
          exclusionReason: "realized_planned_gift_revenue",
          fundraisers: getGiftFundraiserCandidates(gift).map((candidate) => ({
            sourcePath: candidate.sourcePath,
            id: getGiftFundraiserId(candidate.value) || null,
            name: getGiftFundraiserName(candidate.value),
          })),
        });
      }
      continue;
    }
    if (!CLOSED_FY_GIFT_TYPES.has(giftType)) {
      excludedWrongGiftTypeCount += 1;
      if (debug && sampledGifts.length < 50) {
        sampledGifts.push({
          id: gift?.id || null,
          date: giftDate || null,
          amount: Number(getGiftAmount(gift) ?? 0) || 0,
          giftType: giftType || null,
          included: false,
          exclusionReason: "gift_type_not_allowed",
          fundraisers: getGiftFundraiserCandidates(gift).map((candidate) => ({
            sourcePath: candidate.sourcePath,
            id: getGiftFundraiserId(candidate.value) || null,
            name: getGiftFundraiserName(candidate.value),
          })),
        });
      }
      continue;
    }

    eligibleFyGiftRows += 1;

    const fundraiserCandidates = getGiftFundraiserCandidates(gift);
    const fundraisers = fundraiserCandidates.map((candidate) => candidate.value);
    const matchingFundraisers = fundraisers.filter((fundraiser) =>
      isWorkspaceFundraiserIdMatch(fundraiser, fundraiserIdentitySet),
    );
    const giftAmount = Number(getGiftAmount(gift) ?? 0);
    const included = matchingFundraisers.length > 0 && giftAmount > 0;
    if (included) {
      closedTotal += giftAmount;
      countedGiftIds.push(gift?.id || null);
      for (const workspaceId of fundraiserIdentitySet) {
        const matchedOnThisId = matchingFundraisers.some(
          (fundraiser) => getGiftFundraiserId(fundraiser) === workspaceId,
        );
        if (!matchedOnThisId) continue;
        const current = giftsMatchedByEachWorkspaceId.get(workspaceId) || {
          workspaceId,
          giftCount: 0,
          totalAmount: 0,
          giftIds: [],
        };
        current.giftCount += 1;
        current.totalAmount += giftAmount;
        if (current.giftIds.length < 50) current.giftIds.push(gift?.id || null);
        giftsMatchedByEachWorkspaceId.set(workspaceId, current);
      }
      if (debug && matchedGiftRows.length < 25) {
        matchedGiftRows.push({
          id: gift?.id || null,
          date: giftDate || null,
          amount: giftAmount || 0,
          giftType: giftType || null,
          matchingFundraisers: matchingFundraisers.map((fundraiser) => ({
            id: getGiftFundraiserId(fundraiser) || null,
            name: getGiftFundraiserName(fundraiser),
          })),
        });
      }
    } else if (giftAmount > 0) {
      excludedNoMatchingFundraiserCount += 1;
      for (const candidate of fundraiserCandidates) {
        const fundraiser = candidate.value;
        const summaryKey = String(
          getGiftFundraiserId(fundraiser) || getGiftFundraiserName(fundraiser) || "uncredited",
        ).trim();
        if (!summaryKey) continue;
        const current = unmatchedFundraiserSummary.get(summaryKey) || {
          id: getGiftFundraiserId(fundraiser) || null,
          name: getGiftFundraiserName(fundraiser),
          giftCount: 0,
          totalAmount: 0,
        };
        current.giftCount += 1;
        current.totalAmount += giftAmount;
        unmatchedFundraiserSummary.set(summaryKey, current);
      }
    }

    if (debug && sampledGifts.length < 50) {
      sampledGifts.push({
        id: gift?.id || null,
        date: giftDate || null,
        amount: giftAmount || 0,
        giftType: giftType || null,
        included,
        exclusionReason: included
          ? null
          : matchingFundraisers.length === 0
            ? "no_matching_fundraiser"
            : giftAmount <= 0
              ? "no_amount"
              : "excluded",
        fundraisers: fundraiserCandidates.map((candidate) => ({
          sourcePath: candidate.sourcePath,
          id: getGiftFundraiserId(candidate.value) || null,
          name: getGiftFundraiserName(candidate.value),
        })),
        matchingFundraisers: matchingFundraisers.map((fundraiser) => ({
          id: getGiftFundraiserId(fundraiser) || null,
          name: getGiftFundraiserName(fundraiser),
        })),
      });
    }
  }

  if (debug) {
    return {
      closedTotal,
      debug: {
        workspaceUser: {
          id: workspaceUser?.id || null,
          name: workspaceUser?.name || null,
          email: workspaceUser?.email || null,
          role: workspaceUser?.role || null,
          blackbaudConstituentId: workspaceUser?.blackbaud_constituent_id || null,
          blackbaudLookupId: workspaceUser?.blackbaud_lookup_id || null,
          blackbaudFundraiserAliasIds: normalizeBlackbaudFundraiserAliasIds(
            workspaceUser?.blackbaud_fundraiser_alias_ids,
          ),
        },
        workspaceFundraiserIdentitySet: Array.from(fundraiserIdentitySet),
        fiscalYearRange: hasFiscalYearWindow
          ? {
              start: fiscalYearStart,
              end: fiscalYearEnd,
            }
          : null,
        totalGiftRowsFetched: giftsById.size,
        rawFetchedRows,
        dedupedByGiftId: rawFetchedRows - giftsById.size,
        fiscalYearGiftRows,
        eligibleFyGiftRows,
        countedGiftRows: countedGiftIds.length,
        countedGiftAmountTotal: closedTotal,
        countedGiftIds: countedGiftIds.slice(0, 200),
        excludedWrongFyCount,
        excludedWrongGiftTypeCount,
        excludedRealizedPlannedGiftCount,
        excludedNoMatchingFundraiserCount,
        giftsMatchedByEachWorkspaceId: Array.from(giftsMatchedByEachWorkspaceId.values()).sort(
          (a, b) => a.workspaceId.localeCompare(b.workspaceId),
        ),
        matchedGiftRows,
        unmatchedTopFundraisers: Array.from(unmatchedFundraiserSummary.values())
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 20),
        paginationInfo: {
          byGiftType: paginationByGiftType,
          hitClientCap: paginationByGiftType.some((entry) => entry.hitClientCap),
        },
        sampledGifts,
      },
    };
  }

  return closedTotal;
}

export function getClosedFiscalYearWindow(now = new Date()) {
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const fiscalStartYear = currentMonth >= 6 ? currentYear : currentYear - 1;
  const fiscalEndYear = fiscalStartYear + 1;
  const priorFiscalStartYear = fiscalStartYear - 1;
  const priorFiscalEndYear = fiscalEndYear - 1;

  return {
    currentFY: `FY${String(fiscalEndYear).slice(-2)}`,
    fiscalYearStart: `${fiscalStartYear}-07-01`,
    fiscalYearEnd: `${fiscalEndYear}-06-30`,
    priorFY: `FY${String(priorFiscalEndYear).slice(-2)}`,
    priorFiscalYearStart: `${priorFiscalStartYear}-07-01`,
    priorFiscalYearEnd: `${priorFiscalEndYear}-06-30`,
  };
}

export async function getClosedFiscalYearSummary({
  workspaceUser,
  authUserId,
  origin,
  now,
  requireComplete = false,
}) {
  const fiscal = getClosedFiscalYearWindow(now);
  if (!workspaceUser?.id || !origin) {
    if (requireComplete) throw new Error("NXT gift summary context is unavailable");
    return { ...fiscal, closedThisFY: 0, closedPriorFY: 0 };
  }

  const cacheKey = [
    "closed-summary-v4",
    fiscal.currentFY,
    fiscal.priorFY,
    ...getSummaryIdentityCacheParts(workspaceUser),
  ].join("|");
  const cachedSummary = await getCachedBlackbaudSummary(workspaceUser.id, cacheKey);
  // Ranked scores must not reuse older cache entries that may contain fallback zeros.
  if (cachedSummary && typeof cachedSummary === "object" && (!requireComplete || cachedSummary.verifiedComplete === true)) {
    return {
      ...fiscal,
      closedThisFY: Number(cachedSummary.closedThisFY || 0),
      closedPriorFY: Number(cachedSummary.closedPriorFY || 0),
    };
  }

  const [closedThisFY, closedPriorFY] = await Promise.all([
    getLiveBlackbaudAttributedGiving({
      workspaceUser,
      authUserId,
      origin,
      fiscalYearStart: fiscal.fiscalYearStart,
      fiscalYearEnd: fiscal.fiscalYearEnd,
      requireComplete,
    }).catch((error) => {
      if (requireComplete) throw error;
      return 0;
    }),
    getLiveBlackbaudAttributedGiving({
      workspaceUser,
      authUserId,
      origin,
      fiscalYearStart: fiscal.priorFiscalYearStart,
      fiscalYearEnd: fiscal.priorFiscalYearEnd,
      requireComplete,
    }).catch((error) => {
      if (requireComplete) throw error;
      return 0;
    }),
  ]);

  const summary = {
    closedThisFY: Number(closedThisFY || 0),
    closedPriorFY: Number(closedPriorFY || 0),
    ...(requireComplete ? { verifiedComplete: true } : {}),
  };
  await saveCachedBlackbaudSummary(workspaceUser.id, cacheKey, summary).catch(() => {});
  return { ...fiscal, ...summary };
}

export async function getLifetimeGivingTotal({ workspaceUser, authUserId, origin }) {
  if (!workspaceUser?.id || !origin) return null;
  const totals = await getLifetimeGivingTotalsForWorkspaceUsers({
    workspaceUsers: [workspaceUser],
    authUserId,
    origin,
  });
  return totals.get(Number(workspaceUser.id)) ?? null;
}

export function getClosedFiscalYearWindowForLabel(label) {
  const match = String(label || "")
    .trim()
    .match(/^FY(\d{2}|\d{4})$/i);
  if (!match) return null;

  const endYearToken = match[1];
  const endYear = endYearToken.length === 2 ? 2000 + Number(endYearToken) : Number(endYearToken);
  if (!Number.isInteger(endYear) || endYear < 2000 || endYear > 2100) return null;

  const startYear = endYear - 1;
  return {
    fiscalYearLabel: `FY${String(endYear).slice(-2)}`,
    fiscalYearStart: `${startYear}-07-01`,
    fiscalYearEnd: `${endYear}-06-30`,
  };
}

export async function getClosedFiscalYearDiagnostic({
  workspaceUser,
  authUserId,
  origin,
  fiscalYearLabel,
  now,
}) {
  const fiscal =
    getClosedFiscalYearWindowForLabel(fiscalYearLabel) ||
    (() => {
      const current = getClosedFiscalYearWindow(now);
      return {
        fiscalYearLabel: current.currentFY,
        fiscalYearStart: current.fiscalYearStart,
        fiscalYearEnd: current.fiscalYearEnd,
      };
    })();

  const payload = await getLiveBlackbaudAttributedGiving({
    workspaceUser,
    authUserId,
    origin,
    fiscalYearStart: fiscal.fiscalYearStart,
    fiscalYearEnd: fiscal.fiscalYearEnd,
    debug: true,
  });

  return {
    fiscalYearLabel: fiscal.fiscalYearLabel,
    closedTotal: Number(payload?.closedTotal || 0),
    debug: payload?.debug || null,
  };
}
