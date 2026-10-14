import { campaignCents, campaignError, campaignId, campaignGiftTypeKey } from "@/utils/campaignPriorities";
import { proportionalCampaignCents } from "./campaignPrioritySplits";

const MAX_INSTALLMENTS = 5000, MAX_APPLICATIONS = 10000;
const payments = new Set(["Donation", "PledgePayment", "MatchingGiftPayment", "GiftInKind", "Stock", "SoldStock", "Other", "RecurringGiftPayment"]);
const writeOffs = new Set(["PledgeWriteOff", "MatchingGiftWriteOff"]);
const fail = (id, reason) => { throw campaignError(`Pledge ${id}: ${reason} Saved campaign totals are unchanged.`); };
const cents = value => {
  const result = campaignCents(value);
  if (result < 0) throw campaignError("NXT returned a negative pledge amount. No new campaign totals were published.");
  return result;
};
const sum = values => {
  const result = values.reduce((a,b) => a+BigInt(b),0n);
  if (result > 100000000000000n) throw campaignError("The pledge exceeds the exact-amount limit.");
  return Number(result);
};
// JSONB checkpoints do not preserve object-key order.
const snapshot = value => JSON.stringify(value, (_, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item);
function completeCollection(response, items, limit, id) {
  if (!Array.isArray(items) || items.length > limit || response?.next_link || response?.nextLink || response?.next ||
      (response?.count != null && Number(response.count) !== items.length)) fail(id,"NXT returned an incomplete or oversized collection.");
}

export function campaignPledgeGift(gift, id) {
  if (campaignId(gift?.id) !== id || !["Pledge", "MatchingGiftPledge"].includes(gift.type)) fail(id,"The gift is not the expected pledge.");
  const amount = cents(gift.amount?.value), balance = cents(gift.balance?.value);
  const splits = gift.gift_splits;
  if (balance > amount || !Array.isArray(splits) || !splits.length || splits.length > 100) fail(id,"The pledge amount, balance or fund allocations need review.");
  const allocations = splits.map(s => ({ splitId: campaignId(s?.id), fundId: campaignId(s?.fund_id), amountCents: cents(s?.amount?.value) }));
  if (allocations.some(s=>!s.splitId || !s.fundId) || new Set(allocations.map(s=>s.splitId)).size !== allocations.length || sum(allocations.map(s=>s.amountCents)) !== amount)
    fail(id,"The fund allocations do not reconcile to the full pledge.");
  return { id, type: gift.type, amount, balance, allocations: allocations.sort((a,b)=>a.splitId.localeCompare(b.splitId)), modified: gift.date_modified || null };
}

function installmentsFor(response, gift) {
  completeCollection(response,response?.installments,MAX_INSTALLMENTS,gift.id);
  const rows = response.installments.map(i => ({ id: campaignId(i?.id), amount: cents(i?.amount?.value), balance: cents(i?.balance) }));
  if (rows.some(i=>!i.id || i.balance>i.amount) || new Set(rows.map(i=>i.id)).size!==rows.length ||
      sum(rows.map(i=>i.amount))!==gift.amount || sum(rows.map(i=>i.balance))!==gift.balance) fail(gift.id,"The installments do not reconcile to the pledge amount and balance.");
  return rows;
}

function applicationsFor(response, gift, installments) {
  if (String(response?.pledge_id)!==gift.id) fail(gift.id,"NXT returned applications for a different pledge.");
  completeCollection(response,response?.pledge_payments,MAX_APPLICATIONS,gift.id);
  const rows = response.pledge_payments.map(a => ({ installmentId: campaignId(a?.installment_id), giftId: campaignId(a?.payment_gift_id), amount: cents(a?.amount_applied?.value) }));
  const validIds = new Set(installments.map(i=>i.id));
  if (rows.some(a=>!a.giftId || a.giftId===gift.id || !validIds.has(a.installmentId)) ||
      new Set(rows.map(a=>`${a.installmentId}:${a.giftId}`)).size !== rows.length) fail(gift.id,"Duplicate or unlinked installment applications need review.");
  const applied = new Map();
  for (const a of rows) applied.set(a.installmentId,(applied.get(a.installmentId)||0n)+BigInt(a.amount));
  if (installments.some(i=>(applied.get(i.id)||0n)+BigInt(i.balance)!==BigInt(i.amount))) fail(gift.id,"Payments, write-offs and remaining balances do not fully reconcile by installment.");
  return rows.sort((a,b)=>`${a.installmentId}:${a.giftId}`.localeCompare(`${b.installmentId}:${b.giftId}`));
}

function paymentFor(detail, id, pledgeId) {
  if (campaignId(detail?.id)!==id || ![...payments,...writeOffs].includes(detail.type) ||
      !Array.isArray(detail.linked_gifts) || !detail.linked_gifts.map(String).includes(pledgeId)) fail(pledgeId,`Linked gift ${id} is missing, has an unsupported type, or is not linked to this pledge.`);
  return { id, type: detail.type, amount: cents(detail.amount?.value), date: detail.date || null };
}

export function campaignPledgeResult(draft) {
  const { gift, applications, details } = draft;
  const applied = new Map();
  for (const a of applications) applied.set(a.giftId,(applied.get(a.giftId)||0n)+BigInt(a.amount));
  let writtenOff = 0n, paid = 0n;
  const evidence = [];
  for (const [id, amount] of applied) {
    const detail = details[id];
    if (!detail || amount > BigInt(detail.amount)) fail(gift.id,`Applications exceed linked gift ${id}'s amount.`);
    if (writeOffs.has(detail.type)) writtenOff += amount;
    else if (payments.has(detail.type)) paid += amount;
    else fail(gift.id,`Linked gift ${id} cannot be classified safely.`);
    evidence.push({ giftId:id,type:detail.type,date:detail.date,appliedCents:Number(amount) });
  }
  if (writtenOff+paid+BigInt(gift.balance)!==BigInt(gift.amount)) fail(gift.id,"The original amount, payments, write-offs and balance do not reconcile.");
  return { pledgeId:gift.id,originalCents:gift.amount,writeOffCents:Number(writtenOff),balanceCents:gift.balance,paidCents:Number(paid),evidence };
}

// Each checkpoint performs at most one read. Even a payment-heavy pledge can
// resume without replaying its successful linked-gift reads.
export async function advanceCampaignPledge(check, transport) {
  const id = check.gift_id, draft = structuredClone(check.draft || {});
  let stage = check.stage;
  if (stage === "gift") {
    draft.gift = campaignPledgeGift(await transport.gift(id),id);
    if (draft.gift.type === "MatchingGiftPledge") fail(id,"NXT's pledge-installment API does not support matching-gift pledges. A verified matching-gift write-off source is required; a zero balance does not prove payment.");
    stage = "installments";
  }
  else if (stage === "installments") { draft.installments = installmentsFor(await transport.pledge(id,"installments"),draft.gift); stage = "applications"; }
  else if (stage === "applications") { draft.applications = applicationsFor(await transport.pledge(id,"pledgepayments"),draft.gift,draft.installments); draft.details = {}; stage = "details"; }
  else if (stage === "details") {
    const next = draft.applications.find(a=>!draft.details[a.giftId])?.giftId;
    if (next) draft.details[next] = paymentFor(await transport.gift(next),next,id);
    if (draft.applications.every(a=>draft.details[a.giftId])) stage = "verify_gift";
  } else if (stage === "verify_gift") {
    const current = campaignPledgeGift(await transport.gift(id),id);
    if (snapshot(current)!==snapshot(draft.gift)) fail(id,"The pledge changed during the check. Start a fresh campaign refresh.");
    stage = "verify_applications";
  } else if (stage === "verify_applications") {
    const current = applicationsFor(await transport.pledge(id,"pledgepayments"),draft.gift,draft.installments);
    if (snapshot(current)!==snapshot(draft.applications)) fail(id,"The pledge applications changed during the check. Start a fresh campaign refresh.");
    return { ...check,stage:"complete",draft,result:campaignPledgeResult(draft) };
  } else fail(id,"The saved check cannot be resumed.");
  return { ...check,stage,draft };
}

export function campaignPledgeAllocations(rows, check, mode) {
  const { gift } = check.draft, result = check.result;
  const off = proportionalCampaignCents(result.writeOffCents,gift.allocations);
  const balance = proportionalCampaignCents(result.balanceCents,gift.allocations.map((a,i)=>({ ...a,amountCents:a.amountCents-off[i] })));
  const selected = rows.map(row => {
    const index = gift.allocations.findIndex(a => row.split_id ? a.splitId===row.split_id && a.fundId===row.fund_id :
      gift.allocations.length===1 && a.fundId===row.fund_id);
    const expectedType = campaignGiftTypeKey(row.gift_type);
    if (index<0 || Number(row.amount_cents)!==gift.allocations[index].amountCents || row.conflict ||
        (gift.type === "Pledge" ? expectedType!=="pledge" : !["matchinggiftpledge","mgpledge"].includes(expectedType)))
      fail(gift.id,"The query's pledge type, amount or fund differs from NXT. Refresh the source rather than guessing.");
    return { itemKey:row.item_key,giftId:row.gift_id,splitId:row.split_id,fundId:row.fund_id,fundName:row.fund_name,
      donorName:row.donor_name,giftDate:row.gift_date,giftType:row.gift_type,amountCents:Number(row.amount_cents),writeOffCents:off[index],pledgeBalanceCents:balance[index] };
  });
  if (!selected.length || (mode === "gift" && selected.length!==gift.allocations.length)) fail(gift.id,"The query omits a pledge fund allocation.");
  return selected;
}
