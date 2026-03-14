import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";

export function normalizeConstituentName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

let prospectsTableReady;

async function hasProspectsTable() {
  if (typeof prospectsTableReady === "boolean") {
    return prospectsTableReady;
  }

  const result = await sql`
    SELECT to_regclass('public.prospects') AS table_name
  `;

  prospectsTableReady = Boolean(result[0]?.table_name);
  return prospectsTableReady;
}

async function verifyOwnedConstituent(userId, constituentId) {
  const result = await sql`
    SELECT id, user_id, name, normalized_name, blackbaud_constituent_id
    FROM constituents
    WHERE id = ${constituentId} AND user_id = ${userId}
    LIMIT 1
  `;
  return result[0] || null;
}

async function findConstituentByBlackbaudId(userId, blackbaudConstituentId) {
  if (!blackbaudConstituentId) return null;

  const result = await sql`
    SELECT id, user_id, name, normalized_name, blackbaud_constituent_id
    FROM constituents
    WHERE user_id = ${userId} AND blackbaud_constituent_id = ${blackbaudConstituentId}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `;

  return result[0] || null;
}

async function linkBlackbaudConstituentId(userId, constituentId, blackbaudConstituentId) {
  if (!constituentId || !blackbaudConstituentId) return null;

  const result = await sql`
    UPDATE constituents
    SET
      blackbaud_constituent_id = ${blackbaudConstituentId},
      updated_at = NOW()
    WHERE id = ${constituentId} AND user_id = ${userId}
    RETURNING id, user_id, name, normalized_name, blackbaud_constituent_id
  `;

  return result[0] || null;
}

export async function findExistingConstituent(userId, name) {
  await ensureAppSchema();
  const normalizedName = normalizeConstituentName(name);
  if (!normalizedName) return null;

  const result = await sql`
    SELECT id, user_id, name, normalized_name, blackbaud_constituent_id
    FROM constituents
    WHERE user_id = ${userId} AND normalized_name = ${normalizedName}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `;

  return result[0] || null;
}

export async function createConstituent(userId, name, blackbaudConstituentId = null) {
  await ensureAppSchema();
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  const normalizedName = normalizeConstituentName(cleanName);

  const result = await sql`
    INSERT INTO constituents (
      user_id,
      name,
      normalized_name,
      blackbaud_constituent_id,
      created_at,
      updated_at
    ) VALUES (
      ${userId},
      ${cleanName},
      ${normalizedName},
      ${blackbaudConstituentId || null},
      NOW(),
      NOW()
    )
    RETURNING id, user_id, name, normalized_name, blackbaud_constituent_id
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

  if (!(await hasProspectsTable())) {
    return;
  }

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
  blackbaudConstituentId,
  createNew = false,
}) {
  await ensureAppSchema();

  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  if (!cleanName) {
    return null;
  }

  if (constituentId) {
    let existing = await verifyOwnedConstituent(userId, constituentId);
    if (!existing) {
      throw new Error("Selected constituent could not be found.");
    }
    if (blackbaudConstituentId && existing.blackbaud_constituent_id !== blackbaudConstituentId) {
      existing =
        (await linkBlackbaudConstituentId(userId, existing.id, blackbaudConstituentId)) ||
        existing;
    }
    await linkHistoricalRecords(userId, existing.name, existing.id);
    return existing;
  }

  if (blackbaudConstituentId) {
    const linked = await findConstituentByBlackbaudId(userId, blackbaudConstituentId);
    if (linked) {
      await linkHistoricalRecords(userId, linked.name, linked.id);
      return linked;
    }
  }

  if (!createNew) {
    let matched = await findExistingConstituent(userId, cleanName);
    if (matched) {
      if (blackbaudConstituentId && matched.blackbaud_constituent_id !== blackbaudConstituentId) {
        matched =
          (await linkBlackbaudConstituentId(userId, matched.id, blackbaudConstituentId)) ||
          matched;
      }
      await linkHistoricalRecords(userId, matched.name, matched.id);
      return matched;
    }
  }

  const created = await createConstituent(
    userId,
    cleanName,
    blackbaudConstituentId || null,
  );
  if (created) {
    await linkHistoricalRecords(userId, cleanName, created.id);
  }
  return created;
}
