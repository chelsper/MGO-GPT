import { createHash } from "node:crypto";
import { calendarDate } from "@/utils/prospectActivity";

export const ORIGINATOR_CATEGORY = "Relationship Originator";
export const originatorKey = value => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
export const systemId = value => /^[1-9]\d*$/.test(String(value ?? "")) ? String(value) : null;
export class OriginatorError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}

export function originatorFields(fields) {
  return fields.filter(field => originatorKey(field.category) === originatorKey(ORIGINATOR_CATEGORY))
    .map(field => ({
      id: systemId(field.id),
      constituentId: systemId(field.parent_id || field.constituent_id),
      value: String(field.value ?? field.text_value ?? field.codetableentry_value ?? "").trim(),
      date: calendarDate(field.date) || null,
      comment: String(field.comment || ""),
    }));
}

export function originatorFingerprint(fields) {
  return createHash("sha256").update(JSON.stringify([...fields].sort((a, b) => String(a.id).localeCompare(String(b.id))))).digest("hex");
}

export function validateOriginDate(value, today) {
  const date = calendarDate(value);
  if (!date || date !== value || date > today) {
    throw new OriginatorError("Choose the date this relationship began, today or earlier.", 400);
  }
  return date;
}

export function originatorIdentityNames(fundraiser) {
  const first = String(fundraiser?.raw?.first || "").trim();
  const last = String(fundraiser?.raw?.last || "").trim();
  // Only structured names from the verified NXT record, never a fuzzy match
  // or an editable app display name, may explain an omitted middle name/title.
  return [...new Map([fundraiser?.name, first && last ? `${first} ${last}` : null]
    .filter(Boolean).map(name => [originatorKey(name), String(name).trim()])).values()];
}

export function originatorValuePayload(category, name, values = [], identityNames = []) {
  const type = originatorKey(category?.dataType).replace(/[^a-z]/g, "");
  if (type === "text" || type === "string") return { text_value: name };
  if (["table", "codetable", "codetableentry"].includes(type)) {
    const exact = values.filter(value => originatorKey(value) === originatorKey(name));
    const matches = exact.length ? exact : values.filter(value => identityNames.some(alias => originatorKey(alias) === originatorKey(value)));
    if (matches.length !== 1) throw new OriginatorError(`No unique Relationship Originator table entry matches the verified NXT name "${name}"${identityNames.length > 1 ? ` or "${identityNames[1]}"` : ""}. Ask an Admin to check the table. No update was submitted.`);
    return { codetableentry_value: matches[0] };
  }
  throw new OriginatorError("Relationship Originator must be a Text or Table custom field. Ask an Admin to check its NXT setup.");
}

export function matchesOriginatorChange(fields, receipt) {
  return fields.length === 1 && fields[0].id &&
    (!receipt.remote_field_id || fields[0].id === receipt.remote_field_id) &&
    fields[0].value === receipt.originator_name && fields[0].date === receipt.origin_date;
}

const receivedTypes = new Set(["cash", "donation", "paycash", "pledgepayment", "pledgepaycash",
  "matchinggiftpayment", "matchinggiftpaycash", "recurringgiftpayment", "recurringgiftpaycash",
  "stock", "soldstock", "other", "realizedplannedgiftrevenue"]);
const excludedTypes = new Set(["pledge", "matchinggiftpledge", "recurringgift", "plannedgift",
  "giftinkind", "writeoff", "adjustment", "eventregistrationfee"]);

// Direct received revenue only: soft credit and pledge balances are not added
// again. A malformed financial row makes the total unavailable, never zero.
export function originatorGiving(gifts, constituentId, originDate, periods) {
  const seen = new Map();
  let fiscalYearCents = 0, lifetimeCents = 0;
  for (const gift of gifts) {
    if (!systemId(gift?.constituent_id)) throw new OriginatorError("A gift's constituent system ID needs verification.");
    if (String(gift.constituent_id) !== constituentId) continue;
    if (["deleted", "cancelled", "canceled", "voided"].includes(originatorKey(gift.gift_status))) continue;
    const type = originatorKey(gift.type).replace(/[^a-z]/g, "");
    if (excludedTypes.has(type)) continue;
    const date = calendarDate(gift.date);
    const amount = gift.amount?.value ?? gift.amount;
    const giftId = systemId(gift.id);
    if (!giftId || !date || !receivedTypes.has(type) ||
        amount === null || amount === undefined || amount === "" || !Number.isFinite(Number(amount))) {
      throw new OriginatorError("Some gift details need verification before giving totals can be shown.");
    }
    const signature = JSON.stringify([date, Number(amount), type]);
    if (seen.has(giftId)) {
      if (seen.get(giftId) !== signature) throw new OriginatorError("Conflicting gift rows need verification.");
      continue;
    }
    seen.set(giftId, signature);
    if (date < originDate || date > periods.asOf) continue;
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(cents)) throw new OriginatorError("A gift amount needs verification.");
    lifetimeCents += cents;
    if (date >= periods.fiscalYear.startsOn) fiscalYearCents += cents;
  }
  return { fiscalYearGiving: fiscalYearCents / 100, lifetimeGiving: lifetimeCents / 100 };
}

export function resolveOriginators(fields, users, receipts, periods) {
  const grouped = new Map();
  for (const field of fields) {
    if (!field.constituentId || !field.id) throw new OriginatorError("NXT returned an originator without a system record ID.");
    const rows = grouped.get(field.constituentId) || new Map();
    if (rows.has(field.id) && originatorFingerprint([rows.get(field.id)]) !== originatorFingerprint([field])) {
      throw new OriginatorError("NXT returned conflicting originator rows. Refresh again later.");
    }
    rows.set(field.id, field);
    grouped.set(field.constituentId, rows);
  }
  const resolved = [], issues = [];
  for (const [constituentId, rows] of grouped) {
    const values = [...rows.values()];
    if (values.length !== 1) { issues.push({ constituentId, reason: "Multiple originator fields" }); continue; }
    const field = values[0];
    const receipt = receipts.find(row => row.constituent_id === constituentId && row.remote_field_id === field.id &&
      row.originator_name === field.value && row.origin_date === field.date && row.state === "confirmed");
    const matches = receipt ? users.filter(user => String(user.id) === String(receipt.owner_user_id)) :
      users.filter(user => user.nxtName && [user.nxtName, user.name, ...(user.nxtNames || [])].some(name => originatorKey(name) === originatorKey(field.value)));
    if (matches.length !== 1) { issues.push({ constituentId, reason: "Originator name needs an Admin match" }); continue; }
    if (!field.date || field.date > periods.asOf) { issues.push({ constituentId, reason: "Introduction date missing or in the future" }); continue; }
    resolved.push({ ...field, userId: String(matches[0].id) });
  }
  return { resolved, issues };
}
