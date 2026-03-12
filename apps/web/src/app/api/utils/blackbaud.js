import crypto from "node:crypto";

import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import sql from "@/app/api/utils/sql";

const BLACKBAUD_AUTHORIZE_URL = "https://oauth2.sky.blackbaud.com/authorization";
const BLACKBAUD_TOKEN_URL = "https://oauth2.sky.blackbaud.com/token";

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
