import { createHash, randomUUID } from "node:crypto";
import sql from "./sql";
import { listError } from "./listConfigurations";
import {
  matchesListField,
  readMemberFields,
  validateMembershipValue,
  writeListMembership,
} from "./constituentListProvider";

export function membershipReceiptKey(origin, constituentId, source) {
  // A category-wide gate also protects overlapping category-only and value-filtered lists.
  const identity = [
    origin,
    constituentId,
    source.fieldCategory.trim().toLowerCase(),
  ];
  return `list-membership-v1:${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
}

export async function addListMember({
  user,
  origin,
  source,
  constituentId,
  value,
  verifyOnly = false,
  beforeWrite = async () => {},
}) {
  const key = membershipReceiptKey(origin, constituentId, source);
  const [receipt] =
    await sql`SELECT payload FROM report_snapshots_cache WHERE report_key = ${key}`;
  const fields = await readMemberFields({ user, origin, constituentId });
  const existing = fields.find((field) => matchesListField(field, source));
  if (existing)
    return {
      status: "already_present",
      customFieldId: String(existing.id),
      message:
        "Confirmed in NXT. The saved list may take about 30 minutes to reflect this membership; refresh later.",
    };
  const priorConfirmed =
    receipt?.payload?.value &&
    fields.some((field) =>
      matchesListField(field, {
        ...source,
        fieldDescription: receipt.payload.value,
      }),
    );
  if ((receipt && !priorConfirmed) || verifyOnly)
    return {
      status: "needs_verification",
      message:
        "No matching field was confirmed. This app will not resend a previous addition. Check the NXT record before making any manual changes.",
    };
  const writeValue = source.fieldDescription || value;
  if (
    typeof writeValue !== "string" ||
    !writeValue.trim() ||
    writeValue.length > 200
  )
    throw listError(
      "Enter a description/value to add to this category (200 characters or fewer).",
    );
  const verified = await validateMembershipValue({
    user,
    origin,
    source,
    value: writeValue.trim(),
  });
  await beforeWrite();
  const token = randomUUID();
  const claimed = await sql`
    INSERT INTO report_snapshots_cache (report_key, payload, updated_at)
    VALUES (${key}, ${JSON.stringify({ state: "sending", token, constituentId, source, value: verified.value, userId: user.id, startedAt: new Date().toISOString() })}::jsonb, NOW())
    ON CONFLICT (report_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    WHERE report_snapshots_cache.payload = ${JSON.stringify(priorConfirmed ? receipt.payload : null)}::jsonb
    RETURNING report_key
  `;
  if (!claimed.length)
    return {
      status: "needs_verification",
      message:
        "Another submission is already recorded. Check status; it will not be sent again.",
    };
  let customFieldId = null;
  try {
    // Never retry a create after an uncertain provider response.
    const created = await writeListMembership({
      user,
      origin,
      constituentId,
      ...verified,
    });
    customFieldId = created?.id ? String(created.id) : null;
    const confirmed = (
      await readMemberFields({ user, origin, constituentId })
    ).find((field) => matchesListField(field, source));
    const state = confirmed ? "confirmed" : "review";
    await sql`UPDATE report_snapshots_cache SET payload = payload || ${JSON.stringify({ state, customFieldId, checkedAt: new Date().toISOString() })}::jsonb, updated_at = NOW() WHERE report_key = ${key} AND payload->>'token' = ${token}`;
    return {
      status: confirmed ? "added" : "needs_verification",
      customFieldId,
      message: confirmed
        ? "Added and verified in NXT. List indexing may take about 30 minutes. Refresh the list later; no new constituent was created."
        : "NXT received the request, but membership is not yet verified. Check status or open NXT. This addition will not be resent.",
    };
  } catch {
    // The durable pre-write receipt remains even if the provider or this update fails.
    await sql`UPDATE report_snapshots_cache SET payload = payload || ${JSON.stringify({ state: "review", customFieldId })}::jsonb, updated_at = NOW() WHERE report_key = ${key} AND payload->>'token' = ${token}`.catch(
      () => {},
    );
    return {
      status: "needs_verification",
      customFieldId,
      message:
        "The addition could not be verified. Check status or open NXT before making changes. This app will not send the addition again.",
    };
  }
}
