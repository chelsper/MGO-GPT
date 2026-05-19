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
const BLACKBAUD_GIFTS_URL = "https://api.sky.blackbaud.com/gift/v1/gifts";
const BLACKBAUD_FUNDRAISER_ASSIGNMENTS_URL =
  "https://api.sky.blackbaud.com/fundraising/v1/fundraisers";
const BLACKBAUD_REQUEST_TIMEOUT_MS = 15000;
const BLACKBAUD_MAX_RETRIES = 2;
const DEFAULT_BLACKBAUD_SCOPES = "offline_access rnxt.r rnxt.w";

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
      payload?.message ||
      payload?.error_description ||
      payload?.error ||
      responseText ||
      response.statusText ||
      "Blackbaud request failed";
    throw new Error(
      `Blackbaud ${response.status} ${response.statusText}: ${detail}`,
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
  if (response.status === 403 && response.headers.get("retry-after")) return true;
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
  { userId, authUserId, origin, searchParams, method = "GET", body } = {},
) {
  const config = getBlackbaudConfig(origin);
  const connection = await getValidBlackbaudConnection(authUserId || userId, origin);

  if (!connection?.access_token) {
    throw new Error("Blackbaud is not connected for this user");
  }

  const url = new URL(path.startsWith("http") ? path : `https://api.sky.blackbaud.com${path}`);
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
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

  for (let attempt = 0; attempt <= BLACKBAUD_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BLACKBAUD_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (shouldRetryBlackbaudResponse(response) && attempt < BLACKBAUD_MAX_RETRIES) {
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

      if (timedOut && attempt < BLACKBAUD_MAX_RETRIES) {
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

export async function searchBlackbaudConstituents({ userId, authUserId, origin, query }) {
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
}) {
  const normalizedLookupId = String(lookupId || "").trim();
  if (!normalizedLookupId) {
    return null;
  }

  const matches = await searchBlackbaudConstituents({
    userId,
    authUserId,
    origin,
    query: normalizedLookupId,
  });

  const exactMatch =
    matches.find(
      (item) =>
        String(item?.lookupId || item?.blackbaudLookupId || "").trim() ===
        normalizedLookupId,
    ) || matches[0];

  if (!exactMatch) {
    return null;
  }

  return {
    blackbaudConstituentId: exactMatch.blackbaudConstituentId || null,
    lookupId:
      exactMatch.lookupId || exactMatch.blackbaudLookupId || normalizedLookupId,
    name: exactMatch.name || null,
    email: exactMatch.email || null,
    raw: exactMatch.raw || exactMatch,
  };
}

export async function getBlackbaudConstituentById({
  userId,
  authUserId,
  origin,
  constituentId,
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
    },
  );

  if (!payload || typeof payload !== "object") {
    return null;
  }

  return {
    blackbaudConstituentId:
      payload?.id?.toString() || payload?.constituent_id?.toString() || normalizedId,
    lookupId: payload?.lookup_id || payload?.lookupId || null,
    name:
      payload?.name ||
      [payload?.first, payload?.middle, payload?.last].filter(Boolean).join(" ").trim() ||
      null,
    email: payload?.address?.email?.address || payload?.email?.address || null,
    raw: payload,
  };
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

  return results;
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

export function buildBlackbaudActionPayload({
  blackbaudConstituentId,
  actionDate,
  actionCategory,
  summary,
  actionNotes,
  nextStep,
  authorName,
  opportunityId,
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
    Mail: "Mail",
    Task: "Task/Other",
  };
  const descriptionParts = [
    appendActionSection("Notes", actionNotes),
    appendActionSection("Next step", nextStep),
  ].filter(Boolean);

  return {
    constituent_id: String(blackbaudConstituentId),
    date: new Date(actionDate).toISOString(),
    category: categoryMap[normalizedCategory] || "Task/Other",
    direction: "Outbound",
    summary: summaryText || "Action update from JUMGOGPT",
    description: descriptionParts.join("\n\n") || undefined,
    author: String(authorName || "").trim() || undefined,
    opportunity_id: opportunityId ? String(opportunityId) : undefined,
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

export function buildBlackbaudActionMetadataPayload({
  actionDate,
  interactionType,
}) {
  const normalizedActionType = String(interactionType || "").trim() || undefined;

  return {
    type: normalizedActionType,
    completed: true,
    completed_date: new Date(actionDate).toISOString(),
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

export async function deleteBlackbaudAction({ userId, origin, actionId }) {
  if (!actionId) {
    throw new Error("A Blackbaud action ID is required to delete an action");
  }

  return blackbaudApiFetch(
    `${BLACKBAUD_ACTIONS_URL}/${encodeURIComponent(String(actionId))}`,
    {
      userId,
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

  const normalizedPurpose = String(purpose || "").trim();
  if (normalizedPurpose) {
    payload.purpose = normalizedPurpose;
  }

  const normalizedStage = String(currentStage || "").trim();
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

  if (opportunityStatus === "Closed – Gift Secured") {
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
