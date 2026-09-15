import { createHash, randomUUID } from "node:crypto";
import sql from "@/app/api/utils/sql";
import { hasSavedPortfolioContacts } from "@/utils/portfolioContacts";
import { portfolioContactCacheKey } from "./portfolioContactCacheKey";
export { portfolioContactCacheKey } from "./portfolioContactCacheKey";

export async function isAssignedPortfolioConstituent(workspaceUserId, constituentId) {
  const rows = await sql`
    SELECT 1 AS assigned FROM users
    WHERE id = ${workspaceUserId} AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(blackbaud_portfolio_cache -> 'leadSolicitor') = 'array'
          THEN blackbaud_portfolio_cache -> 'leadSolicitor' ELSE '[]'::jsonb END ||
        CASE WHEN jsonb_typeof(blackbaud_portfolio_cache -> 'supportingSolicitor') = 'array'
          THEN blackbaud_portfolio_cache -> 'supportingSolicitor' ELSE '[]'::jsonb END
      ) person WHERE person ->> 'constituentId' = ${constituentId}
    )
  `;
  return rows.length > 0;
}

export async function readPortfolioContact({ workspaceUserId, authUserId, constituentId, origin }) {
  const rows = await sql`
    WITH contacts AS (
      SELECT payload #> '{mapped,constituent}' AS constituent, updated_at AS checked_at, 1 AS source_priority
      FROM blackbaud_constituent_summary_cache
      WHERE workspace_user_id = ${workspaceUserId} AND auth_user_id = ${authUserId}
        AND constituent_id = ${constituentId}
        AND (cache_key NOT LIKE 'portfolio-contact-v1|%'
          OR cache_key = ${portfolioContactCacheKey(origin, constituentId)})
      UNION ALL
      SELECT summary_payload #> '{mapped,constituent}', last_refreshed_at, 2 AS source_priority
      FROM portfolio_constituent_snapshots
      WHERE workspace_user_id = ${workspaceUserId} AND constituent_id = ${constituentId}
    )
    SELECT constituent, checked_at FROM contacts
    WHERE jsonb_typeof(constituent) = 'object'
      AND jsonb_typeof(constituent -> 'email') IN ('string', 'null')
      AND jsonb_typeof(constituent -> 'phone') IN ('string', 'null')
      AND jsonb_typeof(constituent -> 'address') IN ('string', 'null')
      AND (constituent ->> 'id' IS NULL OR constituent ->> 'id' = ${constituentId})
      AND checked_at <= NOW()
    ORDER BY checked_at DESC NULLS LAST, source_priority LIMIT 1
  `;
  const row = rows[0];
  if (!hasSavedPortfolioContacts(row?.constituent)) return null;
  return {
    email: row.constituent.email, phone: row.constituent.phone, address: row.constituent.address,
    contactCheckedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null,
    contactDataSource: "nxt-summary-cache",
  };
}

export function mapPortfolioContact(record, constituentId) {
  if (!record || String(record.id || "") !== constituentId ||
      typeof record.name !== "string" || !record.name.trim()) {
    throw new Error("Invalid constituent contact response");
  }
  for (const [field, keys] of [["email", ["address"]], ["phone", ["number"]],
    ["address", ["formatted_address", "line_1"]]]) {
    const value = record[field];
    if (value == null) continue;
    if (typeof value !== "object" || Array.isArray(value) ||
        keys.some(key => value[key] != null && typeof value[key] !== "string") ||
        !keys.some(key => Object.hasOwn(value, key))) {
      throw new Error("Invalid constituent contact fields");
    }
  }
  for (const field of ["email_address", "phone_number"]) {
    if (record[field] != null && typeof record[field] !== "string") {
      throw new Error("Invalid constituent contact fields");
    }
  }
  const text = (...values) => values.find(value => typeof value === "string" && value.trim())?.trim() || null;
  return {
    id: constituentId,
    name: record.name,
    deceased: record.deceased ?? null,
    deceased_date: record.deceased_date ?? null,
    email: text(record.email?.address, record.email_address),
    phone: text(record.phone?.number, record.phone_number),
    address: text(record.address?.formatted_address, record.address?.line_1),
  };
}

export async function savePortfolioContact(scope, constituent, checkedAt) {
  const { workspaceUserId, authUserId, constituentId, origin } = scope;
  // Contacts have their own cache entry. Never renew full-summary/giving freshness.
  await sql`
    INSERT INTO blackbaud_constituent_summary_cache (
      workspace_user_id, auth_user_id, cache_key, constituent_id, payload, updated_at
    ) VALUES (${workspaceUserId}, ${authUserId}, ${portfolioContactCacheKey(origin, constituentId)},
      ${constituentId}, ${JSON.stringify({ mapped: { constituent } })}::jsonb, ${checkedAt}::timestamptz)
    ON CONFLICT (workspace_user_id, auth_user_id, cache_key) DO UPDATE SET
      payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
    WHERE blackbaud_constituent_summary_cache.updated_at <= EXCLUDED.updated_at
  `;
}

export async function claimPortfolioContactGate({ authUserId, origin }) {
  const originKey = createHash("sha256").update(origin).digest("hex");
  const token = randomUUID();
  const rows = await sql`
    INSERT INTO portfolio_contact_refresh_gates (auth_user_id, origin_key, lease_token, lease_until)
    VALUES (${authUserId}, ${originKey}, ${token}, NOW() + INTERVAL '60 seconds')
    ON CONFLICT (auth_user_id, origin_key) DO UPDATE SET
      lease_token = EXCLUDED.lease_token, lease_until = EXCLUDED.lease_until
    WHERE (portfolio_contact_refresh_gates.lease_until IS NULL
      OR portfolio_contact_refresh_gates.lease_until <= NOW())
      AND portfolio_contact_refresh_gates.next_allowed_at <= NOW()
    RETURNING lease_token
  `;
  if (rows.length) return { token, originKey, authUserId };
  const [gate] = await sql`
    SELECT GREATEST(lease_until, next_allowed_at) AS retry_at
    FROM portfolio_contact_refresh_gates
    WHERE auth_user_id = ${authUserId} AND origin_key = ${originKey}
  `;
  return { retryAt: gate?.retry_at || new Date(Date.now() + 60_000).toISOString() };
}

export async function releasePortfolioContactGate(gate, cooldownMs = 500) {
  await sql`
    UPDATE portfolio_contact_refresh_gates SET lease_token = NULL, lease_until = NULL,
      next_allowed_at = NOW() + (${cooldownMs} * INTERVAL '1 millisecond')
    WHERE auth_user_id = ${gate.authUserId} AND origin_key = ${gate.originKey}
      AND lease_token = ${gate.token}
  `;
}
