import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import {
  blackbaudApiFetch,
  getBlackbaudConfigIssues,
} from "@/app/api/utils/blackbaud";
import {
  buildFY27CashReceivedByConstituentId,
  FY27_CASH_RECEIVED_QUERY_NAME,
} from "@/app/api/utils/blackbaudQueries";

const MAX_CONSTITUENT_IDS = 300;
const CACHE_TTL_MS = 5 * 60 * 1000;
const PENDING_CACHE_TTL_MS = 20 * 1000;
const queryCache = new Map();
const queryInFlight = new Map();

function normalizeQueryName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getQueryRows(payload) {
  if (Array.isArray(payload)) return payload;
  return (
    [payload?.value, payload?.queries, payload?.results, payload?.items].find(
      Array.isArray,
    ) || []
  );
}

function getQueryId(query) {
  return query?.id || query?.query_id || query?.queryId || null;
}

function getQueryName(query) {
  return query?.name || query?.query_name || query?.queryName || "";
}

function getJobId(payload) {
  return payload?.job_id || payload?.jobId || payload?.id || null;
}

function getReadUrl(payload) {
  return payload?.read_url || payload?.readUrl || payload?.sas_uri || payload?.sasUri || null;
}

function isCompletedJob(payload) {
  return /complete|succeed|finished/i.test(
    String(payload?.status || payload?.state || ""),
  );
}

function parseConstituentIds(payload) {
  const seen = new Set();
  const ids = [];
  const rawIds = Array.isArray(payload?.constituentIds)
    ? payload.constituentIds
    : [];

  for (const value of rawIds) {
    const id = String(value || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_CONSTITUENT_IDS) break;
  }

  return ids;
}

async function downloadQueryResult(readUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(readUrl);
  } catch {
    throw new Error("Blackbaud returned an invalid saved-query result URL.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Blackbaud returned an unsafe saved-query result URL.");
  }

  const response = await fetch(parsedUrl, {
    headers: { Accept: "text/csv, text/plain, application/json" },
  });
  const content = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Blackbaud saved-query download failed (${response.status}).`);
  }

  return content;
}

async function getSavedQuery({ userId, authUserId, origin }) {
  const payload = await blackbaudApiFetch("/query/queries", {
    userId,
    authUserId,
    origin,
    searchParams: {
      product: "RE",
      module: "None",
      limit: 500,
    },
  });
  const expectedName = normalizeQueryName(FY27_CASH_RECEIVED_QUERY_NAME);
  const query = getQueryRows(payload).find(
    (entry) => normalizeQueryName(getQueryName(entry)) === expectedName,
  );

  if (!query || !getQueryId(query)) {
    throw new Error(
      `Saved query "${FY27_CASH_RECEIVED_QUERY_NAME}" was not found or is not shared with this Blackbaud user.`,
    );
  }

  return query;
}

async function executeSavedQuery({ userId, authUserId, origin, queryId }) {
  try {
    return await blackbaudApiFetch("/query/queries/executebyid", {
      userId,
      authUserId,
      origin,
      method: "POST",
      searchParams: { product: "RE", module: "None" },
      body: { id: [queryId], ux_mode: "Synchronous" },
    });
  } catch (error) {
    // Retain the scalar fallback for older Query API implementations.
    if (!/400|bad request/i.test(error?.message || "")) throw error;

    return blackbaudApiFetch("/query/queries/executebyid", {
      userId,
      authUserId,
      origin,
      method: "POST",
      searchParams: { product: "RE", module: "None" },
      body: { id: queryId, ux_mode: "Synchronous" },
    });
  }
}

async function loadFY27CashReceived({ userId, authUserId, origin, cacheKey }) {
  const cached = queryCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) {
    if (cached.status === "ready") return cached;

    if (cached.status === "pending" && cached.jobId) {
      const job = await blackbaudApiFetch(`/query/jobs/${encodeURIComponent(cached.jobId)}`, {
        userId,
        authUserId,
        origin,
        searchParams: {
          product: "RE",
          module: "None",
          include_read_url: "OnceCompleted",
        },
      });
      const readUrl = getReadUrl(job);
      if (!readUrl && !isCompletedJob(job)) return cached;
      if (!readUrl) {
        throw new Error("Blackbaud completed the saved query without a downloadable result.");
      }

      const result = buildFY27CashReceivedByConstituentId(
        await downloadQueryResult(readUrl),
      );
      if (!result.hasRequiredColumns) {
        throw new Error(
          `Saved query "${FY27_CASH_RECEIVED_QUERY_NAME}" must include System Record ID and FY27 Total Cash Received columns.`,
        );
      }

      const ready = {
        status: "ready",
        byConstituentId: result.byConstituentId,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      queryCache.set(cacheKey, ready);
      return ready;
    }
  }

  const query = await getSavedQuery({ userId, authUserId, origin });
  const execution = await executeSavedQuery({
    userId,
    authUserId,
    origin,
    queryId: getQueryId(query),
  });
  const jobId = getJobId(execution);
  let readUrl = getReadUrl(execution);

  if (!readUrl && jobId) {
    const job = await blackbaudApiFetch(`/query/jobs/${encodeURIComponent(jobId)}`, {
      userId,
      authUserId,
      origin,
      searchParams: {
        product: "RE",
        module: "None",
        include_read_url: "OnceCompleted",
      },
    });
    readUrl = getReadUrl(job);
    if (!readUrl && !isCompletedJob(job)) {
      const pending = {
        status: "pending",
        jobId,
        byConstituentId: {},
        expiresAt: Date.now() + PENDING_CACHE_TTL_MS,
      };
      queryCache.set(cacheKey, pending);
      return pending;
    }
  }

  if (!readUrl) {
    throw new Error("Blackbaud did not return a saved-query result URL.");
  }

  const result = buildFY27CashReceivedByConstituentId(await downloadQueryResult(readUrl));
  if (!result.hasRequiredColumns) {
    throw new Error(
      `Saved query "${FY27_CASH_RECEIVED_QUERY_NAME}" must include System Record ID and FY27 Total Cash Received columns.`,
    );
  }

  const ready = {
    status: "ready",
    byConstituentId: result.byConstituentId,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  queryCache.set(cacheKey, ready);
  return ready;
}

export async function POST(request) {
  try {
    await ensureAppSchema();

    const session = await auth(request);
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const constituentIds = parseConstituentIds(await request.json().catch(() => ({})));
    if (constituentIds.length === 0) {
      return Response.json({ status: "ready", byConstituentId: {} });
    }

    const origin = new URL(request.url).origin;
    const configIssues = getBlackbaudConfigIssues(origin);
    if (configIssues.length > 0) {
      return Response.json({ error: "Blackbaud is not configured", configIssues }, { status: 400 });
    }

    const { sessionUser, workspaceUser, isActing } = await getWorkspaceUser(session, request);
    if (!workspaceUser) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const authUserId = isActing ? sessionUser?.id || workspaceUser.id : workspaceUser.id;
    const cacheKey = String(authUserId);
    let loading = queryInFlight.get(cacheKey);
    if (!loading) {
      loading = loadFY27CashReceived({
        userId: workspaceUser.id,
        authUserId,
        origin,
        cacheKey,
      }).finally(() => queryInFlight.delete(cacheKey));
      queryInFlight.set(cacheKey, loading);
    }

    const result = await loading;
    const byConstituentId = Object.fromEntries(
      constituentIds.map((id) => [id, Number(result.byConstituentId?.[id] || 0)]),
    );

    return Response.json(
      { status: result.status, byConstituentId },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("FY27 prospect-pool cash-received query error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load FY27 cash received from Blackbaud.",
      },
      { status: 500 },
    );
  }
}
