import sql from "./sql";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { writeGiftStock } from "./stewardshipStock";
import {
  inventoryId,
  inventoryNameKey,
  JU_GIFT_STARTERS,
  validateInventoryCommand,
} from "@/utils/stewardshipInventory";

const allowed = (actor) =>
  actor?.id && actor.active !== false && isReviewerRole(actor.role);
const serialize = (row) => ({
  ...row,
  id: String(row.id),
  version: Number(row.version),
});

export async function readGiftInventory(actor, db = sql) {
  if (!allowed(actor)) return null;
  const rows = await db`SELECT i.* FROM stewardship_gift_items i
    JOIN users actor ON actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
    ORDER BY lower(i.name), i.id`;
  return rows.map(serialize);
}

export async function readGiftItemHistory(actor, id, db = sql) {
  if (!allowed(actor) || !inventoryId(id)) return null;
  return db`SELECT e.operation,e.actor_name,e.created_at,e.snapshot,e.version FROM stewardship_gift_item_events e
    JOIN users actor ON actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
    WHERE e.item_id=${id} ORDER BY e.version DESC LIMIT 50`;
}

export async function writeGiftInventory(actor, body, db = sql) {
  const command = validateInventoryCommand(body);
  if (!allowed(actor) || !command) return null;
  if (command.operation === "stock") return (await writeGiftStock(actor, command, db))?.map(serialize) || null;
  const { operation } = command;
  // Serialize catalog writes and actor permission changes. Every write and audit
  // commit together; importing again never changes an existing or archived item.
  const locks = [
    db`SELECT pg_advisory_xact_lock(734019,97)`,
    db`SELECT id FROM users WHERE id=${actor.id} FOR UPDATE`,
  ];
  let query;
  if (operation === "create" || operation === "import") {
    const items =
      operation === "import"
        ? JU_GIFT_STARTERS.filter((item) =>
            command.keys.includes(item.key),
          ).map((item) => ({
            name: item.name,
            name_key: inventoryNameKey(item.name),
            description: "",
            location: "",
            availability: "unknown",
            source_key: item.key,
            source_label: item.name,
          }))
        : [
            {
              name: command.name,
              name_key: inventoryNameKey(command.name),
              description: command.description,
              location: command.location,
              availability: command.availability,
              source_key: `manual:${command.requestId}`,
              source_label: "Added in app",
            },
          ];
    query = db`WITH inserted AS (
      INSERT INTO stewardship_gift_items(name,name_key,description,location,availability,source_key,source_label)
      SELECT input.name,input.name_key,input.description,input.location,input.availability,input.source_key,input.source_label
      FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS input(name text,name_key text,description text,location text,availability text,source_key text,source_label text)
      JOIN users actor ON actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
      ON CONFLICT DO NOTHING RETURNING *
    ), audited AS (
      INSERT INTO stewardship_gift_item_events(item_id,actor_user_id,actor_name,operation,snapshot,version)
      SELECT i.id,actor.id,actor.name,${operation},to_jsonb(i),i.version FROM inserted i JOIN users actor ON actor.id=${actor.id} RETURNING id
    ) SELECT * FROM inserted`;
  } else {
    query = db`WITH updated AS (
      UPDATE stewardship_gift_items i SET
        name=CASE WHEN ${operation}='update' THEN ${command.name ?? ""} ELSE i.name END,
        name_key=CASE WHEN ${operation}='update' THEN ${command.name ? inventoryNameKey(command.name) : ""} ELSE i.name_key END,
        description=CASE WHEN ${operation}='update' THEN ${command.description ?? ""} ELSE i.description END,
        location=CASE WHEN ${operation}='update' THEN ${command.location ?? ""} ELSE i.location END,
        availability=CASE WHEN ${operation}='restore' THEN 'unknown' WHEN ${operation}='update' THEN ${command.availability ?? "unknown"} ELSE i.availability END,
        archived_at=CASE WHEN ${operation}='archive' THEN NOW() WHEN ${operation}='restore' THEN NULL ELSE i.archived_at END,
        archive_reason=CASE WHEN ${operation}='archive' THEN ${command.reason ?? ""} WHEN ${operation}='restore' THEN '' ELSE i.archive_reason END,
        version=i.version+1,updated_at=NOW()
      FROM users actor WHERE i.id=${command.id} AND i.version=${command.version}
        AND actor.id=${actor.id} AND actor.role=${actor.role} AND actor.active IS NOT FALSE
        AND ((${operation}='restore' AND i.archived_at IS NOT NULL) OR (${operation} IN ('update','archive') AND i.archived_at IS NULL))
      RETURNING i.*
    ), audited AS (
      INSERT INTO stewardship_gift_item_events(item_id,actor_user_id,actor_name,operation,snapshot,version)
      SELECT i.id,actor.id,actor.name,${operation},to_jsonb(i),i.version FROM updated i JOIN users actor ON actor.id=${actor.id} RETURNING id
    ) SELECT * FROM updated`;
  }
  const results = await db.transaction([...locks, query]);
  return results.at(-1).map(serialize);
}
