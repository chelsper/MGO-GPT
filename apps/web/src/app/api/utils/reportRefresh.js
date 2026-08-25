import sql from "@/app/api/utils/sql";

function getRefreshSecret() {
  return String(
    process.env.CRON_SECRET || process.env.REPORT_REFRESH_CRON_SECRET || "",
  ).trim();
}

export function isAuthorizedReportRefreshRequest(request) {
  const requestedRefresh =
    String(request?.headers?.get("x-mgogpt-report-refresh") || "").trim() === "scheduled";
  const secret = getRefreshSecret();
  const authorization = String(request?.headers?.get("authorization") || "").trim();

  return Boolean(requestedRefresh && secret && authorization === `Bearer ${secret}`);
}

async function getConfiguredRefreshUser() {
  const configuredUserId = Number(process.env.REPORT_REFRESH_USER_ID || 0);
  const configuredEmail = String(process.env.REPORT_REFRESH_USER_EMAIL || "")
    .trim()
    .toLocaleLowerCase("en-US");

  if (!Number.isInteger(configuredUserId) || configuredUserId <= 0) {
    if (!configuredEmail) return null;
    const users = await sql`
      SELECT u.id, u.name, u.email, u.role
      FROM users AS u
      INNER JOIN blackbaud_connections AS bc ON bc.user_id = u.id
      WHERE u.active = TRUE
        AND LOWER(u.email) = ${configuredEmail}
        AND NULLIF(BTRIM(bc.access_token), '') IS NOT NULL
      LIMIT 1
    `;
    return users[0] || null;
  }

  const users = await sql`
    SELECT u.id, u.name, u.email, u.role
    FROM users AS u
    INNER JOIN blackbaud_connections AS bc ON bc.user_id = u.id
    WHERE u.active = TRUE
      AND u.id = ${configuredUserId}
      AND NULLIF(BTRIM(bc.access_token), '') IS NOT NULL
    LIMIT 1
  `;
  return users[0] || null;
}

// Scheduled reports use an authorized Admin or Advancement Services
// connection. A project can pin a specific service account with
// REPORT_REFRESH_USER_ID or REPORT_REFRESH_USER_EMAIL when needed.
export async function getReportRefreshUser() {
  const configuredUser = await getConfiguredRefreshUser();
  if (configuredUser) return configuredUser;

  const users = await sql`
    SELECT u.id, u.name, u.email, u.role
    FROM users AS u
    INNER JOIN blackbaud_connections AS bc ON bc.user_id = u.id
    WHERE u.active = TRUE
      AND NULLIF(BTRIM(bc.access_token), '') IS NOT NULL
      AND (
        POSITION(',admin,' IN ',' || REPLACE(LOWER(COALESCE(u.role, '')), ' ', '') || ',') > 0
        OR POSITION(',advancement_services,' IN ',' || REPLACE(LOWER(COALESCE(u.role, '')), ' ', '') || ',') > 0
      )
    ORDER BY
      CASE WHEN NULLIF(BTRIM(bc.refresh_token), '') IS NULL THEN 1 ELSE 0 END,
      bc.updated_at DESC NULLS LAST,
      u.id ASC
    LIMIT 1
  `;

  return users[0] || null;
}
