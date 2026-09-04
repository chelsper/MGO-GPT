import sql from "@/app/api/utils/sql";
import { normalizeConstituentName } from "@/app/api/utils/constituents";

export const MAX_DISCUSSION_CONSTITUENTS = 20;

export function normalizeDiscussionConstituents(value) {
  if (!Array.isArray(value)) return [];

  const normalized = [];
  const seen = new Set();
  for (const candidate of value) {
    const blackbaudConstituentId = String(
      candidate?.blackbaudConstituentId || candidate?.blackbaudRecordId || "",
    ).trim();
    const name = String(candidate?.name || "").trim().slice(0, 200);
    const lookupId = String(
      candidate?.lookupId || candidate?.blackbaudLookupId || "",
    ).trim().slice(0, 100);

    if (!/^\d{1,30}$/.test(blackbaudConstituentId) || !name || seen.has(blackbaudConstituentId)) {
      continue;
    }

    seen.add(blackbaudConstituentId);
    normalized.push({ blackbaudConstituentId, name, lookupId: lookupId || null });
    if (normalized.length === MAX_DISCUSSION_CONSTITUENTS) break;
  }
  return normalized;
}

export async function resolveDiscussionConstituents(userId, value) {
  const selections = normalizeDiscussionConstituents(value);
  const resolved = [];

  for (const selection of selections) {
    const existing = await sql`
      SELECT id, name, blackbaud_constituent_id
      FROM constituents
      WHERE user_id = ${userId}
        AND blackbaud_constituent_id = ${selection.blackbaudConstituentId}
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `;

    let constituent = existing[0];
    if (!constituent) {
      const inserted = await sql`
        INSERT INTO constituents (
          user_id,
          blackbaud_constituent_id,
          name,
          normalized_name,
          created_at,
          updated_at
        )
        VALUES (
          ${userId},
          ${selection.blackbaudConstituentId},
          ${selection.name},
          ${normalizeConstituentName(selection.name)},
          NOW(),
          NOW()
        )
        RETURNING id, name, blackbaud_constituent_id
      `;
      constituent = inserted[0];
    }

    if (constituent?.id) {
      resolved.push({
        constituentId: Number(constituent.id),
        blackbaudConstituentId: String(constituent.blackbaud_constituent_id),
        name: constituent.name || selection.name,
        lookupId: selection.lookupId,
      });
    }
  }

  return resolved;
}

export async function replaceDiscussionConstituentLinks(discussionItemId, constituents) {
  await sql`
    DELETE FROM discussion_item_constituents
    WHERE discussion_item_id = ${discussionItemId}
  `;

  if (!constituents.length) return;
  const placeholders = constituents
    .map((_, index) => `($1, $${index * 2 + 2}, $${index * 2 + 3})`)
    .join(", ");
  const values = [discussionItemId];
  constituents.forEach((constituent, index) => {
    values.push(constituent.constituentId, index);
  });
  await sql(
    `INSERT INTO discussion_item_constituents (
       discussion_item_id,
       constituent_id,
       sort_order
     )
     VALUES ${placeholders}
     ON CONFLICT (discussion_item_id, constituent_id)
     DO UPDATE SET sort_order = EXCLUDED.sort_order`,
    values,
  );
}

export function groupDiscussionConstituents(rows) {
  return rows.reduce((grouped, row) => {
    const key = String(row.discussion_item_id);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({
      constituent_id: row.constituent_id,
      blackbaudConstituentId: row.blackbaud_constituent_id,
      name: row.name,
    });
    return grouped;
  }, {});
}
