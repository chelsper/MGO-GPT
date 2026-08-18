import sql from "@/app/api/utils/sql";
import { listBlackbaudGifts } from "@/app/api/utils/blackbaud";

const SUMMARY_CACHE_TTL_MS = 60 * 60 * 1000;

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

function isFreshSummaryCache(cachedAt) {
  if (!cachedAt) return false;
  const cachedTime = new Date(cachedAt).getTime();
  return Number.isFinite(cachedTime) && Date.now() - cachedTime <= SUMMARY_CACHE_TTL_MS;
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

async function getLiveBlackbaudClosedThisFY({
  workspaceUser,
  authUserId,
  origin,
  fiscalYearStart,
  fiscalYearEnd,
}) {
  const workspaceFundraiserIds = normalizeWorkspaceFundraiserIds(workspaceUser);
  const fundraiserIdentitySet = new Set(
    workspaceFundraiserIds.map((candidate) => candidate.id),
  );
  if (fundraiserIdentitySet.size === 0) return 0;

  const giftsById = new Map();
  for (const giftTypeQuery of CLOSED_FY_GIFT_TYPE_QUERIES) {
    const typedGifts = await listBlackbaudGifts({
      userId: workspaceUser.id,
      authUserId,
      origin,
      searchParams: {
        limit: 500,
        gift_type: giftTypeQuery,
        start_gift_date: fiscalYearStart,
        end_gift_date: fiscalYearEnd,
      },
      pageLimit: 500,
      maxPages: 20,
    }).catch(() => []);

    for (const gift of typedGifts) {
      const giftId = String(gift?.id || "").trim();
      if (!giftId) continue;
      if (!giftsById.has(giftId)) giftsById.set(giftId, gift);
    }
  }

  const fiscalStart = new Date(`${fiscalYearStart}T00:00:00Z`).getTime();
  const fiscalEnd = new Date(`${fiscalYearEnd}T23:59:59Z`).getTime();
  let closedTotal = 0;
  for (const gift of giftsById.values()) {
    const giftDate = getGiftDate(gift);
    const giftTimestamp = giftDate ? new Date(giftDate).getTime() : Number.NaN;
    const inFiscalYear =
      !Number.isNaN(giftTimestamp) &&
      giftTimestamp >= fiscalStart &&
      giftTimestamp <= fiscalEnd;
    if (!inFiscalYear) continue;

    const giftType = getGiftType(gift);
    if (!CLOSED_FY_GIFT_TYPES.has(giftType)) continue;

    const fundraiserCandidates = getGiftFundraiserCandidates(gift);
    const fundraisers = fundraiserCandidates.map((candidate) => candidate.value);
    const matchingFundraisers = fundraisers.filter((fundraiser) =>
      isWorkspaceFundraiserIdMatch(fundraiser, fundraiserIdentitySet),
    );
    const giftAmount = Number(getGiftAmount(gift) ?? 0);
    if (matchingFundraisers.length > 0 && giftAmount > 0) {
      closedTotal += giftAmount;
    }
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
}) {
  const fiscal = getClosedFiscalYearWindow(now);
  if (!workspaceUser?.id || !origin) {
    return { ...fiscal, closedThisFY: 0, closedPriorFY: 0 };
  }

  const cacheKey = [
    "closed-summary-v3",
    fiscal.currentFY,
    fiscal.priorFY,
    workspaceUser.id,
    workspaceUser.blackbaud_constituent_id || "",
    workspaceUser.blackbaud_lookup_id || "",
    workspaceUser.email || "",
    workspaceUser.name || "",
  ].join("|");
  const cachedSummary = await getCachedBlackbaudSummary(workspaceUser.id, cacheKey);
  if (cachedSummary && typeof cachedSummary === "object") {
    return {
      ...fiscal,
      closedThisFY: Number(cachedSummary.closedThisFY || 0),
      closedPriorFY: Number(cachedSummary.closedPriorFY || 0),
    };
  }

  const [closedThisFY, closedPriorFY] = await Promise.all([
    getLiveBlackbaudClosedThisFY({
      workspaceUser,
      authUserId,
      origin,
      fiscalYearStart: fiscal.fiscalYearStart,
      fiscalYearEnd: fiscal.fiscalYearEnd,
    }).catch(() => 0),
    getLiveBlackbaudClosedThisFY({
      workspaceUser,
      authUserId,
      origin,
      fiscalYearStart: fiscal.priorFiscalYearStart,
      fiscalYearEnd: fiscal.priorFiscalYearEnd,
    }).catch(() => 0),
  ]);

  const summary = {
    closedThisFY: Number(closedThisFY || 0),
    closedPriorFY: Number(closedPriorFY || 0),
  };
  await saveCachedBlackbaudSummary(workspaceUser.id, cacheKey, summary).catch(() => {});
  return { ...fiscal, ...summary };
}
