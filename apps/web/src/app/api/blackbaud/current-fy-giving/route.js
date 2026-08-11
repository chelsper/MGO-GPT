import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
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

const MAX_CONSTITUENT_IDS = 50;
const CACHE_TTL_MS = 15 * 60 * 1000;
const DETAIL_CACHE_TTL_MS = 15 * 60 * 1000;
const DETAIL_LOOKUP_CONCURRENCY = 4;
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
  return normalizeToken(
    gift?.gift_type || gift?.giftType || gift?.type || gift?.type_name || gift?.category,
  );
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

function hasRecognitionCreditCollection(gift) {
  return [
    gift?.soft_credits,
    gift?.softCredits,
    gift?.recognition_credits,
    gift?.recognitionCredits,
    gift?.recognitions,
  ].some(Array.isArray);
}

function shouldEnrichPledgePayment(gift, requestedConstituentIds) {
  const giftId = getGiftId(gift);
  const directConstituentId = getGiftConstituentId(gift);

  return (
    Boolean(giftId) &&
    isPledgePaymentGiftType(getGiftType(gift)) &&
    Boolean(directConstituentId) &&
    !requestedConstituentIds.has(directConstituentId) &&
    !hasRecognitionCreditCollection(gift)
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
    userId,
    authUserId,
    period.startDate,
    period.endDate,
    [...constituentIds].sort().join(","),
  ].join(":");
}

export async function GET(request) {
  try {
    await ensureAppSchema();

    const session = await auth(request);
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const origin = new URL(request.url).origin;
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
        { headers: { "Cache-Control": "private, max-age=900" } },
      );
    }

    const { workspaceUser: user, sessionUser, isActing } =
      await getWorkspaceUser(session, request);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
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
        headers: { "Cache-Control": "private, max-age=900" },
      });
    }

    const gifts = await listBlackbaudGifts({
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
      pageLimit: 500,
      maxPages: 2,
    });
    const enrichedGifts = await enrichAssociatedPledgePayments({
      gifts,
      constituentIds,
      userId: user.id,
      authUserId,
      origin,
    });
    const summary = calculateCurrentFiscalYearGiving({
      constituentIds,
      gifts: enrichedGifts,
      now,
      fiscalYearStartMonth: 7,
    });
    const payload = {
      ...summary,
      source: "gift_records",
      calculatedAt: new Date().toISOString(),
    };
    summaryCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload,
    });

    return Response.json(payload, {
      headers: { "Cache-Control": "private, max-age=900" },
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
