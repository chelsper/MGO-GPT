import { CAMPAIGN_FIELDS } from "./campaignPriorities";

const normalize = value => String(value || "").trim().toLowerCase().replace(/[_./>-]+/g, " ").replace(/\s+/g, " ");
const aliases = {
  giftId: ["gift system record id", "gift information system record id"],
  splitId: ["gift split system record id", "gift splits system record id", "split gift system record id"],
  fundId: ["fund system record id", "funds system record id"],
  fundName: ["fund description", "fund name"],
  donorName: ["primary donor name", "donor name", "constituent name"],
  giftDate: ["gift date"],
  giftType: ["gift type"],
  writeOff: ["write off amount", "gift write off amount", "gift write off total", "total write off amount", "total amount of write offs"],
  pledgeBalance: ["pledge balance", "gift pledge balance"],
};

export const CAMPAIGN_FIELD_HELP = {
  giftId: "The internal ID from Gift Information > System Record ID. It may be labeled only System Record ID. Do not use the donor ID, Gift ID code, or Gift Import ID.",
  splitId: "The internal ID of this gift's allocation. A fund ID is not a split ID. Leave this unresolved if the query does not return it.",
  fundId: "Choose Fund System Record ID. Fund ID is a separate lookup code, even when it contains only numbers.",
  fundName: "The readable fund name. NXT commonly calls this Fund Description.",
  amount: "The full gift amount before write-offs. The dashboard subtracts the mapped write-off once. Do not select an amount that already excludes write-offs or use pledge balance here.",
  donorName: "Optional. Use the primary donor, not repeating soft-credit recipients. Gifts can load without names.",
  giftDate: "Optional. The date of the gift, not its entry or last-change date.",
  giftType: "Optional. Identifies pledges, payments, and other gift types without changing their campaign credit.",
  writeOff: "Total write-offs for the gift, not individual write-off transactions. A blank cell means no write-off. In split mode, use the write-off allocated to that split; whole-gift mode distributes totals across verified funds proportionally.",
  pledgeBalance: "Current outstanding pledge balance, not the original pledge amount. Blank means no outstanding balance. Received equals net campaign amount minus this balance. In split mode use the balance for that split.",
};

export const campaignRequiredFields = mode => ["giftId", ...(mode === "split" ? ["splitId"] : []), "fundId", "fundName", "amount"];

export function campaignFieldCandidates(key, fields, mode) {
  if (mode === "split" && ["writeOff", "pledgeBalance"].includes(key)) {
    const names = key === "writeOff" ? ["gift split write off amount", "split write off amount"] : ["gift split pledge balance", "split pledge balance"];
    return fields.filter(field => names.includes(normalize(field)));
  }
  const names = key === "amount"
    ? mode === "split" ? ["gift split amount", "split gift amount", "fund split amount", "fund split gift amount"] : ["gift amount"]
    : aliases[key] || [];
  return fields.filter(field => names.includes(normalize(field)));
}

// Only suggest unique, explicit labels. Lookup IDs and whole-gift amounts are
// deliberately not guessed for system IDs or split-level campaign amounts.
export function suggestCampaignColumns(fields, mode, existing = {}) {
  const columns = { ...existing }, suggested = [];
  for (const key of Object.keys(CAMPAIGN_FIELDS)) {
    if (columns[key] || (key === "splitId" && mode !== "split")) continue;
    const matches = campaignFieldCandidates(key, fields, mode);
    if (matches.length === 1 && !Object.values(columns).includes(matches[0])) {
      columns[key] = matches[0]; suggested.push(key);
    }
  }
  return { columns, suggested };
}

export function campaignMappingIssues(source, fields, loaded) {
  const required = campaignRequiredFields(source.mode), columns = source.columns || {};
  const issues = [];
  for (const key of required) if (!columns[key]) issues.push({ key, message: `Choose ${CAMPAIGN_FIELDS[key]}.` });
  for (const [key, value] of Object.entries(columns)) {
    if (!value || (key === "splitId" && source.mode !== "split")) continue;
    if (loaded && !fields.includes(value)) issues.push({ key, message: `The query no longer returns "${value}". Choose a current field or clear this optional mapping.` });
    if (Object.entries(columns).some(([other, name]) => other !== key && name === value))
      issues.push({ key, message: `"${value}" is used more than once. Choose a different output field.` });
    const label = normalize(value);
    if (["giftId", "splitId", "fundId"].includes(key) && ["gift id", "fund id", "constituent id", "gift import id", "fund import id"].includes(label))
      issues.push({ key, message: `"${value}" is a lookup or import code, not the required system record ID.` });
    if (key === "splitId" && ["fund system record id", "gift system record id"].includes(label))
      issues.push({ key, message: "Choose the gift split's own system record ID, not the gift or fund ID." });
    if (key === "amount" && /balance|write off/.test(label)) issues.push({ key, message: "Use the full gift amount here. Map pledge balance and write-offs separately." });
    if (["writeOff", "pledgeBalance"].includes(key) && source.mode === "split" && !/split/.test(label))
      issues.push({ key, message: "Use a split-level amount here, or switch to whole-gift mode to distribute whole-gift write-offs and balances across verified funds." });
    if (key === "amount" && source.mode === "split" && label === "gift amount")
      issues.push({ key, message: "Gift Amount is the whole-gift amount. Choose a split amount so a gift assigned to several funds is not counted more than once." });
  }
  return issues;
}
