import { lifetimeError } from "./lifetimeSocieties";

// Evidence requests only. These classifications never change gift treatment,
// credit, totals, or the date-calculation rules.
const needs = {
  conflict: { label: "Conflicting gift records", evidence: "Verify the gift system ID, owner, amount, date and type in NXT. Resolve conflicting source rows before using either value." },
  date: { label: "Gift date", evidence: "Verify the actual gift date. A missing, invalid or future date cannot establish a historical milestone." },
  amount: { label: "Gift amount", evidence: "Verify the amount and dated adjustments. Do not replace missing amounts with zero or ignore negative transactions." },
  credit: { label: "Recognition credit", evidence: "Verify the recipient-level credit and query recognition settings. Do not infer credit from a name, employer or shared gift." },
  pledge: { label: "Pledges", evidence: "Obtain the pledge system ID, original commitment date and amount, all linked payment IDs and applied amounts, and dated amendments/write-offs. Reconcile the remaining balance; do not add the pledge and its payments twice." },
  payment: { label: "Pledge payments", evidence: "Obtain the parent pledge system ID and the amount applied to each pledge/installment. Check whether this recipient already receives credit for the pledge; a payment alone does not prove an additional commitment." },
  matching: { label: "Matching-gift pledges and payments", evidence: "Verify the company's matching pledge, its linked payments and any dated write-offs, plus the explicit recipients of each gift's credit. Do not include the company's unrelated gifts or infer a household from matching credit." },
  write_off: { label: "Write-offs and adjustments", evidence: "Obtain the affected pledge/gift system ID, effective date and amount of each write-off or adjustment. Today's balance alone cannot establish when a historical milestone was reached." },
  planned: { label: "Planned gifts", evidence: "Verify the recognized planned-gift amount and date, and any linked realized gifts or adjustments. Do not count the planned gift and its realization twice." },
  stock_sale: { label: "Stock/property proceeds", evidence: "Verify the original stock/property gift, sale proceeds and any pledge application. Do not count the original gift and its sale as two gifts." },
  recurring: { label: "Recurring commitments", evidence: "Distinguish the recurring commitment from actual payment gifts and verify the society's recognition rule. Do not treat a recurring schedule as cash received." },
  other: { label: "Other gift types", evidence: "Have Advancement Services verify this gift type and any linked transactions before using it in a historical milestone." },
};
const typeKey = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function lifetimeReconciliationNeeds(item) {
  if (item.outcome !== "review") return [];
  const codes = new Set();
  for (const reason of item.reasons || []) {
    if (/conflict/i.test(reason)) codes.add("conflict");
    else if (/gift date/i.test(reason)) codes.add("date");
    else if (/gift amount/i.test(reason)) codes.add("amount");
    else if (/credit flag|allocation verification/i.test(reason)) codes.add("credit");
    else if (/complex gifts|linked history/i.test(reason)) {
      const type = typeKey(item.type);
      if (/writeoff|adjustment|amendment/.test(type)) codes.add("write_off");
      else if (/matchinggift|^mg/.test(type)) codes.add("matching");
      else if (type === "pledge") codes.add("pledge");
      else if (/pledgepayment|^pay/.test(type)) codes.add("payment");
      else if (/plannedgift/.test(type)) codes.add("planned");
      else if (/sold|stocksale/.test(type)) codes.add("stock_sale");
      else if (/recurring/.test(type)) codes.add("recurring");
      else codes.add("other");
    } else codes.add("other");
  }
  if (!codes.size) codes.add("other");
  return [...codes].map(code => ({ code, ...needs[code] }));
}

export function lifetimeReconciliationSummary(items) {
  const counts = new Map();
  for (const item of items) for (const need of lifetimeReconciliationNeeds(item)) counts.set(need.code, (counts.get(need.code) || 0) + 1);
  return Object.entries(needs).filter(([code]) => counts.has(code)).map(([code, detail]) => ({ code, ...detail, gifts: counts.get(code) }));
}

export function lifetimeReconciliationCsv({ row, items, asOf, refreshedAt }, maxBytes = 32 * 1024 * 1024) {
  const safe = value => {
    const text = String(value ?? "");
    return `"${(/^[\s]*[=+@\-\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
  };
  const header = ["Recipient / household", "Society", "Household members / constituent IDs", "Gift system record ID", "Gift date", "Gift type",
    "Source gift amount (NOT additive; not a reconciled total)", "Credit recipients", "NXT credit flags", "Evidence needed", "Review notes",
    "Saved history refreshed at", "Evaluated as of", "Staff-confirmed entry date (unchanged)", "Scope"];
  const lines = [], encoder = new TextEncoder(); let bytes = 3; // UTF-8 BOM added by the route helper.
  const append = row => {
    const line = row.map(safe).join(",");
    bytes += encoder.encode(line).byteLength + (lines.length ? 2 : 0);
    if (bytes > maxBytes) throw lifetimeError("This reconciliation export exceeds the safe download size. Nothing was truncated; contact Advancement Services for a scoped export.", 413);
    lines.push(line);
  };
  append(header);
  const members = (row.members || [row]).map(member => `${member.name} (Constituent ID ${member.lookupId || "not supplied"}${member.systemId ? `; system ID ${member.systemId}` : ""})`).join("; ");
  for (const item of items) if (item.outcome === "review") append([row.name, row.societyName, members,
    item.giftId, item.day, item.type, item.cents == null ? "" : (item.cents / 100).toFixed(2),
    [...new Set(item.credits.flatMap(credit => credit.recipients))].join("; "), item.credits.map(credit => credit.flag).join("; "),
    lifetimeReconciliationNeeds(item).map(need => `${need.label}: ${need.evidence}`).join("; "), item.reasons.join("; "),
    refreshedAt, asOf, row.status === "confirmed" ? row.date : "",
    "Saved query evidence only; no linked transactions verified. All unresolved gifts for this recipient/household and society, not just the visible page. Not an NXT import template."]);
  return lines.join("\r\n");
}
