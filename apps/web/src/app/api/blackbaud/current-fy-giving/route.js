import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import {
  getReportAccessForUser,
  PORTFOLIO_GIVING_REPORT_KEY,
} from "@/app/api/utils/reportAccess";
import {
  getBlackbaudConfigIssues,
  getBlackbaudGift,
  listBlackbaudGifts,
} from "@/app/api/utils/blackbaud";
import {
  calculateCurrentFiscalYearGiving,
  getCurrentFiscalYearWindow,
  isPledgePaymentGiftType,
} from "../../utils/currentFyGiving.js";
import { getRealizedPlannedGiftIds } from "../../utils/plannedGiftRevenue.js";

const MAX_CONSTITUENT_IDS = 50;
const CACHE_TTL_MS = 5 * 60 * 1000;
const DETAIL_CACHE_TTL_MS = 15 * 60 * 1000;
const DETAIL_LOOKUP_CONCURRENCY = 4;
const CONSTITUENT_GIFT_LOOKUP_CONCURRENCY = 4;
const PORTFOLIO_GIFT_PAGE_LIMIT = 500;
const PORTFOLIO_GIFT_MAX_PAGES = 2;
const CONSTITUENT_GIFT_MAX_PAGES = 4;
const summaryCache = new Map();
const giftDetailCache = new Map();
function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getGiftId(gift) {
  return gift?.id || gift?.gift_id || gift?.giftId || null;
}

function getGiftType(gift) {
  const value =
    gift?.gift_type || gift?.giftType || gift?.type || gift?.type_name || gift?.category;
  if (value && typeof value === "object") {
    return normalizeToken(
      value.name || value.description || value.value || value.label || value.id,
    );
  }
  return normalizeToken(value);
}

function getGiftConstituentId(gift) {
  return String(
    gift?.constituent_id ||
      gift?.constituentId ||
      gift?.constituent?.id ||
      gift?.donor_id ||
      gift?.donorId ||
      gift?.donor?.id ||
      "",
  ).trim();
}

function shouldEnrichPledgePayment(gift, requestedConstituentIds) {
  const giftId = getGiftId(gift);
  const directConstituentId = getGiftConstituentId(gift);

  // Gift-list responses can include an empty or incomplete soft-credit array.
  // The single-gift endpoint is authoritative whenever the gift belongs to a
  // different direct constituent than the portfolio record being summarized.
  return (
    Boolean(giftId) &&
    isPledgePaymentGiftType(getGiftType(gift)) &&
    Boolean(directConstituentId) &&
    !requestedConstituentIds.has(directConstituentId)
  );
}

async function getCachedGiftDetail({ userId, authUserId, origin, giftId }) {
  const cacheKey = `${authUserId}:${giftId}`;
  const cached = giftDetailCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.gift;
  }

  const gift = await getBlackbaudGift({
    userId,
    authUserId,
    origin,
    giftId,
  });
  giftDetailCache.set(cacheKey, {
    expiresAt: Date.now() + DETAIL_CACHE_TTL_MS,
    gift,
  });
  return gift;
}

async function enrichAssociatedPledgePayments({
  gifts,
  constituentIds,
  userId,
  authUserId,
  origin,
}) {
  const requestedConstituentIds = new Set(constituentIds);
  const candidateIds = [
    ...new Set(
      gifts
        .filter((gift) => shouldEnrichPledgePayment(gift, requestedConstituentIds))
        .map(getGiftId),
    ),
  ];

  if (!candidateIds.length) return gifts;

  const detailsById = new Map();
  let nextIndex = 0;
  const workerCount = Math.min(DETAIL_LOOKUP_CONCURRENCY, candidateIds.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < candidateIds.length) {
        const giftId = candidateIds[nextIndex++];
        try {
          const gift = await getCachedGiftDetail({
            userId,
            authUserId,
            origin,
            giftId,
          });
          if (gift && typeof gift === "object") {
            detailsById.set(String(giftId), gift);
          }
        } catch (error) {
          // A detail gap must not prevent the remaining portfolio summaries from loading.
          console.warn("Unable to enrich a Blackbaud pledge payment", {
            giftId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }),
  );

  return gifts.map((gift) => detailsById.get(String(getGiftId(gift))) || gift);
}

async function runWithConcurrency(items, limit, mapper) {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
}

async function loadConstituentGiftLists({
  constituentIds,
  userId,
  authUserId,
  origin,
  period,
}) {
  const gifts = [];
  const warnings = {};
  let successfulLookups = 0;

  await runWithConcurrency(
    constituentIds,
    CONSTITUENT_GIFT_LOOKUP_CONCURRENCY,
    async (constituentId) => {
      try {
        const response = await listBlackbaudGifts({
          userId,
          authUserId,
          origin,
          searchParams: {
            constituent_id: constituentId,
            start_gift_date: period.startDate,
            end_gift_date: period.endDate,
          },
          pageLimit: PORTFOLIO_GIFT_PAGE_LIMIT,
          maxPages: CONSTITUENT_GIFT_MAX_PAGES,
          includePageMetadata: true,
        });
        const responseGifts = Array.isArray(response) ? response : response?.gifts || [];
        const responseHasMore = !Array.isArray(response) && Boolean(response?.hasMore);
        successfulLookups += 1;
        gifts.push(...responseGifts);
        if (responseHasMore) {
          warnings[constituentId] =
            "Current fiscal-year Gift API results exceeded the safe per-constituent read limit.";
        }
      } catch (error) {
        warnings[constituentId] =
          error instanceof Error
            ? error.message
            : "Current fiscal-year gift lookup failed.";
      }
    },
  );

  if (successfulLookups === 0 && constituentIds.length > 0) {
    throw new Error(
      "Blackbaud could not load current fiscal-year gifts for this portfolio.",
    );
  }

  return { gifts, warnings };
}

function parseConstituentIds(request) {
  const searchParams = new URL(request.url).searchParams;
  const rawValues = [
    ...searchParams.getAll("constituentId"),
    ...searchParams.getAll("constituentIds"),
  ];
  const seen = new Set();
  const ids = [];

  for (const rawValue of rawValues) {
    const values = String(rawValue || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    for (const value of values) {
      if (seen.has(value)) continue;
      seen.add(value);
      ids.push(value);
      if (ids.length >= MAX_CONSTITUENT_IDS) return ids;
    }
  }

  return ids;
}

function getCacheKey({ userId, authUserId, constituentIds, period }) {
  return [
    "v2",
    userId,
    authUserId,
    period.startDate,
    period.endDate,
    [...constituentIds].sort().join(","),
  ].join(":");
}

function hasCurrentFiscalYearGiving(summary) {
  return [
    summary?.recognizedReceived,
    summary?.recognizedCommitted,
    summary?.plannedGifts,
  ].some((value) => Number(value || 0) > 0);
}

function mergeUniqueGifts(...giftLists) {
  const giftsByKey = new Map();
  let anonymousIndex = 0;

  for (const gifts of giftLists) {
    for (const gift of gifts) {
      const giftId = getGiftId(gift);
      // Gift IDs are stable across the list and detail endpoints. Keep a
      // conservative fallback key only for malformed responses so a bad row
      // does not prevent an otherwise valid portfolio from loading.
      const key = giftId
        ? `gift:${giftId}`
        : `anonymous:${getGiftConstituentId(gift)}:${gift?.date || gift?.gift_date || ""}:${anonymousIndex++}`;
      if (!giftsByKey.has(key)) giftsByKey.set(key, gift);
    }
  }

  return [...giftsByKey.values()];
}

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth(request);
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestUrl = new URL(request.url);
    const origin = requestUrl.origin;
    const configIssues = getBlackbaudConfigIssues(origin);
    if (configIssues.length > 0) {
      return Response.json(
        { error: "Blackbaud is not configured", configIssues },
        { status: 400 },
      );
    }

    const constituentIds = parseConstituentIds(request);
    if (!constituentIds.length) {
      return Response.json(
        { period: getCurrentFiscalYearWindow(), byConstituentId: {} },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const { workspaceUser: user, sessionUser, isActing } =
      await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    if (
      requestUrl.searchParams.get("report") === PORTFOLIO_GIVING_REPORT_KEY
    ) {
      const reportAccess = await getReportAccessForUser(
        PORTFOLIO_GIVING_REPORT_KEY,
        sessionUser || user,
      );
      if (!reportAccess.canView) {
        return Response.json(
          { error: "You do not have access to this report." },
          { status: 403 },
        );
      }
    }

    const authUserId = isActing ? sessionUser?.id || user.id : user.id;
    const now = new Date();
    const period = getCurrentFiscalYearWindow({ now });
    const cacheKey = getCacheKey({
      userId: user.id,
      authUserId,
      constituentIds,
      period,
    });
    const cached = summaryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return Response.json(cached.payload, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const portfolioGiftResponse = await listBlackbaudGifts({
      userId: user.id,
      authUserId,
      origin,
      searchParams: {
        // Repeated IDs ensure Blackbaud returns gifts associated through either
        // direct or recognition/soft credit for every portfolio constituent.
        constituent_id: constituentIds,
        start_gift_date: period.startDate,
        end_gift_date: period.endDate,
      },
      pageLimit: PORTFOLIO_GIFT_PAGE_LIMIT,
      maxPages: PORTFOLIO_GIFT_MAX_PAGES,
      includePageMetadata: true,
    });
    const portfolioGiftListWasTruncated =
      !Array.isArray(portfolioGiftResponse) && Boolean(portfolioGiftResponse?.hasMore);
    let gifts = Array.isArray(portfolioGiftResponse)
      ? portfolioGiftResponse
      : portfolioGiftResponse?.gifts || [];
    let warnings = {};

    // A combined portfolio list can contain far more gifts than the dashboard
    // needs. If it is truncated, reload by constituent so a soft credit is not
    // silently lost behind another prospect's gift history.
    if (portfolioGiftListWasTruncated) {
      const constituentGiftLists = await loadConstituentGiftLists({
        constituentIds,
        userId: user.id,
        authUserId,
        origin,
        period,
      });
      gifts = constituentGiftLists.gifts;
      warnings = constituentGiftLists.warnings;
    }

    let enrichedGifts = await enrichAssociatedPledgePayments({
      gifts,
      constituentIds,
      userId: user.id,
      authUserId,
      origin,
    });
    let realizedPlannedGiftIds = await getRealizedPlannedGiftIds({
      gifts: enrichedGifts,
      userId: user.id,
      authUserId,
      origin,
    });
    let summary = calculateCurrentFiscalYearGiving({
      constituentIds,
      gifts: enrichedGifts,
      now,
      fiscalYearStartMonth: 7,
      realizedPlannedGiftIds,
    });

    // The Gift List endpoint documents constituent_id as an associated-record
    // filter, but recipient-side soft credits can be absent from a combined
    // response even when it is not paginated. Recheck only the zero-result
    // constituents one at a time. This is a background dashboard read and is
    // deliberately bounded and cached; it prevents a soft-credit recipient
    // from silently appearing to have no fiscal-year giving.
    const zeroResultConstituentIds = constituentIds.filter(
      (constituentId) => !hasCurrentFiscalYearGiving(summary.byConstituentId[constituentId]),
    );
    let usedZeroResultFallback = false;
    if (zeroResultConstituentIds.length > 0) {
      const constituentGiftLists = await loadConstituentGiftLists({
        constituentIds: zeroResultConstituentIds,
        userId: user.id,
        authUserId,
        origin,
        period,
      });
      gifts = mergeUniqueGifts(gifts, constituentGiftLists.gifts);
      warnings = { ...warnings, ...constituentGiftLists.warnings };
      enrichedGifts = await enrichAssociatedPledgePayments({
        gifts,
        constituentIds,
        userId: user.id,
        authUserId,
        origin,
      });
      realizedPlannedGiftIds = await getRealizedPlannedGiftIds({
        gifts: enrichedGifts,
        userId: user.id,
        authUserId,
        origin,
      });
      summary = calculateCurrentFiscalYearGiving({
        constituentIds,
        gifts: enrichedGifts,
        now,
        fiscalYearStartMonth: 7,
        realizedPlannedGiftIds,
      });
      usedZeroResultFallback = true;
    }
    const payload = {
      ...summary,
      source: "gift_records",
      calculatedAt: new Date().toISOString(),
      warnings,
      usedPerConstituentFallback:
        portfolioGiftListWasTruncated || usedZeroResultFallback,
    };
    summaryCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload,
    });

    return Response.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Error fetching current fiscal year giving:", error);
    return Response.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Failed to fetch current fiscal year giving",
      },
      { status: 500 },
    );
  }
}
