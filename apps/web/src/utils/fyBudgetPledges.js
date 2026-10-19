import { revenueError } from "./fyRevenueGoals";

export const BUDGET_PLEDGE_QUERY_ID = "31076";
export const BUDGET_PLEDGE_QUERY_NAME = "FY27 Budget Relieving Payments Due - JUMGOGPT";
export const PLEDGE_COLUMNS = {
  giftId: "Pledge gift system record ID", name: "Donor name", amount: "Scheduled installment amount",
  dueDate: "Installment due date", fundName: "Fund description",
};
const normalize = value => String(value || "").trim().toLowerCase().replace(/[_./>\\-]+/g, " ").replace(/\s+/g, " ");
const aliases = {
  giftId: ["system record id", "gift system record id", "pledge system record id"],
  name: ["name", "donor name", "constituent name"],
  amount: ["installment amount due", "installment amount", "scheduled installment amount"],
  dueDate: ["installment date due", "installment due date", "installment date"],
  fundName: ["fund description", "fund name"],
};
export function suggestPledgeColumns(fields) {
  return Object.fromEntries(Object.entries(aliases).map(([key, names]) => {
    const matches = fields.filter(field => names.includes(normalize(field)));
    return [key, matches.length === 1 ? matches[0] : ""];
  }));
}
export function validateBudgetPledgeSource(input) {
  if (!input || Array.isArray(input) || Object.keys(input).some(key => !["queryId", "queryName", "columns", "confirmed"].includes(key))) throw revenueError("Invalid pledge source settings.");
  if (String(input.queryId) !== BUDGET_PLEDGE_QUERY_ID || typeof input.queryName !== "string" || !input.queryName.trim() || input.queryName.length > 250)
    throw revenueError("Load saved Gift query 31076 before continuing.");
  const keys = Object.keys(PLEDGE_COLUMNS), columns = input.columns;
  if (!columns || Array.isArray(columns) || Object.keys(columns).length !== keys.length || keys.some(key => typeof columns[key] !== "string" || !columns[key].trim() || columns[key].length > 200)
    || new Set(Object.values(columns)).size !== keys.length) throw revenueError("Map five distinct fields: pledge system ID, name, installment amount, due date, and fund description.");
  const id = normalize(columns.giftId);
  if (!/system record id/.test(id) || /constituent|fund|split|installment|appeal|campaign|qrecid/.test(id)) throw revenueError("Use the pledge gift's System Record ID, not a constituent, installment, or lookup ID.");
  if (!aliases.amount.includes(normalize(columns.amount))) throw revenueError("Use Installment Amount Due, not the whole pledge amount or balance. Remaining balances will be checked directly in NXT.");
  if (!aliases.dueDate.includes(normalize(columns.dueDate))) throw revenueError("Use the installment due date, not the gift date.");
  if (input.confirmed !== true) throw revenueError("Confirm this query identifies budget-relieving pledge installments for this fiscal year.");
  return { queryId: BUDGET_PLEDGE_QUERY_ID, queryName: input.queryName.trim(), columns: Object.fromEntries(keys.map(key => [key, columns[key]])), confirmed: true };
}
export function installmentDate(value) {
  const text = String(value || "").trim();
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const day = us ? `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}
export const installmentDateLabel = day => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

export function unrestrictedExpectedGoal(config, cashGoal, snapshot) {
  const samePeriod = snapshot?.period?.startsOn === config.startsOn && snapshot?.period?.endsOn === config.endsOn;
  const expected = samePeriod && Number.isSafeInteger(snapshot?.outstandingCents) && snapshot.outstandingCents >= 0 ? snapshot.outstandingCents : null;
  let totalCents = null, remainingCents = null, aboveGoalCents = null;
  if (cashGoal.activeFiscalYear && cashGoal.totalCents !== null && expected !== null) {
    const total = BigInt(cashGoal.totalCents) + BigInt(expected), remaining = BigInt(config.cents) - total;
    if (Number.isSafeInteger(Number(total)) && Number.isSafeInteger(Number(remaining))) {
      totalCents = Number(total); remainingCents = Number(remaining > 0n ? remaining : 0n); aboveGoalCents = Number(remaining < 0n ? -remaining : 0n);
    }
  }
  return { expectedCents: expected, totalCents, remainingCents, aboveGoalCents, samePeriod };
}
