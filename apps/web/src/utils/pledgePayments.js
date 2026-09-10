import { calendarDate } from "./prospectActivity";
import { getStandingsPeriods } from "./standingsPeriods";

export function pledgeDataError(code = "invalid_response") {
  const error = new Error("Pledge data could not be verified.");
  error.pledgeCode = code;
  return error;
}

export function moneyCents(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw pledgeDataError("invalid_amount");
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) throw pledgeDataError("invalid_amount");
  return cents;
}

export function pledgeId(value) {
  const id = String(value ?? "");
  if (!/^\d+$/.test(id)) throw pledgeDataError("invalid_id");
  return id;
}

export function normalizePledge(gift, expectedId) {
  if (pledgeId(gift?.id) !== expectedId || gift.type !== "Pledge") throw pledgeDataError("not_a_pledge");
  const totalCents = moneyCents(gift.amount?.value);
  const balanceCents = moneyCents(gift.balance?.value);
  if (balanceCents > totalCents) throw pledgeDataError("balance_mismatch");
  return { id: expectedId, constituentId: pledgeId(gift.constituent_id),
    lookupId: typeof gift.lookup_id === "string" ? gift.lookup_id : expectedId, totalCents, balanceCents };
}

export function normalizeInstallments(response, pledge) {
  if (!Array.isArray(response?.installments) || (response.pledge_id != null && String(response.pledge_id) !== pledge.id)) throw pledgeDataError();
  const ids = new Set();
  const installments = response.installments.map((entry) => {
    const id = pledgeId(entry?.id);
    const date = calendarDate(entry.date);
    if (ids.has(id) || !date) throw pledgeDataError("invalid_schedule");
    ids.add(id);
    const amountCents = moneyCents(entry.amount?.value);
    const balanceCents = moneyCents(entry.balance);
    if (balanceCents > amountCents) throw pledgeDataError("balance_mismatch");
    return { id, date, amountCents, balanceCents };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  // A truncated or changing schedule must not masquerade as the full amount due.
  if (installments.reduce((sum, entry) => sum + entry.balanceCents, 0) !== pledge.balanceCents) throw pledgeDataError("balance_mismatch");
  return installments;
}

export function normalizeApplications(response, pledgeIdValue, installments) {
  if (!Array.isArray(response?.pledge_payments) || (response.pledge_id != null && String(response.pledge_id) !== pledgeIdValue)) throw pledgeDataError();
  const ids = new Set(installments.map((entry) => entry.id));
  const seen = new Set();
  return response.pledge_payments.map((entry) => {
    const installmentId = pledgeId(entry?.installment_id);
    const giftId = pledgeId(entry.payment_gift_id);
    const key = `${installmentId}:${giftId}`;
    if (!ids.has(installmentId) || seen.has(key)) throw pledgeDataError("ambiguous_payment_application");
    seen.add(key);
    return { installmentId, giftId, amountCents: moneyCents(entry.amount_applied?.value) };
  });
}

const PAYMENT_TYPES = new Set(["Donation", "GiftInKind", "PledgePayment", "RecurringGiftPayment", "Stock", "SoldStock", "Other", "MatchingGiftPayment"]);
export function normalizePaymentGift(gift, expectedId) {
  if (pledgeId(gift?.id) !== expectedId) throw pledgeDataError();
  const date = calendarDate(gift.date);
  if (!date || !PAYMENT_TYPES.has(gift.type)) throw pledgeDataError("unverified_payment_type");
  // Only positively identified payment gifts count as paid. Unknown types,
  // including write-offs, require review rather than a guessed paid amount.
  return { id: expectedId, date };
}

export function finishPledge(draft, now = new Date()) {
  const payments = draft.applications.map((application) => {
    const payment = draft.paymentGifts[application.giftId];
    if (!payment) throw pledgeDataError("missing_payment_detail");
    return { ...application, date: payment.date };
  });
  const paidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  if (paidCents + draft.gift.balanceCents > draft.gift.totalCents) throw pledgeDataError("balance_mismatch");
  if (!draft.name?.trim()) throw pledgeDataError("missing_identity");
  return { ...draft.gift, name: draft.name, installments: draft.installments, payments,
    refreshedAt: now.toISOString() };
}

export function pledgeWorklist(records, today = getStandingsPeriods().asOf) {
  const pastDue = [];
  const upcoming = [];
  for (const record of records) {
    const outstanding = record.installments.filter((entry) => entry.balanceCents > 0);
    const overdue = outstanding.filter((entry) => entry.date < today);
    const dueToday = outstanding.filter((entry) => entry.date === today);
    const due = [...overdue, ...dueToday];
    const future = outstanding.filter((entry) => entry.date > today);
    const row = { ...record, pastDueCount: overdue.length, dueTodayCount: dueToday.length,
      currentlyDueCents: due.reduce((sum, entry) => sum + entry.balanceCents, 0),
      paidToDateCents: record.payments.filter((p) => p.date <= today).reduce((sum, p) => sum + p.amountCents, 0) };
    if (due.length) pastDue.push({ ...row, dueDate: due[0].date, amountDueCents: row.currentlyDueCents });
    if (future.length) upcoming.push({ ...row, dueDate: future[0].date,
      amountDueCents: future.filter((entry) => entry.date === future[0].date).reduce((sum, entry) => sum + entry.balanceCents, 0) });
  }
  const order = (a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  return { pastDue: pastDue.sort(order), upcoming: upcoming.sort(order) };
}
