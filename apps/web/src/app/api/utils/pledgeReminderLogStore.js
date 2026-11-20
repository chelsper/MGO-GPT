import { createHash, randomUUID } from "node:crypto";
import sql from "./sql";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const reminderEventKey = (origin, p, letterDate, view) => hash(["pledge-reminder:v1", origin, p.id, p.constituentId, view, p.dueDate, letterDate]);
export function publicReminderLog(row, viewerId) {
  if (!row) return null;
  const own = String(row.owner_id) === String(viewerId);
  return { id: own ? row.id : null, state: row.state, sentDate: String(row.sent_date).slice(0, 10),
    actionId: own ? row.action_id : null, otherStaff: !own, updatedAt: row.updated_at,
    message: row.state === "saved" ? "Staff-confirmed reminder sending recorded and verified in NXT. This is not proof of email delivery."
      : "This action may already be in NXT. Do not record it again. Reload saved status, then verify the existing action." };
}
export function createReminderLogStore(db = sql) {
  return {
    async prepare({ ownerId, origin, draft, email, letterDate, today, view, filename }) {
      const p = draft.pledge;
      const snapshot = { pledgeId: p.id, constituentId: p.constituentId, name: draft.fields.Addressee,
        lookupId: p.lookupId || p.id, funds: p.fundDescriptions, amountDueCents: p.amountDueCents,
        totalCents: p.totalCents, paidToDateCents: p.paidToDateCents, balanceCents: p.balanceCents,
        dueDate: p.dueDate, refreshedAt: p.refreshedAt, letterDate, preparedOn: today, view, email, filename };
      const eventKey = reminderEventKey(origin, p, letterDate, view);
      const fingerprint = hash([snapshot, draft.fields]);
      const [row] = await db`INSERT INTO pledge_reminder_snapshots(id, owner_id, origin, event_key, snapshot_hash, snapshot)
        VALUES(${randomUUID()}, ${ownerId}, ${origin}, ${eventKey}, ${fingerprint}, ${JSON.stringify(snapshot)}::jsonb)
        ON CONFLICT(owner_id, origin, event_key, snapshot_hash) DO UPDATE SET snapshot_hash = EXCLUDED.snapshot_hash
        RETURNING id, snapshot`;
      if (!row) throw new Error("Reminder snapshot was not saved");
      return { snapshotId: row.id, ...row.snapshot };
    },
    async read(id, ownerId, origin) {
      const [row] = await db`SELECT * FROM pledge_reminder_snapshots WHERE id = ${id} AND owner_id = ${ownerId} AND origin = ${origin}`;
      return row || null;
    },
    async list(ownerId, origin) {
      return db`SELECT id, snapshot, created_at FROM pledge_reminder_snapshots
        WHERE owner_id = ${ownerId} AND origin = ${origin} ORDER BY created_at DESC, id DESC LIMIT 50`;
    },
    async receipt(snapshot, sentDate = null) {
      const [row] = await db`SELECT *, sent_date::text AS sent_date, updated_at::text AS updated_at FROM pledge_reminder_logs
        WHERE origin = ${snapshot.origin} AND (event_key = ${snapshot.event_key}
          OR (pledge_id = ${snapshot.snapshot.pledgeId} AND (sent_date = ${sentDate}::date OR state IN ('processing','review'))))
        ORDER BY CASE WHEN event_key = ${snapshot.event_key} THEN 0 ELSE 1 END, created_at DESC LIMIT 1`;
      return row || null;
    },
    async claim(snapshot, sentDate, payload) {
      const [row] = await db`INSERT INTO pledge_reminder_logs(id, snapshot_id, owner_id, origin, event_key, pledge_id, constituent_id, sent_date, payload)
        VALUES(${randomUUID()}, ${snapshot.id}, ${snapshot.owner_id}, ${snapshot.origin}, ${snapshot.event_key},
          ${snapshot.snapshot.pledgeId}, ${snapshot.snapshot.constituentId}, ${sentDate}::date, ${JSON.stringify(payload)}::jsonb)
        ON CONFLICT DO NOTHING RETURNING *, sent_date::text AS sent_date, updated_at::text AS updated_at`;
      return row || null;
    },
    async checkpoint(id, actionId) {
      const [row] = await db`UPDATE pledge_reminder_logs SET action_id = ${actionId}, updated_at = NOW()
        WHERE id = ${id} AND state = 'processing' AND action_id IS NULL RETURNING id`;
      if (!row) throw new Error("Action checkpoint not confirmed");
    },
    async hold(id) {
      await db`UPDATE pledge_reminder_logs SET state = 'review', updated_at = NOW() WHERE id = ${id} AND state = 'processing'`;
    },
    async verify(receipt, actionId) {
      const [row] = await db`UPDATE pledge_reminder_logs SET state = 'saved', action_id = ${actionId}, verified_at = NOW(), updated_at = NOW()
        WHERE id = ${receipt.id} AND state = ${receipt.state} AND updated_at = ${receipt.updated_at}::timestamptz
          AND (action_id IS NULL OR action_id = ${actionId})
        RETURNING *, sent_date::text AS sent_date, updated_at::text AS updated_at`;
      if (!row) throw new Error("Saved receipt changed; reload status");
      return row;
    },
  };
}
