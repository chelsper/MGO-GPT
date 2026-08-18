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
  debug = false,
}) {
  const workspaceFundraiserIds = normalizeWorkspaceFundraiserIds(workspaceUser);
  const fundraiserIdentitySet = new Set(
    workspaceFundraiserIds.map((candidate) => candidate.id),
  );
  if (fundraiserIdentitySet.size === 0) {
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

  const fiscalStart = new Date(`${fiscalYearStart}T00:00:00Z`).getTime();
  const fiscalEnd = new Date(`${fiscalYearEnd}T23:59:59Z`).getTime();
  let closedTotal = 0;
  let fiscalYearGiftRows = 0;
  let eligibleFyGiftRows = 0;
  let excludedWrongFyCount = 0;
  let excludedWrongGiftTypeCount = 0;
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
      !Number.isNaN(giftTimestamp) &&
      giftTimestamp >= fiscalStart &&
      giftTimestamp <= fiscalEnd;
    if (!inFiscalYear) {
      excludedWrongFyCount += 1;
      continue;
    }

    fiscalYearGiftRows += 1;

    const giftType = getGiftType(gift);
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
        fiscalYearRange: {
          start: fiscalYearStart,
          end: fiscalYearEnd,
        },
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
    normalizeBlackbaudFundraiserAliasIds(workspaceUser.blackbaud_fundraiser_alias_ids).join(","),
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

  const payload = await getLiveBlackbaudClosedThisFY({
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
