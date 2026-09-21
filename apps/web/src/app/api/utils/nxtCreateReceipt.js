import { createHash } from "node:crypto";
import sql from "@/app/api/utils/sql";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
    .filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}
export const createFingerprint = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const id = value => /^[1-9]\d*$/.test(String(value || "")) ? String(value) : null;
export const remoteCreateId = (kind, result) => {
  const record = result?.value && !Array.isArray(result.value) ? result.value : result;
  return id(record?.id || (kind === "action" ? record?.action_id || record?.constituent_action_id : record?.opportunity_id));
};

export function publicCreateReceipt(row) {
  return { id: String(row.id), kind: row.kind, state: row.state, constituentId: row.constituent_id,
    remoteId: row.remote_id || null, createdAt: row.created_at, verifiedAt: row.verified_at || null,
    title: row.payload?.summary || row.payload?.name || "NXT submission" };
}

export function nxtCreateFailure(error, receipt) {
  const saved = error?.writeReceipt || receipt;
  if (!saved) return null;
  const finished = ["complete", "verified"].includes(saved.state);
  return Response.json({
    error: `NXT submission ${saved.id} is protected against resending. ${finished
      ? "This submission already reached NXT."
      : "It may already be in NXT; do not submit it again or change the form to retry."} Open Saved NXT submissions to check the existing record. Verification will not resend it or repeat app updates.`,
    writeReceipt: publicCreateReceipt(saved),
  }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
}

// The two immutable fingerprints protect both form resubmission and identical
// provider payloads. A separate partial unique index blocks edited resubmissions
// for the same constituent while a result is unresolved. There is no lease expiry.
export async function guardedNxtCreate({ ownerUserId, enteredByUserId, kind, source, requestData, payload, create, onReceipt }) {
  if (!["action", "opportunity"].includes(kind) || !id(payload?.constituent_id)) throw new Error("A constituent system ID is required before creating in NXT.");
  await ensureAppSchema();
  const constituentId = String(payload.constituent_id);
  const requestHash = createFingerprint({ source, requestData });
  const payloadHash = createFingerprint(payload);
  const [receipt] = await sql`
    INSERT INTO nxt_create_receipts (owner_user_id, entered_by_user_id, kind, constituent_id, request_hash, payload_hash, payload)
    VALUES (${ownerUserId}, ${enteredByUserId}, ${kind}, ${constituentId}, ${requestHash}, ${payloadHash}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT DO NOTHING RETURNING *
  `;
  if (!receipt) {
    const [previous] = await sql`
      SELECT * FROM nxt_create_receipts WHERE owner_user_id = ${ownerUserId} AND kind = ${kind}
        AND (request_hash = ${requestHash} OR payload_hash = ${payloadHash}
          OR (constituent_id = ${constituentId} AND state IN ('processing', 'review', 'created')))
      ORDER BY created_at DESC LIMIT 1
    `;
    if (!previous) throw new Error("Could not confirm the submission claim. No NXT create was sent.");
    throw Object.assign(new Error("NXT submission already claimed"), { writeReceipt: previous });
  }
  onReceipt(receipt);
  try {
    const result = await create();
    const remoteId = remoteCreateId(kind, result);
    if (!remoteId) throw new Error("NXT did not return a record ID");
    const [saved] = await sql`
      UPDATE nxt_create_receipts SET state = 'created', remote_id = ${remoteId}, updated_at = NOW()
      WHERE id = ${receipt.id} AND state = 'processing' RETURNING *
    `;
    if (!saved) throw new Error("The NXT record ID could not be checkpointed");
    onReceipt(saved);
    // Legacy callers use .id even when the provider wraps the returned ID.
    return { ...result, id: remoteId };
  } catch (error) {
    // Even a 4xx or a connection error is held conservatively. No automatic
    // unlock can prove that the provider did not accept a create.
    await sql`UPDATE nxt_create_receipts SET state = 'review', updated_at = NOW()
      WHERE id = ${receipt.id} AND state = 'processing'`.catch(() => {});
    throw Object.assign(new Error("NXT create needs verification"), { writeReceipt: receipt });
  }
}

export async function completeNxtCreateReceipt(receipt) {
  if (!receipt) return;
  const rows = await sql`UPDATE nxt_create_receipts SET state = 'complete', updated_at = NOW()
    WHERE id = ${receipt.id} AND state = 'created' RETURNING id`;
  if (!rows.length) throw Object.assign(new Error("The app completion receipt could not be saved"), { writeReceipt: receipt });
}
