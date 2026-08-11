import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import {
  getBlackbaudConfigIssues,
  listBlackbaudGifts,
} from "@/app/api/utils/blackbaud";
import {
  calculateCurrentFiscalYearGiving,
  getCurrentFiscalYearWindow,
} from "../../utils/currentFyGiving.js";

const MAX_CONSTITUENT_IDS = 50;
const CACHE_TTL_MS = 15 * 60 * 1000;
const summaryCache = new Map();

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
        // Blackbaud's Gift API expects one comma-separated constituent-ID filter.
        constituent_id: constituentIds.join(","),
        start_gift_date: period.startDate,
        end_gift_date: period.endDate,
      },
      pageLimit: 500,
      maxPages: 2,
    });
    const summary = calculateCurrentFiscalYearGiving({
      constituentIds,
      gifts,
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
