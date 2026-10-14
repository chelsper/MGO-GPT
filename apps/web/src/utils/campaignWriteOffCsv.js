import Papa from "papaparse";
import { campaignCents, campaignError, campaignGiftTypeKey, campaignId } from "./campaignPriorities";

export const CAMPAIGN_WRITE_OFF_LIMITS = { bytes: 1024 * 1024, rows: 2000 };
const headers = ["Gift Amount", "Gift Type", "Pledge Balance", "Gf_System_ID", "Write off"];
export const campaignPledgeType = value => {
  const type = campaignGiftTypeKey(value);
  return type === "pledge" ? "pledge" : ["mgpledge", "matchinggiftpledge"].includes(type) ? "matching" : null;
};

export function parseCampaignWriteOffCsv(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > CAMPAIGN_WRITE_OFF_LIMITS.bytes)
    throw campaignError("Choose a write-off CSV no larger than 1 MB.");
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: value => value.trim() });
  if (parsed.errors.length || parsed.meta.renamedHeaders && Object.keys(parsed.meta.renamedHeaders).length ||
      parsed.meta.fields?.length !== headers.length || headers.some(name => !parsed.meta.fields?.includes(name)))
    throw campaignError(`Use these five CSV columns: ${headers.join(", ")}. Duplicate headers or malformed rows must be corrected first.`);
  if (!parsed.data.length || parsed.data.length > CAMPAIGN_WRITE_OFF_LIMITS.rows)
    throw campaignError("Use 1-2,000 pledge rows per upload.");
  const ids = new Set();
  const entries = parsed.data.map((row, index) => {
    const giftId = campaignId(row.Gf_System_ID), type = campaignPledgeType(row["Gift Type"]);
    if (!giftId || !type || ids.has(giftId)) throw campaignError(`CSV row ${index+2}: use a unique gift system ID and a Pledge or MG Pledge gift type.`);
    ids.add(giftId);
    const grossCents = campaignCents(row["Gift Amount"]), writeOffCents = campaignCents(row["Write off"]), balanceCents = campaignCents(row["Pledge Balance"]);
    if (grossCents < 0 || writeOffCents < 0 || balanceCents < 0 || writeOffCents+balanceCents > grossCents)
      throw campaignError(`Gift ${giftId}: write-off and balance must be nonnegative and cannot exceed the original pledge amount together.`);
    // CSV balances validate the file only. Received always uses the campaign query's current balance.
    return { giftId, type, grossCents, writeOffCents };
  }).sort((a,b) => BigInt(a.giftId)<BigInt(b.giftId) ? -1 : 1);
  const writeOffCents = entries.reduce((sum,row) => sum+BigInt(row.writeOffCents),0n);
  if (writeOffCents>BigInt(Number.MAX_SAFE_INTEGER)) throw campaignError("The write-off total exceeds the supported exact-amount limit.");
  return { entries, count: entries.length, matching: entries.filter(row => row.type === "matching").length, writeOffCents: Number(writeOffCents) };
}

export function mergeCampaignWriteOffCsv(previous, upload, { asOf, complete, confirmed }, today = new Date().toISOString().slice(0,10)) {
  if (confirmed !== true || typeof complete !== "boolean" || !/^\d{4}-\d{2}-\d{2}$/.test(asOf || "") ||
      !Number.isFinite(Date.parse(asOf)) || new Date(asOf).toISOString().slice(0,10) !== asOf || asOf>today)
    throw campaignError("Choose a valid date through today and confirm the CSV write-off totals.");
  if (!previous && !complete) throw campaignError("The first upload must contain all campaign pledges with write-offs, including matching-gift pledges.");
  if (previous && asOf<previous.latestAsOf) throw campaignError("This file predates a saved upload. Use current cumulative write-off totals so older data cannot overwrite newer totals.");
  const entries = new Map((previous?.entries || []).map(row=>[row.giftId,row]));
  const incoming = new Set(upload.entries.map(row=>row.giftId));
  if (complete && [...entries.values()].some(row=>row.writeOffCents>0 && !incoming.has(row.giftId)))
    throw campaignError("A complete list is missing previously saved write-offs. Include those gifts, use an explicit zero to reverse one, or choose additions/corrections only.");
  for (const row of upload.entries) entries.set(row.giftId,row);
  if (entries.size>CAMPAIGN_WRITE_OFF_LIMITS.rows) throw campaignError("The saved write-off register supports up to 2,000 pledges.");
  const result = { completeAsOf: complete ? asOf : previous.completeAsOf, latestAsOf: asOf,
    entries: [...entries.values()].sort((a,b)=>BigInt(a.giftId)<BigInt(b.giftId) ? -1 : 1) };
  if (result.entries.reduce((sum,row)=>sum+BigInt(row.writeOffCents),0n)>BigInt(Number.MAX_SAFE_INTEGER))
    throw campaignError("The saved write-off total exceeds the exact-amount limit.");
  return result;
}

export function campaignWriteOffSummary(ledger) {
  if (!ledger) return null;
  const { entries = [], ...details } = ledger;
  return { ...details, count: entries.length, writeOffCents: entries.reduce((sum,row)=>sum+row.writeOffCents,0) };
}
