import { randomUUID } from "node:crypto";
import sql from "./sql";
import { decodeResult, visitResultCsv } from "./dashboardQueryResults";
import { centsFromText, inspectRevenueQuery, publishRevenueState, readRevenueState, REVENUE_LIMITS } from "./fyRevenueGoals";
import { revenueError } from "@/utils/fyRevenueGoals";
import { BUDGET_CASH_GROUPS, BUDGET_CASH_QUERY_ID, budgetFundGroup, normalizeBudgetFundName, suggestBudgetColumns, validateBudgetCashSource } from "@/utils/fyBudgetCash";

export const BUDGET_CASH_CACHE_KEY = "report:fy-revenue-goals:budget-cash:v1";
export const readBudgetCashState = (db = sql) => readRevenueState(db, BUDGET_CASH_CACHE_KEY);
export function inspectBudgetCashQuery(query, source) {
  const metadata = inspectRevenueQuery(query, source, BUDGET_CASH_QUERY_ID);
  return { ...metadata, suggested: suggestBudgetColumns(metadata.fields, source?.mode || "gift") };
}
function safeCents(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw revenueError("A budget cash total exceeds the supported reporting range.", 422);
  return result;
}

export function aggregateBudgetCashCsv(content, source, expectedRows) {
  if (!Number.isSafeInteger(expectedRows) || expectedRows < 0 || expectedRows > REVENUE_LIMITS.rows)
    throw revenueError("A verified completed row count is required. Previous budget cash totals are unchanged.", 422);
  const entries = new Map(), gifts = new Set(), funds = new Map(), splitGifts = new Map();
  let total = 0n;
  const { rowCount } = visitResultCsv(content, { maxRows: REVENUE_LIMITS.rows,
    onHeaders(headers) {
      if (Object.values(source.columns).some(name => !headers.includes(name))) throw revenueError("A mapped budget cash column is missing. Reload query fields; previous totals are unchanged.", 422);
    },
    onRow(row, headers) {
      const value = key => row[headers.indexOf(source.columns[key])]?.trim() || "";
      const giftId = value("giftId"), fundId = value("fundId"), splitId = source.mode === "split" ? value("splitId") : null;
      if ([giftId, fundId, ...(splitId !== null ? [splitId] : [])].some(id => !/^[1-9]\d{0,18}$/.test(id))) throw revenueError("Each row needs valid gift, fund, and (in split mode) split system IDs.", 422);
      if (splitId !== null) {
        if (splitGifts.has(splitId) && splitGifts.get(splitId) !== giftId) throw revenueError("A gift split is linked to conflicting gift IDs. Previous totals are unchanged.", 422);
        splitGifts.set(splitId, giftId);
      }
      const name = value("fundName");
      if (!name || name.length > 250) throw revenueError("Each budget cash row needs a readable fund name.", 422);
      const amount = centsFromText(value("amount"));
      const existingFund = funds.get(fundId);
      if (existingFund && normalizeBudgetFundName(existingFund.name) !== normalizeBudgetFundName(name)) throw revenueError(`Fund ${fundId} has conflicting names. Previous totals are unchanged.`, 422);
      const key = splitId === null ? giftId : `${giftId}:${splitId}`;
      const previous = entries.get(key);
      if (previous) {
        if (previous.fundId !== fundId || previous.amount !== amount)
          throw revenueError(source.mode === "gift" ? `Gift ${giftId} has multiple funds or conflicting amounts. Switch to fund-split outputs so its whole amount is not counted repeatedly.` : `Gift split ${splitId} has conflicting funds or amounts. Previous totals are unchanged.`, 422);
        return;
      }
      entries.set(key, { fundId, amount }); gifts.add(giftId);
      const fund = existingFund || { id: fundId, name, cents: 0n, gifts: new Set() };
      fund.cents += BigInt(amount); fund.gifts.add(giftId); funds.set(fundId, fund);
      if (funds.size > 2000) throw revenueError("The query returned more than 2,000 funds; no partial totals were saved.", 422);
      total += BigInt(amount);
    },
  });
  if (rowCount !== expectedRows) throw revenueError("The budget cash download count does not match the completed query. Previous totals are unchanged.", 422);
  const groups = BUDGET_CASH_GROUPS.map(group => ({ ...group, cents: 0n, fundCount: 0 }));
  const fundRows = [...funds.values()].map(fund => {
    const groupKey = budgetFundGroup(fund.name, source.fundNames), group = groups.find(item => item.key === groupKey);
    group.cents += fund.cents; group.fundCount++;
    return { id: fund.id, name: fund.name, groupKey, receivedCents: safeCents(fund.cents), giftCount: fund.gifts.size };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const receivedCents = safeCents(total);
  return { receivedCents, giftCount: gifts.size, allocationCount: entries.size, rawRows: rowCount, duplicateRows: rowCount - entries.size,
    groups: groups.map(({ cents, ...group }) => ({ ...group, receivedCents: safeCents(cents) })), funds: fundRows };
}

export async function refreshBudgetCash({ input, revision, user, transport, db = sql }) {
  const source = validateBudgetCashSource(input);
  const before = await readBudgetCashState(db);
  if (revision !== before.revision) throw revenueError("Budget cash totals changed. Reload before refreshing.", 409);
  inspectBudgetCashQuery(await transport.metadata(), source);
  const result = await transport.execute();
  const snapshot = aggregateBudgetCashCsv(decodeResult(result, { maxBytes: REVENUE_LIMITS.bytes }), source, result.queryJobRowCount);
  inspectBudgetCashQuery(await transport.metadata(), source);
  return publishRevenueState(revision, { revision: randomUUID(), source, snapshot: { ...snapshot, refreshedAt: new Date().toISOString() }, updatedBy: user.id }, db, BUDGET_CASH_CACHE_KEY);
}
