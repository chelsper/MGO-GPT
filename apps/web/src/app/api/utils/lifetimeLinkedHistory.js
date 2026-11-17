import { lifetimeError } from "@/utils/lifetimeSocieties";
import { isDeepStrictEqual } from "node:util";
import { lifetimeDay } from "./lifetimeSocietyHistory";
import { directFlags, softFlags, analyzeLifetimeGifts } from "./lifetimeGiftReview";

const fail = message => { throw lifetimeError(message, 422); };
const check = (ok, message) => { if (!ok) fail(message); };
const id = value => { const text = String(value ?? ""); check(/^[1-9]\d{0,18}$/.test(text), "A linked NXT identifier is missing or invalid."); return text; };
const money = value => {
  check(typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)), "A linked gift amount needs review.");
  return Math.round(value * 100);
};
const sum = values => { const n = values.reduce((a, b) => a + BigInt(b), 0n); check(n <= BigInt(Number.MAX_SAFE_INTEGER) && n >= BigInt(Number.MIN_SAFE_INTEGER), "Linked gift totals exceed the reporting range."); return Number(n); };
const sorted = rows => rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const pledges = new Set(["Pledge", "MatchingGiftPledge"]);
const writeOffs = new Set(["PledgeWriteOff", "MatchingGiftWriteOff"]);
const payments = new Set(["Donation", "PledgePayment", "MatchingGiftPayment", "GiftInKind", "Stock", "SoldStock", "Other", "RecurringGiftPayment"]);
const supported = new Set([...pledges, ...writeOffs, ...payments]);
const giftPath = value => `/gift/v1/gifts/${id(value)}`;
const pledgePath = (value, kind) => `/gft-gifts/v2/gifts/${id(value)}/${kind}`;
const personPath = value => `/constituent/v1/constituents/${id(value)}`;
const keyType = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
const queryTypes = {
  Pledge: ["pledge"], MatchingGiftPledge: ["matchinggiftpledge"], PledgePayment: ["pledgepayment"],
  MatchingGiftPayment: ["matchinggiftpledgepayment", "matchinggiftpayment"], Donation: ["onetimegift", "cash"],
  PledgeWriteOff: ["writeoff"], MatchingGiftWriteOff: ["matchinggiftwriteoff"],
  Stock: ["stockproperty", "paystockproperty", "matchinggiftpaystockproperty"],
  SoldStock: ["stockpropertysold", "paystockpropertysold", "matchinggiftpaystockpropertysold"],
  GiftInKind: ["giftinkind", "paygiftinkind", "matchinggiftpaygiftinkind"],
  Other: ["other", "payother", "matchinggiftpayother"], RecurringGiftPayment: ["recurringgiftpayment"],
};
export const canCheckLifetimeGift = type => /pledge|payment|writeoff|^pay/.test(keyType(type));

function collection(raw, field, limit) {
  const rows = raw?.[field];
  check(Array.isArray(rows) && rows.length <= limit && !raw.next && !raw.next_link && !raw.nextLink &&
    (raw.count == null || Number(raw.count) === rows.length), "NXT returned an incomplete or oversized linked collection. Nothing was truncated.");
  return rows;
}
export function normalizeLifetimeRead(path, raw) {
  const expected = path.split("/").at(-1);
  if (path.startsWith("/constituent/")) {
    check(id(raw?.id) === expected && typeof raw.lookup_id === "string" && raw.lookup_id.length <= 100, "A linked recipient identity could not be verified.");
    return { id: expected, lookupId: raw.lookup_id };
  }
  if (path.startsWith("/gift/")) {
    check(id(raw?.id) === expected && supported.has(raw.type), "A linked gift type needs staff reconciliation.");
    const day = lifetimeDay(String(raw.date || ""));
    check(day, "A linked gift date needs review.");
    check(Array.isArray(raw.linked_gifts) && raw.linked_gifts.length <= 30 && Array.isArray(raw.soft_credits) && raw.soft_credits.length <= 100,
      "Linked gift or recipient details are incomplete or exceed the bounded check.");
    for (const key of ["adjustments", "amendments"]) check(!raw[key] || (Array.isArray(raw[key]) && raw[key].length === 0), "Historical gift adjustments need staff reconciliation.");
    const links = raw.linked_gifts.map(id);
    check(new Set(links).size === links.length && !links.includes(expected), "Duplicate or circular gift links need review.");
    return { id: expected, type: raw.type, day, cents: money(raw.amount?.value),
      balance: pledges.has(raw.type) ? money(raw.balance?.value) : null, owner: id(raw.constituent_id),
      links: links.sort(), modified: raw.date_modified || null,
      credits: sorted(raw.soft_credits.map(credit => {
        check(id(credit.gift_id) === expected, "A soft credit belongs to a different gift.");
        return { id: id(credit.id), person: id(credit.constituent_id), cents: money(credit.amount?.value) };
      })) };
  }
  const pledgeId = path.split("/").at(-2);
  check(id(raw?.pledge_id) === pledgeId, "NXT returned evidence for a different pledge.");
  if (expected === "installments") return { pledgeId,
    rows: sorted(collection(raw, "installments", 1000).map(row => ({ id: id(row.id), cents: money(row.amount?.value), balance: money(row.balance), day: lifetimeDay(String(row.date || "")) }))) };
  check(expected === "pledgepayments", "Unknown linked-history read.");
  return { pledgeId, rows: sorted(collection(raw, "pledge_payments", 1000).map(row => ({ installmentId: id(row.installment_id), giftId: id(row.payment_gift_id), cents: money(row.amount_applied?.value) }))) };
}

export function newLifetimeCheck(seed, now = new Date()) {
  return { seed: id(seed), startedAt: now.toISOString(), stage: "collect", reads: 0, queue: [giftPath(seed)], data: {}, verifyIndex: 0 };
}
// One checkpoint performs one GET. No query execution, identity search, or
// provider writes are permitted, including when continuing a saved check.
export async function advanceLifetimeCheck(previous, history, read, now = new Date()) {
  const job = structuredClone(previous);
  check(now.getTime() - Date.parse(job.startedAt) < 30 * 60 * 1000, "This linked-history check expired. Start a fresh check; confirmed dates stay locked.");
  check(job.reads < 300 && ["collect", "verify"].includes(job.stage), "This linked-history check reached its safe limit. Ask Advancement Services to review it.");
  const add = path => { if (!job.queue.includes(path)) job.queue.push(path); };
  const path = job.stage === "verify" ? job.queue[job.verifyIndex] : job.queue.find(path => !job.data[path]);
  check(/^\/(gift\/v1\/gifts\/\d+|gft-gifts\/v2\/gifts\/\d+\/(installments|pledgepayments)|constituent\/v1\/constituents\/\d+)$/.test(path), "Unknown linked-history checkpoint.");
  const value = normalizeLifetimeRead(path, await read(path)); job.reads++;
  if (job.stage === "verify") {
    // JSONB can reorder object keys between checkpoints without changing evidence.
    check(isDeepStrictEqual(value, job.data[path]), "NXT records changed during this check. Start a fresh check; unconfirmed dates need review.");
    job.verifyIndex++;
    if (job.verifyIndex === job.queue.length) { job.stage = "complete"; job.checkedAt = now.toISOString(); }
    return job;
  }
  job.data[path] = value;
  if (path.startsWith("/gift/")) {
    if (pledges.has(value.type)) { add(pledgePath(value.id, "installments")); add(pledgePath(value.id, "pledgepayments")); }
    // A matching pledge also links the original donor gift. It is inspected,
    // but only installment applications establish amounts against a pledge.
    for (const link of value.links) add(giftPath(link));
    for (const event of history.filter(event => event.giftId === value.id)) {
      if (directFlags.has(event.credit)) add(personPath(value.owner));
      if (softFlags.has(event.credit)) for (const credit of value.credits) add(personPath(credit.person));
    }
  } else if (path.endsWith("/pledgepayments")) for (const row of value.rows) add(giftPath(row.giftId));
  check(job.queue.filter(path => path.startsWith("/gift/")).length <= 80 && job.queue.length <= 150,
    "This connected gift history exceeds the bounded check. Nothing was truncated; staff review is needed.");
  if (job.queue.every(path => job.data[path])) { job.stage = "verify"; job.verifyIndex = 0; }
  return job;
}

export function reconcileLifetimeGraph(history, job, { sources, fullRecognition, today }) {
  check(job.stage === "complete", "Linked history is not completely verified.");
  const gifts = Object.fromEntries(Object.entries(job.data).filter(([path]) => path.startsWith("/gift/")).map(([, g]) => [g.id, g]));
  const commitments = Object.values(gifts).filter(g => pledges.has(g.type));
  check(commitments.length > 0 && commitments.length <= 12, "No bounded pledge application history was found for this gift.");
  const byGift = new Map(), allocations = [], recognized = new Set();
  const relevant = new Set(commitments.map(g => g.id));
  for (const pledge of commitments) {
    const installments = job.data[pledgePath(pledge.id, "installments")]?.rows;
    const applications = job.data[pledgePath(pledge.id, "pledgepayments")]?.rows;
    check(Array.isArray(installments) && installments.length > 0 && Array.isArray(applications), "The pledge's application history is incomplete.");
    check(new Set(installments.map(i => i.id)).size === installments.length && new Set(applications.map(a => `${a.installmentId}:${a.giftId}`)).size === applications.length,
      "Duplicate installment applications need review.");
    check(sum(installments.map(i => i.cents)) === pledge.cents && sum(installments.map(i => i.balance)) === pledge.balance &&
      installments.every(i => i.day && i.balance <= i.cents && sum(applications.filter(a => a.installmentId === i.id).map(a => a.cents)) + i.balance === i.cents),
      "Payments, write-offs and balances do not reconcile to this pledge.");
    for (const application of applications) {
      const gift = gifts[application.giftId];
      check(installments.some(i => i.id === application.installmentId) && gift && (payments.has(gift.type) || writeOffs.has(gift.type)) && gift.links.includes(pledge.id),
        "A payment or write-off is not verifiably applied to this pledge.");
      check(!writeOffs.has(gift.type) || gift.day >= pledge.day, "A write-off predates its pledge and needs staff review.");
      relevant.add(gift.id); allocations.push({ pledgeId: pledge.id, giftId: gift.id, cents: application.cents });
    }
  }
  // Original donor gifts linked to a match can contribute independently. They
  // still need the same amount, date and recipient validation as applications.
  for (const event of history) if (gifts[event.giftId]) relevant.add(event.giftId);
  for (const giftId of relevant) {
    const gift = gifts[giftId];
    check(gift.day <= today, "A linked transaction is later than this saved report. Refresh gift history before checking it.");
    const applied = sum(allocations.filter(a => a.giftId === giftId).map(a => a.cents));
    check(applied <= gift.cents && (!writeOffs.has(gift.type) || applied === gift.cents), "Applications exceed the gift amount or leave an unexplained write-off.");
    // A reciprocal original-donation/matching-pledge link is not a payment.
    // All other pledge links require an exact installment application.
    if (!pledges.has(gift.type)) check(gift.links.filter(link => pledges.has(gifts[link]?.type)).every(link =>
      allocations.some(a => a.giftId === giftId && a.pledgeId === link) ||
      (gift.type === "Donation" && gifts[link].type === "MatchingGiftPledge" && gifts[link].links.includes(giftId))),
      "A linked pledge has no verified application amount.");
  }
  for (const event of history) {
    if (!relevant.has(event.giftId)) continue;
    if (!byGift.has(event.giftId)) byGift.set(event.giftId, []);
    byGift.get(event.giftId).push(event);
    if (!(directFlags.has(event.credit) || (softFlags.has(event.credit) && sources.includes("recognition_credit") && fullRecognition))) continue;
    const gift = gifts[event.giftId];
    check(!event.conflict && event.day === gift.day && event.cents === gift.cents && queryTypes[gift.type].includes(keyType(event.type)),
      "Saved query amounts, dates or types differ from the linked NXT records. Refresh gift history before continuing.");
    const candidates = directFlags.has(event.credit) ? [gift.owner] : gift.credits.map(c => c.person);
    check(Array.isArray(event.recipientIds) && event.recipientIds.length > 0, "The saved recipient credit has no verified identity.");
    for (const recipient of event.recipientIds) {
      const [mode, value] = JSON.parse(recipient);
      check(candidates.some(personId => {
        const person = job.data[personPath(personId)];
        return person && (mode === "system" ? person.id === value : mode === "lookup" && person.lookupId === value);
      }), "The saved recipient credit does not match NXT. No credit was inferred or backdated.");
    }
    recognized.add(gift.id);
  }
  const resolved = new Map();
  for (const giftId of relevant) {
    const gift = gifts[giftId], own = recognized.has(giftId);
    let cents = 0;
    if (pledges.has(gift.type) && own) cents = gift.cents - sum(allocations.filter(a => a.pledgeId === giftId &&
      !writeOffs.has(gifts[a.giftId].type) && recognized.has(a.giftId) && gifts[a.giftId].day < gift.day).map(a => a.cents));
    else if (writeOffs.has(gift.type)) cents = -sum(allocations.filter(a => a.giftId === giftId && recognized.has(a.pledgeId)).map(a => a.cents));
    else if (own) cents = gift.cents - sum(allocations.filter(a => a.giftId === giftId && recognized.has(a.pledgeId) && gifts[a.pledgeId].day <= gift.day).map(a => a.cents));
    check(Number.isSafeInteger(cents) && (writeOffs.has(gift.type) || cents >= 0), "Recognition amounts could not be reconciled safely.");
    if (byGift.has(giftId) || cents !== 0) resolved.set(giftId, { giftId, day: gift.day, cents, type: gift.type,
      derived: !byGift.has(giftId), credit: "Verified linked history", recipientIds: [],
      note: writeOffs.has(gift.type) ? "Verified dated reduction of a credited pledge; not cash received."
        : pledges.has(gift.type) ? "Only the new commitment is added on the pledge date. Earlier credited payments keep their original dates."
          : "Only recognition not already represented by a credited pledge is added. Original donor gifts remain separate." });
  }
  return { resolved, relevant: [...relevant] };
}

export function analyzeReconciledLifetime(history, options, checks = [], blockedChecks = []) {
  const events = [...history], base = analyzeLifetimeGifts(events, options), overrides = new Map(), issues = [];
  const blocked = new Map();
  const block = (giftIds, reason) => {
    issues.push(reason);
    for (const giftId of giftIds) blocked.set(giftId, reason);
  };
  for (const entry of blockedChecks) block(entry.giftIds || [entry.seed], entry.reason);
  for (const job of checks) {
    try {
      const { resolved } = reconcileLifetimeGraph(events, job, options);
      check([...resolved.keys()].every(giftId => !overrides.has(giftId)), "Overlapping saved reconciliations need a fresh check.");
      for (const [giftId, value] of resolved) overrides.set(giftId, value);
    } catch (error) { block(Object.keys(job.data).filter(path => path.startsWith("/gift/")).map(path => path.split("/").at(-1)),
      error.lifetimeSafe ? error.message : "Saved linked history needs staff review."); }
  }
  const supportedEvents = [], items = base.items.map(item => {
    if (blocked.has(item.giftId)) return { ...item, outcome: "review", reasons: [...new Set([...item.reasons, blocked.get(item.giftId)])] };
    const resolved = overrides.get(item.giftId);
    const otherReasons = item.reasons.filter(reason => !reason.includes("complex gifts need linked history"));
    if (!resolved || otherReasons.length || (item.outcome === "excluded" && resolved.cents >= 0)) {
      if (item.outcome === "counted") supportedEvents.push(base.supportedEvents.find(e => e.giftId === item.giftId));
      return item;
    }
    supportedEvents.push(resolved);
    return { ...item, outcome: "counted", reasons: [], reconciledCents: resolved.cents, notes: [...item.notes, resolved.note] };
  });
  for (const resolved of overrides.values()) if (resolved.derived && resolved.cents && !blocked.has(resolved.giftId)) {
    supportedEvents.push(resolved);
    items.push({ ...resolved, outcome: "counted", reconciledCents: resolved.cents, crossingGift: false, credits: [], reasons: [], notes: [resolved.note] });
  }
  return { items, supportedEvents, reasons: [...new Set([...issues, ...items.flatMap(item => item.reasons)])] };
}

export function summarizeReconciledLifetime(analysis, thresholdCents, skipDate = false) {
  const reasons = [...analysis.reasons], daily = new Map();
  for (const event of analysis.supportedEvents) {
    const value = daily.get(event.day) || { values: [], ids: [] };
    value.values.push(event.cents); value.ids.push(event.giftId); daily.set(event.day, value);
  }
  const supportedCents = sum(analysis.supportedEvents.map(event => event.cents));
  let total = 0, date = null, crossingGiftIds = [], fellBelow = false;
  if (!reasons.length && !skipDate) for (const [day, value] of [...daily].sort(([a], [b]) => a.localeCompare(b))) {
    total = sum([total, ...value.values]);
    if (!date && total >= thresholdCents) { date = day; crossingGiftIds = [...new Set(value.ids)].sort(); }
    if (date && total < thresholdCents) fellBelow = true;
  }
  if (!reasons.length && !skipDate) {
    if (fellBelow) reasons.push("A later reduction brought giving below this threshold. Staff must review the unconfirmed entry date.");
    else if (!date) reasons.push("The available history does not demonstrate this milestone; it is not proof of ineligibility.");
  }
  return { supportedCents: analysis.reasons.some(reason => /conflict/i.test(reason)) ? null : supportedCents, totalCents: analysis.reasons.length ? null : supportedCents,
    date: reasons.length ? null : date, crossingGiftIds: reasons.length ? [] : crossingGiftIds,
    status: date && !reasons.length ? "provisional" : "review", reasons, calculationSkipped: skipDate };
}
