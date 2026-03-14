import crypto from "node:crypto";

import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import sql from "@/app/api/utils/sql";

const BLACKBAUD_AUTHORIZE_URL = "https://oauth2.sky.blackbaud.com/authorization";
const BLACKBAUD_TOKEN_URL = "https://oauth2.sky.blackbaud.com/token";
const BLACKBAUD_CONSTITUENT_SEARCH_URL =
  "https://api.sky.blackbaud.com/constituent/v1/constituents/search";
const BLACKBAUD_CREATE_ACTION_URL =
  "https://api.sky.blackbaud.com/constituent/v1/actions";
const BLACKBAUD_ACTIONS_URL =
  "https://api.sky.blackbaud.com/constituent/v1/actions";

export function getBlackbaudConfig(origin) {
  const clientId = process.env.BLACKBAUD_CLIENT_ID || "";
  const clientSecret = process.env.BLACKBAUD_CLIENT_SECRET || "";
  const subscriptionKey = process.env.BLACKBAUD_SUBSCRIPTION_KEY || "";
  const redirectUri =
    process.env.BLACKBAUD_REDIRECT_URI ||
    (origin ? `${origin}/api/blackbaud/callback` : "");
  const scopes = (process.env.BLACKBAUD_SCOPES || "offline_access")
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
  { userId, origin, searchParams, method = "GET", body } = {},
) {
  const config = getBlackbaudConfig(origin);
  const connection = await getValidBlackbaudConnection(userId, origin);

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

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return parseBlackbaudResponse(response);
}

export async function searchBlackbaudConstituents({ userId, origin, query }) {
  const payload = await blackbaudApiFetch(BLACKBAUD_CONSTITUENT_SEARCH_URL, {
    userId,
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

  return rows.map((item) => ({
    blackbaudConstituentId:
      item?.id ||
      item?.constituent_id ||
      item?.constituentId ||
      null,
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
    lookupId: item?.lookup_id || item?.lookupId || null,
    raw: item,
  }));
}

function appendActionSection(label, value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return `${label}: ${text}`;
}

export function buildBlackbaudActionPayload({
  blackbaudConstituentId,
  actionDate,
  summary,
  actionNotes,
  nextStep,
  interactionType,
  authorName,
  opportunityId,
}) {
  if (!blackbaudConstituentId) {
    throw new Error("A linked Blackbaud constituent ID is required");
  }

  if (!actionDate) {
    throw new Error("An action date is required");
  }

  const categoryMap = {
    call: "Phone Call",
    visit: "Meeting",
    email: "Email",
    event: "Meeting",
  };

  const summaryText = String(summary || "").trim();
  const descriptionParts = [
    appendActionSection("Summary", summaryText),
    appendActionSection("Notes", actionNotes),
    appendActionSection("Next step", nextStep),
  ].filter(Boolean);

  return {
    constituent_id: String(blackbaudConstituentId),
    date: new Date(actionDate).toISOString(),
    category: categoryMap[String(interactionType || "").toLowerCase()] || "Task/Other",
    direction: "Outbound",
    summary: summaryText || "Action update from JUMGOGPT",
    description: descriptionParts.join("\n\n") || undefined,
    author: String(authorName || "").trim() || undefined,
    opportunity_id: opportunityId ? String(opportunityId) : undefined,
  };
}

export async function createBlackbaudAction({ userId, origin, payload }) {
  return blackbaudApiFetch(BLACKBAUD_CREATE_ACTION_URL, {
    userId,
    origin,
    method: "POST",
    body: payload,
  });
}

export async function updateBlackbaudAction({
  userId,
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
