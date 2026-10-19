import { revenueError, suggestRevenueColumns } from "./fyRevenueGoals";

export const BUDGET_CASH_QUERY_ID = "31075";
export const BUDGET_CASH_QUERY_NAME = "Budget Relieving Cash - JUMGOGPT";
export const BUDGET_CASH_GROUPS = Object.freeze([
  { key: "greatest_needs", label: "JU's Greatest Needs" },
  { key: "parent", label: "JU Parent Fund" },
  { key: "scholarship", label: "JU Scholarship Fund" },
  { key: "future_rising", label: "Future Rising Scholarship Fund" },
  { key: "impact", label: "Future. Made. Impact Fund" },
  { key: "other", label: "Other Scholarships" },
]);
export const defaultBudgetFundNames = () => Object.fromEntries(BUDGET_CASH_GROUPS.filter(group => group.key !== "other").map(group => [group.key, group.label]));
// Ignore presentation differences, not words: Scholarship and Scholarships remain distinct.
export const normalizeBudgetFundName = value => String(value).normalize("NFKC").trim().toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\./g, "").replace(/\s+/g, " ");
const headerName = value => String(value || "").trim().toLowerCase().replace(/[_./>-]+/g, " ").replace(/\s+/g, " ");
export function budgetFundGroup(name, fundNames) {
  return Object.entries(fundNames).find(([, value]) => normalizeBudgetFundName(value) === normalizeBudgetFundName(name))?.[0] || "other";
}
export function suggestBudgetColumns(fields, mode = "gift") {
  const columns = suggestRevenueColumns(fields);
  const aliases = { fundId: ["fund system record id", "funds system record id"], fundName: ["fund description", "fund name"],
    splitId: ["gift split system record id", "gift splits system record id", "split gift system record id"],
    amount: mode === "split" ? ["gift split amount", "split gift amount", "fund split amount", "fund split gift amount"] : ["gift amount"] };
  for (const [key, names] of Object.entries(aliases)) {
    const matches = fields.filter(field => names.includes(headerName(field)));
    columns[key] = key === "splitId" && mode !== "split" ? "" : matches.length === 1 ? matches[0] : "";
  }
  return columns;
}

export function validateBudgetCashSource(input) {
  if (!input || Array.isArray(input) || Object.keys(input).some(key => !["queryId", "queryName", "columns", "mode", "fundNames", "confirmed"].includes(key))) throw revenueError("Invalid budget cash source settings.");
  if (String(input.queryId) !== BUDGET_CASH_QUERY_ID || typeof input.queryName !== "string" || !input.queryName.trim() || input.queryName.length > 250)
    throw revenueError("Load saved Gift query 31075 before continuing.");
  if (!["gift", "split"].includes(input.mode)) throw revenueError("Choose whole-gift or fund-split amounts.");
  const required = ["giftId", "amount", "fundId", "fundName", ...(input.mode === "split" ? ["splitId"] : [])];
  const columns = input.columns;
  if (!columns || Array.isArray(columns) || Object.keys(columns).some(key => !["giftId", "amount", "fundId", "fundName", "splitId"].includes(key)) ||
      required.some(key => typeof columns[key] !== "string" || !columns[key].trim() || columns[key].length > 200))
    throw revenueError("Map the gift ID, fund ID, fund name, and amount; split mode also needs the gift split ID.");
  const chosen = required.map(key => columns[key]);
  if (new Set(chosen).size !== chosen.length) throw revenueError("Each value needs a different query output field.");
  const id = headerName(columns.giftId), fundId = headerName(columns.fundId), splitId = headerName(columns.splitId), amount = headerName(columns.amount);
  if (!/system record id/.test(id) || /constituent|fund|split|appeal|campaign|qrecid/.test(id)) throw revenueError("Use the gift's system record ID, not a lookup or constituent ID.");
  if (!/fund.*system record id/.test(fundId) || /gift|constituent|split/.test(fundId)) throw revenueError("Use Fund System Record ID, not the Fund ID lookup code.");
  if (input.mode === "split" && (!/split.*system record id/.test(splitId) || /fund|constituent/.test(splitId))) throw revenueError("Use each gift split's own system record ID.");
  if (/balance|write off|soft credit/.test(amount) || (input.mode === "split" ? !/split/.test(amount) : /split/.test(amount)))
    throw revenueError(input.mode === "split" ? "Choose the fund-split amount, not the full gift amount." : "Choose the whole-gift amount, not a fund-split amount or pledge balance.");
  const fundNames = input.fundNames || defaultBudgetFundNames();
  const keys = Object.keys(defaultBudgetFundNames());
  if (Array.isArray(fundNames) || Object.keys(fundNames).length !== keys.length || keys.some(key => typeof fundNames[key] !== "string" || !fundNames[key].trim() || fundNames[key].length > 250) ||
      new Set(keys.map(key => normalizeBudgetFundName(fundNames[key]))).size !== keys.length)
    throw revenueError("Provide a distinct NXT fund name for each of the five named groups.");
  if (input.confirmed !== true) throw revenueError("Confirm this query contains budget-relieving cash received for the intended fiscal period and that the selected amount matches each fund.");
  return { queryId: BUDGET_CASH_QUERY_ID, queryName: input.queryName.trim(), mode: input.mode, confirmed: true,
    columns: Object.fromEntries(required.map(key => [key, columns[key]])), fundNames: Object.fromEntries(keys.map(key => [key, fundNames[key].trim()])) };
}
