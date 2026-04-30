import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import {
  getBlackbaudConstituentById,
  getBlackbaudFundraiserById,
  listBlackbaudGifts,
} from "@/app/api/utils/blackbaud";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";

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

const SUMMARY_CACHE_TTL_MS = 15 * 60 * 1000;

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
  return normalizeGiftToken(
    firstDefined(gift, [
      "gift_type",
      "giftType",
      "type",
      "type_name",
      "category",
    ]) || "",
  );
}

function getGiftFundraiserCandidates(gift) {
  const candidates = [];

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

  for (const path of arrayPaths) {
    const value = getNestedValue(gift, path);
    if (Array.isArray(value)) {
      candidates.push(
        ...value.filter(Boolean).map((item) => ({
          sourcePath: path,
          value: item,
        })),
      );
    }
  }

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

  for (const path of singlePaths) {
    const value = getNestedValue(gift, path);
    if (typeof value === "string" && value.trim()) {
      candidates.push({
        sourcePath: path,
        value: { fundraiser_name: value.trim() },
      });
    } else if (value && typeof value === "object") {
      candidates.push({
        sourcePath: path,
        value,
      });
    }
  }

  return candidates.filter(Boolean);
}

function getGiftFundraisers(gift) {
  return getGiftFundraiserCandidates(gift).map((candidate) => candidate.value);
}

function normalizePersonName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function getGiftFundraiserName(fundraiser) {
  const direct = String(
    firstDefined(fundraiser, [
      "fundraiser_name",
      "fundraiserName",
      "name",
      "full_name",
      "fullName",
      "display_name",
      "displayName",
    ]) || "",
  ).trim();

  if (direct) {
    return direct;
  }

  const first = String(
    firstDefined(fundraiser, ["first_name", "firstName", "first"]) || "",
  ).trim();
  const middle = String(
    firstDefined(fundraiser, ["middle_name", "middleName", "middle"]) || "",
  ).trim();
  const last = String(
    firstDefined(fundraiser, ["last_name", "lastName", "last"]) || "",
  ).trim();

  return [first, middle, last].filter(Boolean).join(" ").trim();
}

function getGiftFundraiserId(fundraiser) {
  return String(
    fundraiser?.constituent_id || fundraiser?.fundraiser_id || fundraiser?.id || "",
  ).trim();
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

function getFundraiserShapeKey(candidate) {
  const fundraiser = candidate?.value || {};
  const sampleKeys = Object.keys(fundraiser).sort();
  const idFieldsPresent = [
    "constituent_id",
    "fundraiser_id",
    "id",
  ].filter((key) => fundraiser?.[key] !== undefined && fundraiser?.[key] !== null && fundraiser?.[key] !== "");
  const nameFieldsPresent = [
    "fundraiser_name",
    "fundraiserName",
    "name",
    "full_name",
    "fullName",
    "display_name",
    "displayName",
    "first_name",
    "firstName",
    "last_name",
    "lastName",
  ].filter((key) => fundraiser?.[key] !== undefined && fundraiser?.[key] !== null && fundraiser?.[key] !== "");

  return JSON.stringify({
    sourcePath: candidate?.sourcePath || "unknown",
    idFieldsPresent,
    nameFieldsPresent,
    sampleKeys,
  });
}

function getWorkspaceNameTokens(name) {
  const tokens = normalizePersonName(name);
  if (tokens.length < 2) return null;
  return {
    first: tokens[0],
    last: tokens[tokens.length - 1],
  };
}

function fundraiserNameLooksLikeWorkspaceUser(name, workspaceName) {
  const fundraiserTokens = getWorkspaceNameTokens(name);
  const workspaceTokens = getWorkspaceNameTokens(workspaceName);
  if (!fundraiserTokens || !workspaceTokens) return false;

  return (
    fundraiserTokens.first === workspaceTokens.first &&
    fundraiserTokens.last === workspaceTokens.last
  );
}

function isWorkspaceFundraiserIdMatch(fundraiser, fundraiserIdentitySet) {
  const fundraiserId = getGiftFundraiserId(fundraiser);
  return Boolean(fundraiserId && fundraiserIdentitySet.has(fundraiserId));
}

function isWorkspaceFundraiserMatch(fundraiser, workspaceUser, fundraiserIdentitySet) {
  const fundraiserId = String(
    fundraiser?.constituent_id || fundraiser?.fundraiser_id || fundraiser?.id || "",
  ).trim();
  if (fundraiserId && fundraiserIdentitySet.has(fundraiserId)) {
    return true;
  }

  const workspaceTokens = normalizePersonName(
    workspaceUser?.name || workspaceUser?.full_name || workspaceUser?.display_name,
  );
  const fundraiserTokens = normalizePersonName(getGiftFundraiserName(fundraiser));

  if (workspaceTokens.length < 2 || fundraiserTokens.length < 2) {
    return false;
  }

  const workspaceFirst = workspaceTokens[0];
  const workspaceLast = workspaceTokens[workspaceTokens.length - 1];
  const fundraiserFirst = fundraiserTokens[0];
  const fundraiserLast = fundraiserTokens[fundraiserTokens.length - 1];

  if (workspaceFirst === fundraiserFirst && workspaceLast === fundraiserLast) {
    return true;
  }

  const workspaceFull = workspaceTokens.join(" ");
  const fundraiserFull = fundraiserTokens.join(" ");

  return (
    fundraiserFull.includes(workspaceFull) ||
    workspaceFull.includes(fundraiserFull) ||
    fundraiserLast === workspaceLast
  );
}

async function resolveFundraiserDisplayName({
  fundraiser,
  workspaceUser,
  authUserId,
  origin,
  cache,
}) {
  const directName = getGiftFundraiserName(fundraiser);
  if (directName) {
    return directName;
  }

  const fundraiserId = String(
    fundraiser?.constituent_id || fundraiser?.fundraiser_id || fundraiser?.id || "",
  ).trim();
  if (!fundraiserId) {
    return null;
  }

  if (cache.has(fundraiserId)) {
    return cache.get(fundraiserId) || null;
  }

  const fundraiserRecord = await getBlackbaudFundraiserById({
    userId: workspaceUser.id,
    authUserId,
    origin,
    fundraiserId,
  }).catch(() => null);

  const fundraiserRecordName = String(fundraiserRecord?.name || "").trim() || null;
  if (fundraiserRecordName) {
    cache.set(fundraiserId, fundraiserRecordName);
    return fundraiserRecordName;
  }

  const resolved = await getBlackbaudConstituentById({
    userId: workspaceUser.id,
    authUserId,
    origin,
    constituentId: fundraiserId,
  }).catch(() => null);

  const resolvedName = String(resolved?.name || "").trim() || null;
  cache.set(fundraiserId, resolvedName);
  return resolvedName;
}

function isFreshSummaryCache(cachedAt) {
  if (!cachedAt) return false;
  const cachedTime = new Date(cachedAt).getTime();
  if (!Number.isFinite(cachedTime)) return false;
  return Date.now() - cachedTime <= SUMMARY_CACHE_TTL_MS;
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
  if (!isFreshSummaryCache(row.blackbaud_summary_cached_at)) return null;
  return row.blackbaud_summary_cache;
}

async function saveCachedBlackbaudSummary(workspaceUserId, cacheKey, payload) {
  if (!workspaceUserId || !cacheKey || !payload) return;

  await sql`
    UPDATE users
    SET
      blackbaud_summary_cache = ${JSON.stringify(payload)}::jsonb,
      blackbaud_summary_cache_key = ${String(cacheKey)},
      blackbaud_summary_cached_at = NOW(),
      updated_at = NOW()
    WHERE id = ${workspaceUserId}
  `;
}

async function getMatchingFundraisers({
  fundraisers,
  workspaceUser,
  fundraiserIdentitySet,
  authUserId,
  origin,
  resolvedNameCache,
}) {
  const matches = [];

  for (const fundraiser of fundraisers) {
    if (isWorkspaceFundraiserIdMatch(fundraiser, fundraiserIdentitySet)) {
      matches.push(fundraiser);
      continue;
    }

    // Debug-only/fallback name resolution can help explain mismatches, but
    // inclusion for Closed FY is still driven by the credited Blackbaud ID.
    const resolvedName = await resolveFundraiserDisplayName({
      fundraiser,
      workspaceUser,
      authUserId,
      origin,
      cache: resolvedNameCache,
    });

    if (!resolvedName) {
      continue;
    }

    if (
      isWorkspaceFundraiserMatch(
        { ...fundraiser, fundraiser_name: resolvedName },
        workspaceUser,
        fundraiserIdentitySet,
      )
    ) {
      matches.push({ ...fundraiser, fundraiser_name: resolvedName });
    }
  }

  return matches;
}

async function getLiveBlackbaudClosedThisFY({
  user,
  authUserId,
  origin,
  fiscalYearStart,
  fiscalYearEnd,
  debug = false,
}) {
  const workspaceFundraiserIds = normalizeWorkspaceFundraiserIds(user);
  const fundraiserIdentitySet = new Set(
    workspaceFundraiserIds.map((candidate) => candidate.id),
  );
  const pageLimit = 500;
  const maxPages = 20;
  const giftsById = new Map();
  const paginationByGiftType = [];
  let rawFetchedRows = 0;

  for (const giftTypeQuery of CLOSED_FY_GIFT_TYPE_QUERIES) {
    const typedGifts = await listBlackbaudGifts({
      userId: user.id,
      authUserId,
      origin,
      searchParams: {
        limit: pageLimit,
        gift_type: giftTypeQuery,
        start_gift_date: fiscalYearStart,
        end_gift_date: fiscalYearEnd,
      },
      pageLimit,
      maxPages,
    }).catch(() => []);

    rawFetchedRows += typedGifts.length;
    paginationByGiftType.push({
      giftType: giftTypeQuery,
      fetched: typedGifts.length,
      clientCap: pageLimit * maxPages,
      hitClientCap: typedGifts.length >= pageLimit * maxPages,
      maybeHasMorePages: typedGifts.length >= pageLimit * maxPages,
    });

    for (const gift of typedGifts) {
      const giftId = String(gift?.id || "").trim();
      if (!giftId) continue;
      if (!giftsById.has(giftId)) {
        giftsById.set(giftId, gift);
      }
    }
  }

  const gifts = Array.from(giftsById.values());

  const fiscalStart = new Date(`${fiscalYearStart}T00:00:00Z`).getTime();
  const fiscalEnd = new Date(`${fiscalYearEnd}T23:59:59Z`).getTime();
  const workspaceFundraiserName =
    user?.name || user?.full_name || user?.display_name || null;
  const resolvedNameCache = new Map();

  let closedTotal = 0;
  const debugRows = [];
  const matchedRows = [];
  let fiscalYearGiftRows = 0;
  let eligibleFyGiftRows = 0;
  let excludedWrongFyCount = 0;
  let excludedWrongGiftTypeCount = 0;
  let excludedPledgePaymentCount = 0;
  let excludedNoMatchingFundraiserCount = 0;
  const unmatchedFundraiserSummary = new Map();
  const fieldShapesSeen = new Map();
  const fundraiserIdsSeenForWorkspaceName = new Map();
  const giftsMatchedByEachWorkspaceId = new Map();
  const countedGiftIds = [];

  for (const gift of gifts) {
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
    const typeAllowed = CLOSED_FY_GIFT_TYPES.has(giftType);
    if (!typeAllowed) {
      excludedWrongGiftTypeCount += 1;
      if (giftType === normalizeGiftToken("PledgePayment")) {
        excludedPledgePaymentCount += 1;
      }
      if (debug && debugRows.length < 50) {
        debugRows.push({
          id: gift?.id || null,
          date: giftDate || null,
          amount: Number(getGiftAmount(gift) ?? 0) || 0,
          giftType: giftType || null,
          fundraisers: [],
          matchingFundraisers: [],
          included: false,
          exclusionReason: "gift_type_not_allowed",
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
    const hasSolicitorCredit = matchingFundraisers.length > 0;
    const giftAmount = Number(getGiftAmount(gift) ?? 0);
    const included =
      hasSolicitorCredit && giftAmount > 0;
    let debugFundraisers = null;

    if (debug) {
      debugFundraisers = [];
      for (const candidate of fundraiserCandidates) {
        const fundraiser = candidate.value;
        const resolvedName =
          getGiftFundraiserName(fundraiser) ||
          (await resolveFundraiserDisplayName({
            fundraiser,
            workspaceUser: user,
            authUserId,
            origin,
            cache: resolvedNameCache,
          })) ||
          null;

        const shapeKey = getFundraiserShapeKey(candidate);
        const existingShape = fieldShapesSeen.get(shapeKey);
        if (existingShape) {
          existingShape.count += 1;
        } else {
          fieldShapesSeen.set(shapeKey, {
            ...JSON.parse(shapeKey),
            count: 1,
          });
        }

        if (resolvedName && fundraiserNameLooksLikeWorkspaceUser(resolvedName, workspaceFundraiserName)) {
          const fundraiserId = getGiftFundraiserId(fundraiser) || resolvedName;
          const current = fundraiserIdsSeenForWorkspaceName.get(fundraiserId) || {
            id: getGiftFundraiserId(fundraiser) || null,
            name: resolvedName,
            count: 0,
          };
          current.count += 1;
          fundraiserIdsSeenForWorkspaceName.set(fundraiserId, current);
        }

        debugFundraisers.push({
          id:
            fundraiser?.constituent_id ||
            fundraiser?.fundraiser_id ||
            fundraiser?.id ||
            null,
          name: resolvedName,
          raw: fundraiser,
        });
      }
    }

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
        if (current.giftIds.length < 50) {
          current.giftIds.push(gift?.id || null);
        }
        giftsMatchedByEachWorkspaceId.set(workspaceId, current);
      }
      if (debug && matchedRows.length < 25) {
        matchedRows.push({
          id: gift?.id || null,
          date: giftDate || null,
          amount: giftAmount || 0,
          giftType: giftType || null,
          matchingFundraisers: matchingFundraisers.map((fundraiser) => ({
            id: getGiftFundraiserId(fundraiser) || null,
            name: getGiftFundraiserName(fundraiser) || null,
          })),
        });
      }
    } else if (debug && giftAmount > 0) {
      excludedNoMatchingFundraiserCount += 1;
      for (const fundraiser of debugFundraisers || []) {
        const summaryKey = String(fundraiser.id || fundraiser.name || "uncredited").trim();
        if (!summaryKey) continue;
        const current = unmatchedFundraiserSummary.get(summaryKey) || {
          id: fundraiser.id || null,
          name: fundraiser.name || null,
          giftCount: 0,
          totalAmount: 0,
        };
        current.giftCount += 1;
        current.totalAmount += giftAmount;
        unmatchedFundraiserSummary.set(summaryKey, current);
      }
    }

    if (debug && debugRows.length < 50) {
      debugRows.push({
        id: gift?.id || null,
        date: giftDate || null,
        amount: giftAmount || 0,
        giftType: giftType || null,
        fundraisers: debugFundraisers || [],
        matchingFundraisers: matchingFundraisers.map((fundraiser) => ({
          id: getGiftFundraiserId(fundraiser) || null,
          name: getGiftFundraiserName(fundraiser) || null,
        })),
        included,
        exclusionReason: included
          ? null
          : !hasSolicitorCredit
            ? "no_matching_fundraiser"
            : giftAmount <= 0
              ? "no_amount"
              : "excluded",
      });
    }
  }

  if (debug) {
    return {
      closedTotal,
      debug: {
        workspaceFundraiserName,
        workspaceFundraiserIdUsed: workspaceFundraiserIds[0]?.id || null,
        workspaceFundraiserAllIdsConsidered: workspaceFundraiserIds,
        workspaceFundraiserIdentitySet: Array.from(fundraiserIdentitySet),
        totalGiftRowsFetched: gifts.length,
        fiscalYearGiftRows,
        eligibleFyGiftRows,
        countedGiftRows: countedGiftIds.length,
        countedGiftAmountTotal: closedTotal,
        countedGiftIds: countedGiftIds.slice(0, 200),
        excludedPledgePaymentCount,
        excludedWrongFyCount,
        excludedWrongGiftTypeCount,
        excludedNoMatchingFundraiserCount,
        giftFundraiserFieldShapesSeen: Array.from(fieldShapesSeen.values())
          .sort((a, b) => b.count - a.count),
        fundraiserIdsSeenForWorkspaceName: Array.from(
          fundraiserIdsSeenForWorkspaceName.values(),
        ).sort((a, b) => b.count - a.count),
        giftsMatchedByEachWorkspaceId: Array.from(
          giftsMatchedByEachWorkspaceId.values(),
        ).sort((a, b) => a.workspaceId.localeCompare(b.workspaceId)),
        matchedGiftRows: matchedRows,
        unmatchedTopFundraisers: Array.from(unmatchedFundraiserSummary.values())
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 15),
        paginationInfo: {
          pageLimit,
          maxPages,
          totalFetched: gifts.length,
          rawFetchedRows,
          dedupedByGiftId: rawFetchedRows - gifts.length,
          hitClientCap: paginationByGiftType.some((entry) => entry.hitClientCap),
          maybeHasMorePages: paginationByGiftType.some((entry) => entry.maybeHasMorePages),
          byGiftType: paginationByGiftType,
        },
        fiscalYearRange: {
          start: fiscalYearStart,
          end: fiscalYearEnd,
        },
        sampledGifts: debugRows,
      },
    };
  }

  return closedTotal;
}

// GET prospect summary stats for dashboard
export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth();
    if (!session || !session.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceUser: user, sessionUser, isActing } = await getWorkspaceUser(
      session,
      request,
    );
    if (!user) {
      return Response.json({
        activeCount: 0,
        totalAskPipeline: 0,
        closedThisFY: 0,
      });
    }
    const authUserId = isActing ? sessionUser.id : user.id;
    const origin = request?.url ? new URL(request.url).origin : null;
    const debug = request?.url
      ? new URL(request.url).searchParams.get("debug") === "1"
      : false;

    // Count active prospects
    const activeResult = await sql`
      SELECT
        COUNT(*) as active_count,
        COALESCE(SUM(ask_amount), 0) as total_pipeline
      FROM prospects
      WHERE user_id = ${user.id} AND status = 'Active'
    `;

    // Calculate current fiscal year window (July 1 - June 30)
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const fiscalStartYear = currentMonth >= 6 ? currentYear : currentYear - 1;
    const fiscalEndYear = fiscalStartYear + 1;
    const currentFY = `FY${String(fiscalEndYear).slice(-2)}`;
    const fiscalYearStart = `${fiscalStartYear}-07-01`;
    const fiscalYearEnd = `${fiscalEndYear}-06-30`;
    const summaryCacheKey = [
      currentFY,
      user.id,
      user.blackbaud_constituent_id || "",
      user.blackbaud_lookup_id || "",
      user.email || "",
      user.name || "",
    ].join("|");

    let closedThisFY = 0;
    let closedDebug = null;

    if (origin) {
      if (!debug) {
        const cachedSummary = await getCachedBlackbaudSummary(user.id, summaryCacheKey);
        if (cachedSummary && typeof cachedSummary === "object") {
          closedThisFY = Number(cachedSummary.closedThisFY || 0);
        } else {
          closedThisFY = Number(
            await getLiveBlackbaudClosedThisFY({
              user,
              authUserId,
              origin,
              fiscalYearStart,
              fiscalYearEnd,
              debug: false,
            }).catch(() => 0),
          );

          await saveCachedBlackbaudSummary(user.id, summaryCacheKey, {
            currentFY,
            closedThisFY,
          });
        }
      } else {
        const closedPayload = await getLiveBlackbaudClosedThisFY({
          user,
          authUserId,
          origin,
          fiscalYearStart,
          fiscalYearEnd,
          debug: true,
        }).catch(() => ({ closedTotal: 0, debug: null }));

        closedThisFY = Number(closedPayload?.closedTotal || 0);
        closedDebug = closedPayload?.debug || null;
      }
    }

    return Response.json({
      activeCount: parseInt(activeResult[0].active_count) || 0,
      totalAskPipeline: parseFloat(activeResult[0].total_pipeline) || 0,
      closedThisFY,
      currentFY,
      ...(debug ? { closedDebug } : {}),
    });
  } catch (error) {
    console.error("Error fetching prospect summary:", error);
    return Response.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
