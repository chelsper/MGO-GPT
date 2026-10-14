export const CAMPAIGN_REPORT_KEY = "future-made-campaign";
export const CAMPAIGN_PRIORITIES = Object.freeze([
  { key: "scholarships", label: "Scholarships" },
  { key: "healthcare-business", label: "Healthcare & Business" },
  { key: "corporate-partnerships", label: "Corporate Partnerships" },
  { key: "entrepreneurship-innovation", label: "Entrepreneurship & Innovation" },
  { key: "campus-planning", label: "Campus Planning" },
]);
export const CAMPAIGN_FIELDS = Object.freeze({
  giftId: "Gift system record ID", splitId: "Gift split system record ID",
  fundId: "Fund system record ID", fundName: "Fund name", amount: "Campaign-countable amount",
  donorName: "Donor name (optional)", giftDate: "Gift date (optional)", giftType: "Gift type (optional)",
  writeOff: "Write-off amount", pledgeBalance: "Pledge balance",
});
export const campaignError = (message, status = 400) => Object.assign(new Error(message), { campaignSafe: true, status });
export const campaignId = value => /^[1-9]\d{0,18}$/.test(String(value ?? "").trim()) ? String(value).trim() : null;
export const validPriority = value => value === "unassigned" || CAMPAIGN_PRIORITIES.some(p => p.key === value);
export const priorityLabel = key => CAMPAIGN_PRIORITIES.find(p => p.key === key)?.label || "Unassigned";
export const campaignMoney = cents => cents === null || cents === undefined ? "Not loaded" :
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(cents) / 100);

export function campaignCents(value) {
  let text = String(value ?? "").trim();
  const negative = /^\(.*\)$/.test(text);
  if (negative) text = text.slice(1, -1).trim();
  if (!/^-?\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text) || (negative && text.startsWith("-")))
    throw campaignError("Use an exact USD amount with no more than two decimal places. Blank is not zero.");
  const sign = negative || text.startsWith("-") ? -1 : 1;
  const [whole, fraction = ""] = text.replace(/[-$,]/g, "").split(".");
  const cents = sign * (Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 1e14) throw campaignError("This campaign amount exceeds the supported limit.");
  return cents;
}

export function validateCampaignSource(input) {
  if (!input || Object.keys(input).some(k => !["queryId", "queryName", "mode", "columns", "confirmed"].includes(k))) throw campaignError("Review the campaign source settings.");
  if (!campaignId(input.queryId) || input.confirmed !== true || !["split", "gift"].includes(input.mode))
    throw campaignError("Choose the query and amount basis, then confirm the source mapping.");
  const queryName = String(input.queryName || "").trim();
  if (!queryName || queryName.length > 200) throw campaignError("Load the query fields before saving its source.");
  if (!input.columns || Object.keys(input.columns).some(k => !Object.hasOwn(CAMPAIGN_FIELDS, k))) throw campaignError("Unknown campaign output mapping.");
  const columns = Object.fromEntries(Object.keys(CAMPAIGN_FIELDS).map(key => [key, String(input.columns[key] || "").trim()]));
  if (Object.values(columns).some(v => v.length > 200)) throw campaignError("An output column name is too long.");
  const required = ["giftId", "fundId", "fundName", "amount", ...(input.mode === "split" ? ["splitId"] : [])];
  if (required.some(key => !columns[key])) throw campaignError("Map the gift, fund, amount and required split system ID fields.");
  if (input.mode === "gift" && columns.splitId) throw campaignError("Clear the split ID mapping when using one amount per gift.");
  const selected = Object.values(columns).filter(Boolean);
  if (new Set(selected).size !== selected.length) throw campaignError("Each campaign value must use a different output column.");
  return { queryId: String(input.queryId), queryName, mode: input.mode, columns, confirmed: true };
}

export function campaignRow(row, headers, config) {
  const get = key => config.columns[key] ? String(row[headers.indexOf(config.columns[key])] ?? "").trim() : "";
  const giftId = campaignId(get("giftId")), fundId = campaignId(get("fundId"));
  const splitId = config.mode === "split" ? campaignId(get("splitId")) : null;
  if (!giftId || !fundId || (config.mode === "split" && !splitId)) throw campaignError("Every row needs valid gift, fund and (for split amounts) split system IDs. No IDs are inferred.");
  const fundName = get("fundName"), donorName = get("donorName"), giftType = get("giftType");
  if (!fundName || [fundName, donorName, giftType].some(v => v.length > 250)) throw campaignError("A fund name is missing or a campaign label is too long.");
  const amountCents = campaignCents(get("amount"));
  const adjustment = key => {
    if (!config.columns[key]) return null;
    const value = campaignCents(get(key) || "0");
    if (value < 0) throw campaignError(`Gift ${giftId}: ${CAMPAIGN_FIELDS[key]} must be zero or a positive amount. No new totals were published.`);
    return value;
  };
  const writeOffCents = adjustment("writeOff"), pledgeBalanceCents = adjustment("pledgeBalance");
  if (writeOffCents > Math.max(0, amountCents)) throw campaignError(`Gift ${giftId}: the write-off exceeds the mapped gift amount. Review the amount basis; no new totals were published.`);
  return { itemKey: config.mode === "split" ? `${giftId}:${splitId}` : giftId, giftId, splitId, fundId, fundName,
    donorName, giftDate: get("giftDate"), giftType, amountCents, writeOffCents, pledgeBalanceCents };
}

export function validateCampaignOverride(input) {
  if (!input || Object.keys(input).some(k => !["itemKey", "priority", "amount", "reason", "revert"].includes(k)) ||
      !/^[1-9]\d{0,18}(?::[1-9]\d{0,18})?$/.test(input.itemKey || "")) throw campaignError("Choose a saved campaign gift allocation.");
  const reason = String(input.reason || "").trim();
  if (!reason || reason.length > 500) throw campaignError("Add a reason (up to 500 characters) for the campaign-only change.");
  if (input.revert === true) return { itemKey: input.itemKey, revert: true, reason };
  if (input.priority !== null && !validPriority(input.priority)) throw campaignError("Choose a campaign priority or inherit the fund assignment.");
  return { itemKey: input.itemKey, priority: input.priority, amountCents: input.amount === null ? null : campaignCents(input.amount), reason, revert: false };
}
