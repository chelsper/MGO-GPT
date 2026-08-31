import crypto from "node:crypto";

import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import sql from "@/app/api/utils/sql";

const BLACKBAUD_AUTHORIZE_URL = "https://oauth2.sky.blackbaud.com/authorization";
const BLACKBAUD_TOKEN_URL = "https://oauth2.sky.blackbaud.com/token";
const BLACKBAUD_CONSTITUENT_SEARCH_URL =
  "https://api.sky.blackbaud.com/constituent/v1/constituents/search";
const BLACKBAUD_CONSTITUENT_LIST_URL =
  "https://api.sky.blackbaud.com/constituent/v1/constituents";
const BLACKBAUD_CONSTITUENT_CUSTOMSEARCH_URL =
  "https://api.sky.blackbaud.com/nxt-data-integration/v1/re/constituents/customsearch";
const BLACKBAUD_CREATE_ACTION_URL =
  "https://api.sky.blackbaud.com/constituent/v1/actions";
const BLACKBAUD_ACTIONS_URL =
  "https://api.sky.blackbaud.com/constituent/v1/actions";
const BLACKBAUD_OPPORTUNITIES_URL =
  "https://api.sky.blackbaud.com/opportunity/v1/opportunities";
const BLACKBAUD_CONSTITUENT_BASE_URL =
  "https://api.sky.blackbaud.com/constituent/v1/constituents";
const BLACKBAUD_CONSTITUENT_CUSTOM_FIELD_CATEGORY_DETAILS_URL =
  `${BLACKBAUD_CONSTITUENT_BASE_URL}/customfields/categories/details`;
const BLACKBAUD_CONSTITUENT_CUSTOM_FIELD_CATEGORY_VALUES_URL =
  `${BLACKBAUD_CONSTITUENT_BASE_URL}/customfields/categories/values`;
const BLACKBAUD_GIFTS_URL = "https://api.sky.blackbaud.com/gift/v1/gifts";
const BLACKBAUD_GIFT_V2_URL = "https://api.sky.blackbaud.com/gft-gifts/v2/gifts";
const BLACKBAUD_FUNDRAISER_ASSIGNMENTS_URL =
  "https://api.sky.blackbaud.com/fundraising/v1/fundraisers";
const BLACKBAUD_QUERY_URL = "https://api.sky.blackbaud.com/query";
// Query metadata V2 fixes tree-navigation failures in the legacy metadata
// routes while preserving the existing query execution endpoints.
const BLACKBAUD_QUERY_METADATA_V2_URL = `${BLACKBAUD_QUERY_URL}/v2/querytypes`;
const BLACKBAUD_QUERY_LIST_URL = `${BLACKBAUD_QUERY_URL}/queries`;
const BLACKBAUD_QUERY_EXECUTE_URL = `${BLACKBAUD_QUERY_LIST_URL}/execute`;
const BLACKBAUD_QUERY_EXECUTE_BY_ID_URL = `${BLACKBAUD_QUERY_LIST_URL}/executebyid`;
const BLACKBAUD_QUERY_JOBS_URL = `${BLACKBAUD_QUERY_URL}/jobs`;
const BLACKBAUD_QUERY_PRODUCT = "RE";
const BLACKBAUD_QUERY_MODULE = "None";
const BLACKBAUD_LIST_V2_EXECUTE_QUERY_URL =
  "https://api.sky.blackbaud.com/list/v2/execute-query";
const BLACKBAUD_REQUEST_TIMEOUT_MS = 15000;
const BLACKBAUD_MAX_RETRIES = 2;
const BLACKBAUD_QUOTA_STATE_KEY = "subscription";
const BLACKBAUD_QUOTA_CACHE_TTL_MS = 10 * 1000;
const BLACKBAUD_QUOTA_FALLBACK_DELAY_MS = 10 * 60 * 1000;
const DEFAULT_BLACKBAUD_SCOPES = "offline_access rnxt.r rnxt.w rnxt.d";
const DECLINED_OPPORTUNITY_STATUS = "Declined";
const DECLINED_OPPORTUNITY_PURPOSE = "Completed -- Not Fulfilled";
const NXT_ACTION_TYPE_MAP = new Map([
  ["cultivation", "Cultivation"],
  ["identification/discovery", "Identification / Discovery"],
  ["other", "Other"],
  ["qualification/re-engagement", "Qualification / Re-engagement"],
  ["solicitation", "Solicitation"],
  ["stewardship", "Stewardship"],
]);

let blackbaudQuotaStateCache = {
  checkedAt: 0,
  blockedUntil: 0,
  message: "",
  updatedAt: null,
};

export class BlackbaudQuotaExceededError extends Error {
  constructor({ message, retryAfterMs = 0 } = {}) {
    super(message || "Blackbaud call-volume quota is temporarily unavailable.");
    this.name = "BlackbaudQuotaExceededError";
    this.retryAfterMs = Math.max(0, Number(retryAfterMs) || 0);
  }
}

export function isBlackbaudQuotaExceededError(error) {
  return error instanceof BlackbaudQuotaExceededError;
}

function parseRetryAfterMs(response, responseText = "") {
  const headerValue = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(headerValue) && headerValue >= 0) {
    return Math.min(headerValue * 1000, 24 * 60 * 60 * 1000);
  }

  const durationMatch = String(responseText || "").match(
    /(?:quota (?:will be )?replenished|replenished)\s+in\s+(\d{1,2}):(\d{2}):(\d{2})/i,
  );
  if (!durationMatch) return BLACKBAUD_QUOTA_FALLBACK_DELAY_MS;

  const [, hours, minutes, seconds] = durationMatch;
  const durationMs =
    (Number(hours) * 60 * 60 + Number(minutes) * 60 + Number(seconds)) * 1000;
  return Math.min(Math.max(durationMs, 1000), 24 * 60 * 60 * 1000);
}

function isQuotaExceededResponse(response, responseText = "") {
  if (response?.status !== 403) return false;
  return /quota|call volume|rate limit/i.test(String(responseText || ""));
}

function formatQuotaMessage({ responseText, retryAfterMs }) {
  const seconds = Math.ceil(Math.max(0, Number(retryAfterMs) || 0) / 1000);
  const retryMessage = seconds
    ? ` NXT checks will resume after Blackbaud replenishes the quota (about ${Math.ceil(seconds / 60)} minute${Math.ceil(seconds / 60) === 1 ? "" : "s"}).`
    : "";
  const rawProviderMessage = String(responseText || "").trim();
  let providerMessage = rawProviderMessage;

  try {
    const parsed = JSON.parse(rawProviderMessage);
    if (parsed && typeof parsed === "object") {
      providerMessage = String(parsed.title || parsed.message || parsed.error?.message || "");
    }
  } catch {
    // Non-JSON error payloads are already suitable for a short user-facing summary.
  }

  providerMessage = providerMessage.replace(/\s+/g, " ").trim();
  return `Blackbaud call-volume quota is temporarily unavailable.${retryMessage}${
    providerMessage ? ` Provider response: ${providerMessage}` : ""
  }`;
}

async function getBlackbaudQuotaState() {
  const now = Date.now();
  if (now - blackbaudQuotaStateCache.checkedAt < BLACKBAUD_QUOTA_CACHE_TTL_MS) {
    return blackbaudQuotaStateCache;
  }

  const rows = await sql`
    SELECT blocked_until, message, updated_at
    FROM blackbaud_api_limit_state
    WHERE state_key = ${BLACKBAUD_QUOTA_STATE_KEY}
    LIMIT 1
  `;
  const row = rows[0] || null;
  const blockedUntil = row?.blocked_until ? new Date(row.blocked_until).getTime() : 0;
  const updatedAt = row?.updated_at ? new Date(row.updated_at).getTime() : 0;
  blackbaudQuotaStateCache = {
    checkedAt: now,
    blockedUntil: Number.isFinite(blockedUntil) ? blockedUntil : 0,
    message: String(row?.message || ""),
    updatedAt:
      Number.isFinite(updatedAt) && updatedAt > 0
        ? new Date(updatedAt).toISOString()
        : null,
  };
  return blackbaudQuotaStateCache;
}

// This reads the persisted subscription-wide circuit breaker only. It never
// refreshes an OAuth token or sends a request to Blackbaud.
export async function getBlackbaudQuotaStatus() {
  await ensureAppSchema();
  const state = await getBlackbaudQuotaState();
  const remainingMs = Math.max(0, state.blockedUntil - Date.now());
  const checkedAt = state.checkedAt ? new Date(state.checkedAt).toISOString() : null;

  return {
    status: remainingMs > 0 ? "paused" : "available",
    paused: remainingMs > 0,
    blockedUntil:
      state.blockedUntil > 0 ? new Date(state.blockedUntil).toISOString() : null,
    remainingMs,
    checkedAt,
    updatedAt: state.updatedAt || null,
  };
}

async function assertBlackbaudQuotaAvailable() {
  const state = await getBlackbaudQuotaState();
  const remainingMs = state.blockedUntil - Date.now();
  if (remainingMs > 0) {
    throw new BlackbaudQuotaExceededError({
      message:
        state.message ||
        formatQuotaMessage({ responseText: "", retryAfterMs: remainingMs }),
      retryAfterMs: remainingMs,
    });
  }
}

async function recordBlackbaudQuotaExceeded({ responseText, retryAfterMs }) {
  const blockedUntil = new Date(Date.now() + retryAfterMs).toISOString();
  const message = formatQuotaMessage({ responseText, retryAfterMs });
  await sql`
    INSERT INTO blackbaud_api_limit_state (
      state_key,
      blocked_until,
      message,
      updated_at
    )
    VALUES (
      ${BLACKBAUD_QUOTA_STATE_KEY},
      ${blockedUntil},
      ${message},
      NOW()
    )
    ON CONFLICT (state_key) DO UPDATE
    SET
      blocked_until = EXCLUDED.blocked_until,
      message = EXCLUDED.message,
      updated_at = NOW()
  `;
  blackbaudQuotaStateCache = {
    checkedAt: Date.now(),
    blockedUntil: new Date(blockedUntil).getTime(),
    message,
    updatedAt: new Date().toISOString(),
  };
  return new BlackbaudQuotaExceededError({ message, retryAfterMs });
}

export function getBlackbaudConfig(origin) {
  const clientId = process.env.BLACKBAUD_CLIENT_ID || "";
  const clientSecret = process.env.BLACKBAUD_CLIENT_SECRET || "";
  const subscriptionKey = process.env.BLACKBAUD_SUBSCRIPTION_KEY || "";
  const redirectUri =
    process.env.BLACKBAUD_REDIRECT_URI ||
    (origin ? `${origin}/api/blackbaud/callback` : "");
  const scopes = (process.env.BLACKBAUD_SCOPES || DEFAULT_BLACKBAUD_SCOPES)
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    clientId,
    clientSecret,
    subscriptionKey,
    redirectUri,
    scopes,
  };
}

export function getBlackbaudConfigIssues(origin) {
  const config = getBlackbaudConfig(origin);
  const issues = [];

  if (!config.clientId) issues.push("BLACKBAUD_CLIENT_ID is missing");
  if (!config.clientSecret) issues.push("BLACKBAUD_CLIENT_SECRET is missing");
  if (!config.subscriptionKey) issues.push("BLACKBAUD_SUBSCRIPTION_KEY is missing");
  if (!config.redirectUri) issues.push("BLACKBAUD_REDIRECT_URI is missing");

  return issues;
}

export async function createBlackbaudState({ userId, redirectPath }) {
  await ensureAppSchema();

  const state = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await sql`
    INSERT INTO blackbaud_oauth_states (state, user_id, redirect_path, expires_at)
    VALUES (${state}, ${userId}, ${redirectPath || null}, ${expiresAt})
  `;

  return state;
}

export async function consumeBlackbaudState(state) {
  await ensureAppSchema();

  const rows = await sql`
    DELETE FROM blackbaud_oauth_states
    WHERE state = ${state}
      AND expires_at > NOW()
    RETURNING user_id, redirect_path
  `;

  return rows[0] || null;
}

function buildTokenRequestBody(params) {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      body.set(key, value);
    }
  });
  return body.toString();
}

async function requestBlackbaudToken(params, config) {
  const response = await fetch(BLACKBAUD_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${config.clientId}:${config.clientSecret}`,
      ).toString("base64")}`,
    },
    body: buildTokenRequestBody(params),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.error_description ||
        payload?.error ||
        "Blackbaud token exchange failed",
    );
  }

  return payload;
}

async function parseBlackbaudResponse(response) {
  const responseText = await response.text().catch(() => "");
  let payload = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const detail =
      payload?.detail ||
      payload?.message ||
      payload?.title ||
      payload?.error_description ||
      payload?.error ||
      responseText ||
      response.statusText ||
      "Blackbaud request failed";
    const traceId = String(payload?.trace_id || payload?.traceId || "").trim();
    throw new Error(
      `Blackbaud ${response.status} ${response.statusText}: ${detail}${
        traceId ? ` (trace ${traceId})` : ""
      }`,
    );
  }

  return payload;
}

function getRetryDelayMs(response, attempt) {
  const retryAfter = response.headers.get("retry-after");
  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1000, 10000);
  }

  return Math.min(1000 * 2 ** attempt, 5000);
}

function shouldRetryBlackbaudResponse(response) {
  if (response.status === 429) return true;
  if (response.status >= 500) return true;
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getExpiresAt(expiresIn) {
  if (!expiresIn) return null;
  return new Date(Date.now() + Number(expiresIn) * 1000).toISOString();
}

export async function exchangeBlackbaudCode({ code, origin }) {
  const config = getBlackbaudConfig(origin);
  const token = await requestBlackbaudToken(
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    },
    config,
  );

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || null,
    tokenType: token.token_type || "Bearer",
    scope: token.scope || config.scopes.join(" "),
    expiresAt: getExpiresAt(token.expires_in),
  };
}

export async function refreshBlackbaudConnection(connection, origin) {
  if (!connection?.refresh_token) {
    throw new Error("No Blackbaud refresh token is available");
  }

  const config = getBlackbaudConfig(origin);
  const token = await requestBlackbaudToken(
    {
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
    },
    config,
  );

  const nextConnection = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || connection.refresh_token,
    tokenType: token.token_type || connection.token_type || "Bearer",
    scope: token.scope || connection.scope || config.scopes.join(" "),
    expiresAt: getExpiresAt(token.expires_in),
  };

  await saveBlackbaudConnection(connection.user_id, nextConnection);
  return nextConnection;
}

export async function saveBlackbaudConnection(userId, connection) {
  await ensureAppSchema();

  const rows = await sql`
    INSERT INTO blackbaud_connections (
      user_id,
      access_token,
      refresh_token,
      token_type,
      scope,
      expires_at,
      connected_at,
      updated_at
    ) VALUES (
      ${userId},
      ${connection.accessToken},
      ${connection.refreshToken},
      ${connection.tokenType},
      ${connection.scope},
      ${connection.expiresAt},
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      token_type = EXCLUDED.token_type,
      scope = EXCLUDED.scope,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
    RETURNING *
  `;

  return rows[0] || null;
}

export async function getBlackbaudConnection(userId) {
  await ensureAppSchema();

  const rows = await sql`
    SELECT *
    FROM blackbaud_connections
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  return rows[0] || null;
}

export async function getValidBlackbaudConnection(userId, origin) {
  const connection = await getBlackbaudConnection(userId);
  if (!connection) return null;

  if (!connection.expires_at) return connection;

  const expiresAt = new Date(connection.expires_at);
  const refreshThreshold = Date.now() + 60 * 1000;
  if (expiresAt.getTime() > refreshThreshold) {
    return connection;
  }

  const refreshed = await refreshBlackbaudConnection(connection, origin);
  return {
    ...connection,
    access_token: refreshed.accessToken,
    refresh_token: refreshed.refreshToken,
    token_type: refreshed.tokenType,
    scope: refreshed.scope,
    expires_at: refreshed.expiresAt,
  };
}

export async function blackbaudApiFetch(
  path,
  {
    userId,
    authUserId,
    origin,
    searchParams,
    method = "GET",
    body,
    timeoutMs = BLACKBAUD_REQUEST_TIMEOUT_MS,
    maxRetries = BLACKBAUD_MAX_RETRIES,
  } = {},
) {
  const config = getBlackbaudConfig(origin);

  // Check the shared provider cooldown before doing token refresh work. A
  // Blackbaud quota is subscription-wide, so refreshing a token cannot make
  // the next API request succeed while that cooldown is active.
  await ensureAppSchema();
  await assertBlackbaudQuotaAvailable();

  const connection = await getValidBlackbaudConnection(authUserId || userId, origin);

  if (!connection?.access_token) {
    throw new Error("Blackbaud is not connected for this user");
  }

  const url = new URL(path.startsWith("http") ? path : `https://api.sky.blackbaud.com${path}`);
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      values.forEach((entry) => {
        if (entry !== undefined && entry !== null && entry !== "") {
          url.searchParams.append(key, String(entry));
        }
      });
    });
  }

  const headers = {
    Authorization: `Bearer ${connection.access_token}`,
    "Bb-Api-Subscription-Key": config.subscriptionKey,
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const requestTimeoutMs = Math.max(1000, Number(timeoutMs) || BLACKBAUD_REQUEST_TIMEOUT_MS);
  const requestMaxRetries = Math.max(0, Number(maxRetries) || 0);

  for (let attempt = 0; attempt <= requestMaxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseText = await response.clone().text().catch(() => "");
        if (isQuotaExceededResponse(response, responseText)) {
          clearTimeout(timeoutId);
          throw await recordBlackbaudQuotaExceeded({
            responseText,
            retryAfterMs: parseRetryAfterMs(response, responseText),
          });
        }
      }

      if (shouldRetryBlackbaudResponse(response) && attempt < requestMaxRetries) {
        const delayMs = getRetryDelayMs(response, attempt);
        clearTimeout(timeoutId);
        await sleep(delayMs);
        continue;
      }

      clearTimeout(timeoutId);
      return parseBlackbaudResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);
      const timedOut =
        error instanceof Error &&
        (error.name === "AbortError" ||
          /aborted|timeout/i.test(error.message || ""));

      if (timedOut && attempt < requestMaxRetries) {
        await sleep(getRetryDelayMs(new Response(null, { status: 504 }), attempt));
        continue;
      }

      if (timedOut) {
        throw new Error("Blackbaud request timed out");
      }

      throw error;
    }
  }

  throw new Error("Blackbaud request failed after retries");
}

function getBlackbaudCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.queries)) return payload.queries;
  return [];
}

function getBlackbaudQueryId(query) {
  return String(query?.id ?? query?.query_id ?? query?.queryId ?? "").trim();
}

function getBlackbaudQueryName(query) {
  return String(query?.name ?? query?.query_name ?? query?.queryName ?? "").trim();
}

function isBlackbaudNotFoundError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /(?:404|not found|resource not found)/i.test(message);
}

export async function findBlackbaudQueryByName({
  userId,
  authUserId,
  origin,
  name,
}) {
  const normalizedName = String(name || "").trim().toLocaleLowerCase("en-US");
  if (!normalizedName) return null;

  let path = BLACKBAUD_QUERY_LIST_URL;
  let searchParams = {
    product: BLACKBAUD_QUERY_PRODUCT,
    module: BLACKBAUD_QUERY_MODULE,
    search_text: name,
  };

  for (let page = 0; path && page < 20; page += 1) {
    const payload = await blackbaudApiFetch(path, {
      userId,
      authUserId,
      origin,
      searchParams,
    });
    const match = getBlackbaudCollection(payload).find(
      (query) => getBlackbaudQueryName(query).toLocaleLowerCase("en-US") === normalizedName,
    );
    if (match) {
      const id = getBlackbaudQueryId(match);
      if (id) return { id, name: getBlackbaudQueryName(match) };
    }

    path = payload?.next_link || payload?.nextLink || null;
    searchParams = undefined;
  }

  return null;
}

export async function createBlackbaudQueryJob({ userId, authUserId, origin, queryId }) {
  if (!queryId) throw new Error("A Blackbaud query ID is required");

  return blackbaudApiFetch(
    BLACKBAUD_QUERY_EXECUTE_BY_ID_URL,
    {
      userId,
      authUserId,
      origin,
      searchParams: {
        product: BLACKBAUD_QUERY_PRODUCT,
        module: BLACKBAUD_QUERY_MODULE,
        include_read_url: "OnceCompleted",
      },
      method: "POST",
      body: {
        id: Number(queryId),
        ux_mode: "Asynchronous",
        output_format: "Csv",
        formatting_mode: "UI",
        sql_generation_mode: "Query",
      },
    },
  );
}

// The Query API exposes the available-field tree separately from saved
// queries. This lets configurable reports build a narrowly-scoped ad-hoc
// query without requiring a user-managed saved query in NXT.
export async function getBlackbaudQueryAvailableFields({
  userId,
  authUserId,
  origin,
  queryTypeId,
  nodeId,
  fieldContext = "Filter",
  resultLayout = "MultiRow",
}) {
  const normalizedQueryTypeId = Number(queryTypeId);
  const normalizedNodeId = Number(nodeId);

  if (!Number.isInteger(normalizedQueryTypeId) || normalizedQueryTypeId <= 0) {
    throw new Error("A valid Blackbaud query type ID is required");
  }
  if (!Number.isInteger(normalizedNodeId) || normalizedNodeId < 0) {
    throw new Error("A valid Blackbaud query node ID is required");
  }

  return blackbaudApiFetch(
    `${BLACKBAUD_QUERY_METADATA_V2_URL}/${encodeURIComponent(String(normalizedQueryTypeId))}/nodes/${encodeURIComponent(String(normalizedNodeId))}/availablefields`,
    {
      userId,
      authUserId,
      origin,
      searchParams: {
        product: BLACKBAUD_QUERY_PRODUCT,
        module: BLACKBAUD_QUERY_MODULE,
        field_context: fieldContext,
        result_layout: resultLayout,
      },
      timeoutMs: 10_000,
      maxRetries: 1,
    },
  );
}

// Executes an app-defined query without relying on a saved-query system ID.
// Callers use the completed job's row_count and never download its result file.
export async function createBlackbaudAdHocQueryJob({
  userId,
  authUserId,
  origin,
  query,
  resultsFileName,
}) {
  if (!query || typeof query !== "object") {
    throw new Error("A Blackbaud query definition is required");
  }

  return blackbaudApiFetch(
    BLACKBAUD_QUERY_EXECUTE_URL,
    {
      userId,
      authUserId,
      origin,
      searchParams: {
        product: BLACKBAUD_QUERY_PRODUCT,
        module: BLACKBAUD_QUERY_MODULE,
        include_read_url: "OnceCompleted",
      },
      method: "POST",
      body: {
        query,
        ux_mode: "Asynchronous",
        output_format: "Csv",
        formatting_mode: "UI",
        ...(resultsFileName ? { results_file_name: String(resultsFileName) } : {}),
      },
    },
  );
}

export async function getBlackbaudQueryJob({ userId, authUserId, origin, jobId }) {
  if (!jobId) throw new Error("A Blackbaud query job ID is required");

  return blackbaudApiFetch(
    `${BLACKBAUD_QUERY_JOBS_URL}/${encodeURIComponent(jobId)}`,
    {
      userId,
      authUserId,
      origin,
      searchParams: {
        product: BLACKBAUD_QUERY_PRODUCT,
        module: BLACKBAUD_QUERY_MODULE,
        include_read_url: "OnceCompleted",
      },
    },
  );
}

export async function downloadBlackbaudQueryResult(resultUrl) {
  const url = new URL(String(resultUrl || ""));
  if (url.protocol !== "https:") {
    throw new Error("The Blackbaud query result URL must use HTTPS");
  }

  const response = await fetch(url, {
    headers: {
      Accept: "text/csv,text/plain,application/json",
    },
  });
  const content = await response.text();
  if (!response.ok) {
    throw new Error(
      `Blackbaud query result download failed: ${response.status} ${response.statusText}`,
    );
  }

  return content;
}

export async function searchBlackbaudConstituents({
  userId,
  authUserId,
  origin,
  query,
  requestOptions = {},
}) {
  const queryParts = String(query || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const firstName = queryParts[0] || "";
  const lastName = queryParts.length > 1 ? queryParts.slice(1).join(" ") : "";

  let mappedRows = [];
  let customMappedRows = [];
  let primarySearchFailed = false;
  let customSearchFailed = false;

  if (firstName || lastName) {
    try {
      const customPayload = await blackbaudApiFetch(
        BLACKBAUD_CONSTITUENT_CUSTOMSEARCH_URL,
        {
          userId,
          authUserId,
          origin,
          searchParams: {
            first_name: firstName || undefined,
            last_name: lastName || undefined,
            limit: 10,
          },
          ...requestOptions,
        },
      );

      const customRows = Array.isArray(customPayload?.results)
        ? customPayload.results
        : [];
      const filteredCustomRows = customRows.filter((item) => {
        if (item?.is_constituent === false) {
          return false;
        }

        if (firstName) {
          const candidateNames = [
            item?.first_name,
            item?.preferred_name,
            item?.matched_alias,
          ]
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean);

          const normalizedFirstName = firstName.toLowerCase();
          const firstNameMatches = candidateNames.some(
            (value) =>
              value === normalizedFirstName ||
              value.startsWith(normalizedFirstName) ||
              normalizedFirstName.startsWith(value),
          );

          if (!firstNameMatches) {
            return false;
          }
        }

        return true;
      });

      customMappedRows = filteredCustomRows.map((item) => ({
        blackbaudConstituentId:
          item?.record_id?.toString() || item?.id || item?.constituent_id || null,
        blackbaudLookupId:
          item?.lookup_id || item?.constituent_id || item?.record_id?.toString() || null,
        blackbaudRecordId: item?.record_id?.toString() || null,
        name:
          [
            item?.first_name,
            item?.middle_name,
            item?.last_name,
          ]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          item?.preferred_name ||
          item?.display_name ||
          item?.org_name ||
          "Unnamed constituent",
        email: item?.primary_email || item?.matched_email || null,
        phone: item?.primary_phone || item?.matched_phone || null,
        address:
          [
            item?.address_block,
            item?.address_city_state,
            item?.address_post_code,
          ]
            .filter(Boolean)
            .join("\n") || null,
        lookupId:
          item?.lookup_id || item?.constituent_id || item?.record_id?.toString() || null,
        raw: item,
      }));
    } catch (error) {
      if (isBlackbaudQuotaExceededError(error)) throw error;
      customSearchFailed = true;
      console.error("Blackbaud custom constituent search error:", error);
    }
  }

  if (customMappedRows.length === 0) {
    try {
      const payload = await blackbaudApiFetch(BLACKBAUD_CONSTITUENT_SEARCH_URL, {
        userId,
        authUserId,
        origin,
        searchParams: {
          search_text: query,
          limit: 10,
        },
        ...requestOptions,
      });

      const rows = Array.isArray(payload?.value)
        ? payload.value
        : Array.isArray(payload)
          ? payload
          : [];

      mappedRows = rows.map((item) => ({
        blackbaudConstituentId:
          item?.id ||
          item?.constituent_id ||
          item?.constituentId ||
          null,
        blackbaudLookupId:
          item?.lookup_id || item?.lookupId || item?.constituent_id || null,
        blackbaudRecordId:
          item?.record_id?.toString() || item?.recordId?.toString() || null,
        name:
          item?.name ||
          [item?.first, item?.middle, item?.last].filter(Boolean).join(" ").trim() ||
          item?.lookup_id ||
          "Unnamed constituent",
        email:
          item?.email ||
          item?.email?.address ||
          item?.primary_email ||
          item?.primary_email?.address ||
          null,
        phone:
          item?.phone ||
          item?.primary_phone?.number ||
          item?.phones?.[0]?.number ||
          null,
        address:
          item?.address ||
          item?.formatted_address ||
          item?.primary_address?.formatted_address ||
          null,
        lookupId:
          item?.lookup_id || item?.lookupId || item?.constituent_id || null,
        raw: item,
      }));
    } catch (error) {
      if (isBlackbaudQuotaExceededError(error)) throw error;
      primarySearchFailed = true;
      console.error("Blackbaud constituent search error:", error);
    }
  }

  const merged = [...mappedRows, ...customMappedRows];
  const deduped = [];
  const seen = new Set();

  for (const item of merged) {
    const key = item.blackbaudConstituentId || item.lookupId || item.name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  if (deduped.length > 0) {
    return deduped;
  }

  if (primarySearchFailed && customSearchFailed) {
    throw new Error("Failed to search Blackbaud constituents");
  }

  return deduped;
}

export async function findBlackbaudConstituentByEmail({
  userId,
  authUserId,
  origin,
  email,
  requestOptions = {},
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const payload = await blackbaudApiFetch(BLACKBAUD_CONSTITUENT_CUSTOMSEARCH_URL, {
    userId,
    authUserId,
    origin,
    searchParams: {
      email: normalizedEmail,
      limit: 10,
    },
    ...requestOptions,
  });

  const rows = Array.isArray(payload?.results) ? payload.results : [];
  const exactMatch =
    rows.find((item) => {
      const emails = [
        item?.primary_email,
        item?.matched_email,
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean);
      return emails.includes(normalizedEmail);
    }) || rows[0];

  if (!exactMatch) {
    return null;
  }

  return {
    blackbaudConstituentId:
      exactMatch?.record_id?.toString() || exactMatch?.id || exactMatch?.constituent_id || null,
    lookupId:
      exactMatch?.lookup_id || exactMatch?.constituent_id || exactMatch?.record_id?.toString() || null,
    name:
      [exactMatch?.first_name, exactMatch?.middle_name, exactMatch?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || null,
    email: exactMatch?.primary_email || exactMatch?.matched_email || null,
    raw: exactMatch,
  };
}

export async function findBlackbaudConstituentByLookupId({
  userId,
  authUserId,
  origin,
  lookupId,
  requestOptions = {},
}) {
  const normalizedLookupId = String(lookupId || "").trim();
  if (!normalizedLookupId) {
    return null;
  }

  // A lookup ID is already an exact NXT identifier. Avoid the generic search
  // path, which first attempts a name search and doubles import-review calls.
  const payload = await blackbaudApiFetch(BLACKBAUD_CONSTITUENT_SEARCH_URL, {
    userId,
    authUserId,
    origin,
    searchParams: {
      search_field: "lookup_id",
      search_text: normalizedLookupId,
      limit: 1,
    },
    ...requestOptions,
  });

  const rows = Array.isArray(payload?.value)
    ? payload.value
    : Array.isArray(payload)
      ? payload
      : [];
  const exactMatch = rows.find(
    (item) =>
      String(item?.lookup_id || item?.lookupId || "").trim() === normalizedLookupId,
  );

  if (!exactMatch) {
    return null;
  }

  return {
    blackbaudConstituentId:
      exactMatch?.id || exactMatch?.constituent_id || exactMatch?.constituentId || null,
    lookupId: exactMatch?.lookup_id || exactMatch?.lookupId || normalizedLookupId,
    name:
      exactMatch?.name ||
      [exactMatch?.first, exactMatch?.middle, exactMatch?.last].filter(Boolean).join(" ").trim() ||
      null,
    email:
      exactMatch?.email ||
      exactMatch?.email?.address ||
      exactMatch?.primary_email ||
      exactMatch?.primary_email?.address ||
      null,
    raw: exactMatch,
  };
}

export async function getBlackbaudConstituentById({
  userId,
  authUserId,
  origin,
  constituentId,
  requestOptions = {},
}) {
  const normalizedId = String(constituentId || "").trim();
  if (!normalizedId) {
    return null;
  }

  const payload = await blackbaudApiFetch(
    `${BLACKBAUD_CONSTITUENT_LIST_URL}/${encodeURIComponent(normalizedId)}`,
    {
      userId,
      authUserId,
      origin,
      ...requestOptions,
    },
  );

  if (!payload || typeof payload !== "object") {
    return null;
  }

  // Blackbaud endpoints normally return the constituent directly, but some
  // connector responses wrap it in `data`, `value`, or `constituent`. Keep the
  // full payload for diagnostics while exposing the actual constituent record
  // to callers that need its current profile values.
  const record = getBlackbaudConstituentRecord(payload);

  return {
    blackbaudConstituentId:
      record?.id?.toString() || record?.constituent_id?.toString() || normalizedId,
    lookupId: record?.lookup_id || record?.lookupId || null,
    name:
      record?.name ||
      [record?.first, record?.middle, record?.last].filter(Boolean).join(" ").trim() ||
      null,
    email: record?.address?.email?.address || record?.email?.address || record?.email || null,
    raw: record,
    response: payload,
  };
}

export async function listBlackbaudConstituentCodes({
  userId,
  authUserId,
  origin,
  constituentId,
}) {
  const normalizedId = String(constituentId || "").trim();
  if (!normalizedId) {
    throw new Error("A Blackbaud constituent ID is required to list constituency codes");
  }

  const payload = await blackbaudApiFetch(
    `${BLACKBAUD_CONSTITUENT_BASE_URL}/${encodeURIComponent(normalizedId)}/constituentcodes`,
    {
      userId,
      authUserId,
      origin,
    },
  );

  return getBlackbaudCollection(payload);
}

function getBlackbaudConstituentRecord(payload) {
  const queue = [payload];
  const seen = new Set();
  const candidates = [];
  const wrapperKeys = [
    "constituent",
    "record",
    "data",
    "result",
    "value",
    "item",
    "response",
    "individual",
    "profile",
  ];

  while (queue.length) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) continue;
    seen.add(candidate);

    if (Array.isArray(candidate)) {
      candidate.forEach((item) => queue.push(item));
      continue;
    }

    wrapperKeys.forEach((key) => {
      if (candidate[key]) queue.push(candidate[key]);
    });
    candidates.push(candidate);
  }

  // Some connector responses include an envelope ID as well as the actual
  // constituent record. Prefer the object carrying profile fields so the
  // review screen never interprets the envelope as an empty constituent.
  return candidates.reduce(
    (best, candidate) =>
      getBlackbaudConstituentRecordScore(candidate) > getBlackbaudConstituentRecordScore(best)
        ? candidate
        : best,
    payload,
  );
}

function getBlackbaudConstituentRecordScore(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return 0;

  const profileKeys = [
    "first",
    "last",
    "preferred_name",
    "preferredName",
    "birthdate",
    "birth_date",
    "title",
    "gender",
    "ethnicity",
    "suffix",
  ];
  const profileScore = profileKeys.reduce(
    (score, key) => score + (candidate[key] === undefined || candidate[key] === null || candidate[key] === "" ? 0 : 10),
    0,
  );
  const identityScore =
    candidate.constituent_id || candidate.lookup_id || candidate.constituent_type
      ? 3
      : candidate.id && candidate.type
        ? 2
        : 0;

  return profileScore + identityScore;
}

export async function listBlackbaudConstituentCustomFields({
  userId,
  authUserId,
  origin,
  constituentId,
}) {
  if (!constituentId) {
    throw new Error("A Blackbaud constituent ID is required to list custom fields");
  }

  const payload = await blackbaudApiFetch(
    `${BLACKBAUD_CONSTITUENT_BASE_URL}/${encodeURIComponent(
      String(constituentId),
    )}/customfields`,
    {
      userId,
      authUserId,
      origin,
    },
  );

  return Array.isArray(payload?.value) ? payload.value : Array.isArray(payload) ? payload : [];
}

// These are configuration metadata endpoints, not constituent searches. They
// keep report setup to a small, shared NXT request rather than scanning
// constituent custom-field values across the database.
export async function listBlackbaudConstituentCustomFieldCategories({
  userId,
  authUserId,
  origin,
  timeoutMs = 8000,
  maxRetries = 0,
}) {
  const payload = await blackbaudApiFetch(
    BLACKBAUD_CONSTITUENT_CUSTOM_FIELD_CATEGORY_DETAILS_URL,
    {
      userId,
      authUserId,
      origin,
      timeoutMs,
      maxRetries,
    },
  );

  return getBlackbaudCollection(payload);
}

export async function listBlackbaudConstituentCustomFieldCategoryValues({
  userId,
  authUserId,
  origin,
  categoryName,
  timeoutMs = 8000,
  maxRetries = 0,
}) {
  const normalizedCategoryName = String(categoryName || "").trim();
  if (!normalizedCategoryName) {
    throw new Error("A Blackbaud custom-field category name is required to list category values");
  }

  const payload = await blackbaudApiFetch(
    BLACKBAUD_CONSTITUENT_CUSTOM_FIELD_CATEGORY_VALUES_URL,
    {
      userId,
      authUserId,
      origin,
      searchParams: { category_name: normalizedCategoryName },
      timeoutMs,
      maxRetries,
    },
  );

  return getBlackbaudCollection(payload);
}

export async function createBlackbaudConstituentCustomField({
  userId,
  authUserId,
  origin,
  payload,
}) {
  return blackbaudApiFetch(`${BLACKBAUD_CONSTITUENT_BASE_URL}/customfields`, {
    userId,
    authUserId,
    origin,
    method: "POST",
    body: payload,
  });
}

export async function updateBlackbaudConstituentCustomField({
  userId,
  authUserId,
  origin,
  customFieldId,
  payload,
}) {
  if (!customFieldId) {
    throw new Error("A Blackbaud custom field ID is required to update a custom field");
  }

  return blackbaudApiFetch(
    `${BLACKBAUD_CONSTITUENT_BASE_URL}/customfields/${encodeURIComponent(
      String(customFieldId),
    )}`,
    {
      userId,
      authUserId,
      origin,
      method: "PATCH",
      body: payload,
    },
  );
}

export async function getBlackbaudFundraiserById({
  userId,
  authUserId,
  origin,
  fundraiserId,
}) {
  const normalizedId = String(fundraiserId || "").trim();
  if (!normalizedId) {
    return null;
  }

  const payload = await blackbaudApiFetch(
    `${BLACKBAUD_FUNDRAISER_ASSIGNMENTS_URL}/${encodeURIComponent(normalizedId)}`,
    {
      userId,
      authUserId,
      origin,
    },
  );

  if (!payload || typeof payload !== "object") {
    return null;
  }

  return {
    fundraiserId: payload?.id?.toString() || normalizedId,
    constituentId: payload?.constituent_id?.toString() || payload?.constituentId?.toString() || null,
    name:
      payload?.name ||
      [payload?.first_name, payload?.middle_name, payload?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      null,
    raw: payload,
  };
}

export async function listBlackbaudOpportunities({
  userId,
  authUserId,
  origin,
  searchParams,
  pageLimit = 500,
  maxPages = 20,
} = {}) {
  const results = [];
  let nextPath = BLACKBAUD_OPPORTUNITIES_URL;
  let nextSearchParams = {
    limit: pageLimit,
    ...searchParams,
  };
  let pageCount = 0;

  while (nextPath && pageCount < maxPages) {
    const payload = await blackbaudApiFetch(nextPath, {
      userId,
      authUserId,
      origin,
      searchParams: nextPath === BLACKBAUD_OPPORTUNITIES_URL ? nextSearchParams : undefined,
    });

    const rows = Array.isArray(payload?.value)
      ? payload.value
      : Array.isArray(payload)
        ? payload
        : [];
    results.push(...rows);

    nextPath = payload?.next_link || null;
    nextSearchParams = undefined;
    pageCount += 1;
  }

  return results;
}

export async function listBlackbaudGifts({
  userId,
  authUserId,
  origin,
  searchParams,
  pageLimit = 500,
  maxPages = 20,
  includePageMetadata = false,
} = {}) {
  const results = [];
  let nextPath = BLACKBAUD_GIFTS_URL;
  let nextSearchParams = {
    limit: pageLimit,
    ...searchParams,
  };
  let pageCount = 0;

  while (nextPath && pageCount < maxPages) {
    const payload = await blackbaudApiFetch(nextPath, {
      userId,
      authUserId,
      origin,
      searchParams: nextPath === BLACKBAUD_GIFTS_URL ? nextSearchParams : undefined,
    });

    const rows = Array.isArray(payload?.value)
      ? payload.value
      : Array.isArray(payload)
        ? payload
        : [];
    results.push(...rows);

    nextPath = payload?.next_link || null;
    nextSearchParams = undefined;
    pageCount += 1;
  }

  if (includePageMetadata) {
    return {
      gifts: results,
      pageCount,
      hasMore: Boolean(nextPath),
    };
  }

  return results;
}

export async function getBlackbaudGift({
  userId,
  authUserId,
  origin,
  giftId,
} = {}) {
  const normalizedGiftId = String(giftId || "").trim();
  if (!normalizedGiftId) {
    throw new Error("A Blackbaud gift ID is required");
  }

  return blackbaudApiFetch(
    `${BLACKBAUD_GIFTS_URL}/${encodeURIComponent(normalizedGiftId)}`,
    {
      userId,
      authUserId,
      origin,
    },
  );
}

// Gift V2 exposes the authoritative relationship between a planned gift and
// the revenue realized against it. Keep this separate from the Gift V1 list
// endpoint, which does not reliably include that relationship in list rows.
export async function listBlackbaudRealizedPlannedGiftRevenueGifts({
  userId,
  authUserId,
  origin,
  plannedGiftId,
} = {}) {
  const normalizedGiftId = String(plannedGiftId || "").trim();
  if (!normalizedGiftId) {
    throw new Error("A planned gift ID is required");
  }

  const payload = await blackbaudApiFetch(
    `${BLACKBAUD_GIFT_V2_URL}/${encodeURIComponent(
      normalizedGiftId,
    )}/plannedgift/realizedrevenuegifts`,
    {
      userId,
      authUserId,
      origin,
      searchParams: { limit: 500, offset: 0 },
      // A relationship check is supplemental. Do not retry it automatically
      // and spend additional provider quota when Blackbaud is unavailable.
      maxRetries: 0,
      timeoutMs: 10000,
    },
  );

  if (Array.isArray(payload?.realized_revenue_gifts)) {
    return payload.realized_revenue_gifts;
  }
  if (Array.isArray(payload?.realizedRevenueGifts)) {
    return payload.realizedRevenueGifts;
  }
  return getBlackbaudCollection(payload);
}

export async function listBlackbaudFundraiserAssignments({
  userId,
  authUserId,
  origin,
  fundraiserId,
  searchParams,
  pageLimit = 500,
  maxPages = 20,
} = {}) {
  if (!fundraiserId) {
    throw new Error("A Blackbaud fundraiser ID is required");
  }

  const primarySearchParams = {
    fundraiser_id: String(fundraiserId),
    limit: pageLimit,
    ...searchParams,
  };

  async function fetchAssignmentPages(initialPath, initialSearchParams) {
    const results = [];
    let nextPath = initialPath;
    let nextSearchParams = initialSearchParams;
    let pageCount = 0;

    while (nextPath && pageCount < maxPages) {
      const payload = await blackbaudApiFetch(nextPath, {
        userId,
        authUserId,
        origin,
        searchParams: nextSearchParams,
      });

      const rows = Array.isArray(payload?.value)
        ? payload.value
        : Array.isArray(payload)
          ? payload
          : [];
      results.push(...rows);

      nextPath = payload?.next_link || null;
      nextSearchParams = undefined;
      pageCount += 1;
    }

    return results;
  }

  try {
    return await fetchAssignmentPages(
      `${BLACKBAUD_FUNDRAISER_ASSIGNMENTS_URL}/assignments`,
      primarySearchParams,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (!/404|resource not found|invalid/i.test(message)) {
      throw error;
    }

    return fetchAssignmentPages(
      `${BLACKBAUD_FUNDRAISER_ASSIGNMENTS_URL}/${encodeURIComponent(
        String(fundraiserId),
      )}/assignments`,
      {
        limit: pageLimit,
        ...searchParams,
      },
    );
  }
}

export async function createBlackbaudFundraiserAssignment({
  userId,
  authUserId,
  origin,
  payload,
}) {
  return blackbaudApiFetch(`${BLACKBAUD_FUNDRAISER_ASSIGNMENTS_URL}/assignments`, {
    userId,
    authUserId,
    origin,
    method: "POST",
    body: payload,
  });
}

export async function updateBlackbaudFundraiserAssignment({
  userId,
  authUserId,
  origin,
  assignmentId,
  payload,
}) {
  const normalizedAssignmentId = String(assignmentId || "").trim();
  if (!normalizedAssignmentId) {
    throw new Error("A Blackbaud fundraiser assignment ID is required");
  }

  return blackbaudApiFetch(
    `${BLACKBAUD_FUNDRAISER_ASSIGNMENTS_URL}/assignments/${encodeURIComponent(
      normalizedAssignmentId,
    )}`,
    {
      userId,
      authUserId,
      origin,
      method: "PATCH",
      body: payload,
    },
  );
}

export async function listBlackbaudConstituents({
  userId,
  authUserId,
  origin,
  searchParams,
  pageLimit = 500,
  maxPages = 20,
} = {}) {
  const results = [];
  let nextPath = BLACKBAUD_CONSTITUENT_LIST_URL;
  let nextSearchParams = {
    limit: pageLimit,
    ...searchParams,
  };
  let pageCount = 0;

  while (nextPath && pageCount < maxPages) {
    const payload = await blackbaudApiFetch(nextPath, {
      userId,
      authUserId,
      origin,
      searchParams: nextPath === BLACKBAUD_CONSTITUENT_LIST_URL ? nextSearchParams : undefined,
    });

    const rows = Array.isArray(payload?.value)
      ? payload.value
      : Array.isArray(payload)
        ? payload
        : [];
    results.push(...rows);

    nextPath = payload?.next_link || null;
    nextSearchParams = undefined;
    pageCount += 1;
  }

  return results;
}

function appendActionSection(label, value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return `${label}: ${text}`;
}

function formatBlackbaudActionDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("A valid action date is required");
  }

  return parsed.toISOString().split("T")[0];
}

function formatBlackbaudActionCreateDateTime(value) {
  if (!value) {
    throw new Error("A valid action date is required");
  }

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T00:00:00.000Z`).toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("A valid action date is required");
  }

  return parsed.toISOString();
}

export function normalizeBlackbaudActionType(value) {
  const key = String(value || "")
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .toLowerCase();

  return NXT_ACTION_TYPE_MAP.get(key);
}

export function buildBlackbaudActionPayload({
  blackbaudConstituentId,
  actionDate,
  completedDate,
  actionCategory,
  summary,
  actionNotes,
  nextStep,
  authorName,
  opportunityId,
  fundraiserIds,
}) {
  if (!blackbaudConstituentId) {
    throw new Error("A linked Blackbaud constituent ID is required");
  }

  if (!actionDate) {
    throw new Error("An action date is required");
  }

  const summaryText = String(summary || "").trim();
  const normalizedCategory = String(actionCategory || "").trim() || "Task";
  const categoryMap = {
    Meeting: "Meeting",
    "Phone Call": "Phone Call",
    Email: "Email",
    Mail: "Task/Other",
    Task: "Task/Other",
  };
  const descriptionParts = [
    appendActionSection("Notes", actionNotes),
    appendActionSection("Next step", nextStep),
  ].filter(Boolean);
  const normalizedFundraiserIds = Array.isArray(fundraiserIds)
    ? fundraiserIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  return {
    constituent_id: String(blackbaudConstituentId),
    date: formatBlackbaudActionCreateDateTime(actionDate),
    category: categoryMap[normalizedCategory] || "Task/Other",
    completed: true,
    completed_date: formatBlackbaudActionDate(completedDate || actionDate),
    status: "Completed",
    direction: "Outbound",
    summary: summaryText || "Action update from JUMGOGPT",
    description: descriptionParts.join("\n\n") || undefined,
    author: String(authorName || "").trim() || undefined,
    opportunity_id: opportunityId ? String(opportunityId) : undefined,
    fundraisers: normalizedFundraiserIds.length > 0 ? normalizedFundraiserIds : undefined,
  };
}

export async function createBlackbaudAction({ userId, authUserId, origin, payload }) {
  return blackbaudApiFetch(BLACKBAUD_CREATE_ACTION_URL, {
    userId,
    authUserId,
    origin,
    method: "POST",
    body: payload,
  });
}

export async function getBlackbaudAction({
  userId,
  authUserId,
  origin,
  actionId,
}) {
  if (!actionId) {
    throw new Error("A Blackbaud action ID is required to fetch an action");
  }

  return blackbaudApiFetch(
    `${BLACKBAUD_ACTIONS_URL}/${encodeURIComponent(String(actionId))}`,
    {
      userId,
      authUserId,
      origin,
      method: "GET",
    },
  );
}

export async function listBlackbaudActions({
  userId,
  authUserId,
  origin,
  searchParams,
  pageLimit = 500,
  maxPages = 20,
} = {}) {
  const results = [];
  let nextPath = BLACKBAUD_ACTIONS_URL;
  let nextSearchParams = {
    limit: pageLimit,
    ...searchParams,
  };
  let pageCount = 0;

  while (nextPath && pageCount < maxPages) {
    const payload = await blackbaudApiFetch(nextPath, {
      userId,
      authUserId,
      origin,
      searchParams: nextPath === BLACKBAUD_ACTIONS_URL ? nextSearchParams : undefined,
    });

    const rows = Array.isArray(payload?.value)
      ? payload.value
      : Array.isArray(payload)
        ? payload
        : [];
    results.push(...rows);

    nextPath = payload?.next_link || null;
    nextSearchParams = undefined;
    pageCount += 1;
  }

  return results;
}

export async function executeBlackbaudListQuery({
  userId,
  authUserId,
  origin,
  dataModelName,
  definition = {},
  limit = 1000,
  maxPages = 20,
} = {}) {
  const normalizedDataModelName = String(dataModelName || "").trim();
  if (!normalizedDataModelName) {
    throw new Error("A Blackbaud data model name is required");
  }

  const results = [];
  let continuationToken = null;
  let pageCount = 0;

  while (pageCount < maxPages) {
    const payload = await blackbaudApiFetch(BLACKBAUD_LIST_V2_EXECUTE_QUERY_URL, {
      userId,
      authUserId,
      origin,
      method: "POST",
      body: {
        data_model_name: normalizedDataModelName,
        definition,
        limit,
        ...(continuationToken ? { continuation_token: continuationToken } : {}),
      },
    });

    const rows = Array.isArray(payload?.items) ? payload.items : [];
    results.push(...rows);

    continuationToken =
      typeof payload?.continuation_token === "string" && payload.continuation_token.trim()
        ? payload.continuation_token.trim()
        : typeof payload?.continuationToken === "string" && payload.continuationToken.trim()
          ? payload.continuationToken.trim()
          : null;

    pageCount += 1;
    if (!continuationToken || !rows.length) {
      break;
    }
  }

  return results;
}

export function buildBlackbaudActionMetadataPayload({
  actionDate,
  completedDate,
  interactionType,
  fundraiserIds,
  opportunityId,
}) {
  const normalizedActionType = normalizeBlackbaudActionType(interactionType);

  return {
    type: normalizedActionType,
    completed: true,
    completed_date: formatBlackbaudActionDate(completedDate || actionDate),
    status: "Completed",
    opportunity_id: opportunityId ? String(opportunityId) : undefined,
    fundraisers: Array.isArray(fundraiserIds)
      ? fundraiserIds.map((value) => String(value || "").trim()).filter(Boolean)
      : undefined,
  };
}

export async function updateBlackbaudAction({
  userId,
  authUserId,
  origin,
  actionId,
  payload,
}) {
  if (!actionId) {
    throw new Error("A Blackbaud action ID is required to update an action");
  }

  return blackbaudApiFetch(
    `${BLACKBAUD_ACTIONS_URL}/${encodeURIComponent(String(actionId))}`,
    {
      userId,
      authUserId,
      origin,
      method: "PATCH",
      body: payload,
    },
  );
}

export async function deleteBlackbaudAction({
  userId,
  authUserId,
  origin,
  actionId,
}) {
  if (!actionId) {
    throw new Error("A Blackbaud action ID is required to delete an action");
  }

  return blackbaudApiFetch(
    `${BLACKBAUD_ACTIONS_URL}/${encodeURIComponent(String(actionId))}`,
    {
      userId,
      authUserId,
      origin,
      method: "DELETE",
    },
  );
}

function toBlackbaudDateTime(value) {
  if (!value) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return `${value}T00:00:00Z`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function normalizeOpportunityStatusLabel(value) {
  return String(value || "")
    .trim()
    .replace(/\s*[–—-]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isDeclinedOpportunityStatus(value) {
  const normalized = normalizeOpportunityStatusLabel(value);
  return normalized === "closed - declined" || normalized === "declined";
}

function isFundedOpportunityStatus(value) {
  const normalized = normalizeOpportunityStatusLabel(value);
  return normalized === "closed - gift secured" || normalized === "funded";
}

export function buildBlackbaudOpportunityPayload({
  blackbaudConstituentId,
  title,
  purpose,
  currentStage,
  estimatedAmount,
  askDate,
  expectedDate,
  opportunityStatus,
  closedAmount,
  closeDate,
}) {
  const payload = {};

  if (blackbaudConstituentId) {
    payload.constituent_id = String(blackbaudConstituentId);
  }

  const normalizedTitle = String(title || "").trim();
  if (normalizedTitle) {
    payload.name = normalizedTitle;
  }

  const isDeclined =
    isDeclinedOpportunityStatus(opportunityStatus) ||
    isDeclinedOpportunityStatus(currentStage);
  const isFunded =
    isFundedOpportunityStatus(opportunityStatus) ||
    isFundedOpportunityStatus(currentStage);
  const normalizedPurpose = String(
    isDeclined ? DECLINED_OPPORTUNITY_PURPOSE : purpose || "",
  ).trim();
  if (normalizedPurpose) {
    payload.purpose = normalizedPurpose;
  }

  const normalizedStage = String(
    isDeclined
      ? DECLINED_OPPORTUNITY_STATUS
      : isFunded
        ? "Funded"
        : currentStage || "",
  ).trim();
  if (normalizedStage) {
    payload.status = normalizedStage;
  }

  if (estimatedAmount !== undefined && estimatedAmount !== null && estimatedAmount !== "") {
    const numericAmount = Number(estimatedAmount);
    if (Number.isFinite(numericAmount)) {
      payload.expected_amount = { value: numericAmount };

      if (askDate) {
        payload.ask_amount = { value: numericAmount };
      }
    }
  }

  const normalizedAskDate = toBlackbaudDateTime(askDate);
  if (normalizedAskDate) {
    payload.ask_date = normalizedAskDate;
  }

  const normalizedExpectedDate = toBlackbaudDateTime(expectedDate);
  if (normalizedExpectedDate) {
    payload.expected_date = normalizedExpectedDate;
  }

  if (isFunded) {
    const numericFundedAmount = Number(
      closedAmount ?? estimatedAmount ?? null,
    );
    if (Number.isFinite(numericFundedAmount)) {
      payload.funded_amount = { value: numericFundedAmount };
    }

    const normalizedFundedDate = toBlackbaudDateTime(closeDate);
    if (normalizedFundedDate) {
      payload.funded_date = normalizedFundedDate;
    }
  }

  return payload;
}

export async function createBlackbaudOpportunity({
  userId,
  authUserId,
  origin,
  payload,
}) {
  return blackbaudApiFetch(BLACKBAUD_OPPORTUNITIES_URL, {
    userId,
    authUserId,
    origin,
    method: "POST",
    body: payload,
  });
}

export async function updateBlackbaudOpportunity({
  userId,
  authUserId,
  origin,
  opportunityId,
  payload,
}) {
  if (!opportunityId) {
    throw new Error("A Blackbaud opportunity ID is required to update an opportunity");
  }

  return blackbaudApiFetch(
    `${BLACKBAUD_OPPORTUNITIES_URL}/${encodeURIComponent(String(opportunityId))}`,
    {
      userId,
      authUserId,
      origin,
      method: "PATCH",
      body: payload,
    },
  );
}

export async function getBlackbaudOpportunity({
  userId,
  authUserId,
  origin,
  opportunityId,
}) {
  if (!opportunityId) {
    throw new Error("A Blackbaud opportunity ID is required to fetch an opportunity");
  }

  return blackbaudApiFetch(
    `${BLACKBAUD_OPPORTUNITIES_URL}/${encodeURIComponent(String(opportunityId))}`,
    {
      userId,
      authUserId,
      origin,
      method: "GET",
    },
  );
}

export function buildBlackbaudAuthorizeUrl({ origin, state }) {
  const config = getBlackbaudConfig(origin);
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    state,
  });

  if (config.scopes.length > 0) {
    params.set("scope", config.scopes.join(" "));
  }

  return `${BLACKBAUD_AUTHORIZE_URL}?${params.toString()}`;
}
