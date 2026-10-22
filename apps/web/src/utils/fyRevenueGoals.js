export const FY_REVENUE_KEY = "fy-revenue-goals";
export const FY_REVENUE_QUERY_ID = "31074";
export const FY_REVENUE_QUERY_NAME = "Gifts Eligible for Gift Tax - JUMGOGPT";
export const REVENUE_LABEL = "Total Gifts Received Eligible for Re-Investment";
export const PROJECTION_LABEL = "Projected Gift Re-Investment To Date";
export const DEFAULT_PROJECTION = "set_aside";

export function revenueError(message, status = 400) {
  return Object.assign(new Error(message), { revenueSafe: true, status });
}

export function projectionCents(cents, mode) {
  if (!Number.isSafeInteger(cents) || !["remaining", "set_aside"].includes(mode))
    throw revenueError("Choose how to display the 10% calculation.");
  // Round the aggregate once, not each gift. BigInt avoids floating-point loss.
  const value = BigInt(cents), magnitude = value < 0n ? -value : value;
  const deduction = Number((magnitude + 5n) / 10n) * (value < 0n ? -1 : 1);
  return mode === "set_aside" ? deduction : cents - deduction;
}

export const revenueMoney = cents => Number.isSafeInteger(cents)
  ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
  : "Not refreshed";

const normalized = text => String(text || "").trim().toLowerCase().replace(/[_./>-]+/g, " ").replace(/\s+/g, " ");
export function suggestRevenueColumns(fields) {
  const aliases = {
    giftId: ["gift system record id", "gift information system record id", "system record id"],
    amount: ["gift amount"],
  };
  return Object.fromEntries(Object.entries(aliases).map(([key, names]) => {
    const matches = fields.filter(field => names.includes(normalized(field)));
    return [key, matches.length === 1 ? matches[0] : ""];
  }));
}

export function validateRevenueSource(input) {
  if (!input || Array.isArray(input) || Object.keys(input).some(key => !["queryId", "queryName", "columns", "projection", "confirmed"].includes(key)))
    throw revenueError("Invalid revenue source settings.");
  if (String(input.queryId) !== FY_REVENUE_QUERY_ID) throw revenueError("This panel uses saved Gift query 31074.");
  if (typeof input.queryName !== "string" || !input.queryName.trim() || input.queryName.length > 250)
    throw revenueError("Load the saved query fields first.");
  if (!input.columns || Array.isArray(input.columns) || Object.keys(input.columns).some(key => !["giftId", "amount"].includes(key)) ||
      ["giftId", "amount"].some(key => typeof input.columns[key] !== "string" || !input.columns[key].trim() || input.columns[key].length > 200))
    throw revenueError("Choose the gift system record ID and whole-gift amount fields.");
  const id = normalized(input.columns.giftId), amount = normalized(input.columns.amount);
  if (input.columns.giftId === input.columns.amount || !/system record id/.test(id) || /constituent|fund|split|appeal|campaign|qrecid/.test(id))
    throw revenueError("Use Gift Information > System Record ID, not a donor, fund, lookup or import ID.");
  if (/balance|write off|split|soft credit/.test(amount))
    throw revenueError("Choose the whole-gift received amount, not a balance, write-off, soft credit or split amount.");
  projectionCents(0, input.projection);
  if (input.confirmed !== true) throw revenueError("Confirm the query includes received gifts for the intended fiscal period, not unpaid commitments.");
  return { queryId: FY_REVENUE_QUERY_ID, queryName: input.queryName.trim(), columns: { ...input.columns }, projection: input.projection, confirmed: true };
}
