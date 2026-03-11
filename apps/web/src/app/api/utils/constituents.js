import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";

export function normalizeConstituentName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function verifyOwnedConstituent(userId, constituentId) {
  const result = await sql`
    SELECT id, user_id, name, normalized_name
    FROM constituents
    WHERE id = ${constituentId} AND user_id = ${userId}
    LIMIT 1
  `;
  return result[0] || null;
}

export async function findExistingConstituent(userId, name) {
  await ensureAppSchema();
  const normalizedName = normalizeConstituentName(name);
  if (!normalizedName) return null;

  const result = await sql`
    SELECT id, user_id, name, normalized_name
    FROM constituents
    WHERE user_id = ${userId} AND normalized_name = ${normalizedName}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `;

  return result[0] || null;
}

export async function createConstituent(userId, name) {
  await ensureAppSchema();
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  const normalizedName = normalizeConstituentName(cleanName);

  const result = await sql`
    INSERT INTO constituents (
      user_id,
      name,
      normalized_name,
      created_at,
      updated_at
    ) VALUES (
      ${userId},
      ${cleanName},
      ${normalizedName},
      NOW(),
      NOW()
    )
    RETURNING id, user_id, name, normalized_name
  `;

  return result[0] || null;
}

export async function linkHistoricalRecords(userId, name, constituentId) {
  await ensureAppSchema();
  const normalizedName = normalizeConstituentName(name);
  if (!normalizedName || !constituentId) return;

  await sql`
    UPDATE submissions
    SET constituent_id = ${constituentId}, updated_at = NOW()
    WHERE
      user_id = ${userId}
      AND constituent_id IS NULL
      AND donor_name IS NOT NULL
      AND LOWER(TRIM(REGEXP_REPLACE(donor_name, '\s+', ' ', 'g'))) = ${normalizedName}
  `;

  await sql`
    UPDATE prospects
    SET constituent_id = ${constituentId}, updated_at = NOW()
    WHERE
      user_id = ${userId}
      AND constituent_id IS NULL
      AND prospect_name IS NOT NULL
      AND LOWER(TRIM(REGEXP_REPLACE(prospect_name, '\s+', ' ', 'g'))) = ${normalizedName}
  `;
}

export async function resolveConstituent({
  userId,
  name,
  constituentId,
  createNew = false,
}) {
  await ensureAppSchema();

  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  if (!cleanName) {
    return null;
  }

  if (constituentId) {
    const existing = await verifyOwnedConstituent(userId, constituentId);
    if (!existing) {
      throw new Error("Selected constituent could not be found.");
    }
    await linkHistoricalRecords(userId, existing.name, existing.id);
    return existing;
  }

  if (!createNew) {
    const matched = await findExistingConstituent(userId, cleanName);
    if (matched) {
      await linkHistoricalRecords(userId, matched.name, matched.id);
      return matched;
    }
  }

  const created = await createConstituent(userId, cleanName);
  if (created) {
    await linkHistoricalRecords(userId, cleanName, created.id);
  }
  return created;
}
