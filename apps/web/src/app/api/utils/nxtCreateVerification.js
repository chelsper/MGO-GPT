import { remoteCreateId } from "./nxtCreateReceipt";

const text = value => typeof value === "string" ? value.replace(/\r\n/g, "\n") : value;
const date = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

export function matchesCreatedRecord(receipt, response, remoteId) {
  const record = response?.value && !Array.isArray(response.value) ? response.value : response;
  const expected = receipt.payload;
  if (!expected || !record || remoteCreateId(receipt.kind, response) !== remoteId
    || String(record.constituent_id || record.constituent?.id || "") !== receipt.constituent_id) return false;
  if (receipt.kind === "action") {
    if (!expected.summary || !expected.category || !date(expected.date)) return false;
    if (record.summary !== expected.summary || date(record.date) !== date(expected.date)
      || String(record.category || "").toLowerCase() !== expected.category.toLowerCase()
      || expected.completed !== record.completed
      || expected.description && text(record.description) !== text(expected.description)
      || expected.opportunity_id && String(record.opportunity_id || "") !== String(expected.opportunity_id)) return false;
    const actual = Array.isArray(record.fundraisers) ? record.fundraisers.map(value => String(value?.id || value)).sort() : [];
    return !expected.fundraisers?.length || JSON.stringify(actual) === JSON.stringify(expected.fundraisers.map(String).sort());
  }
  if (receipt.kind !== "opportunity" || !expected.name || record.name !== expected.name) return false;
  for (const field of ["purpose", "status"]) if (expected[field] !== undefined && record[field] !== expected[field]) return false;
  for (const field of ["ask_date", "expected_date", "funded_date"]) {
    if (expected[field] !== undefined && (!date(expected[field]) || date(record[field]) !== date(expected[field]))) return false;
  }
  for (const field of ["expected_amount", "ask_amount", "funded_amount"]) {
    if (expected[field] !== undefined && (record[field]?.value == null
      || !Number.isFinite(Number(record[field].value)) || Number(record[field].value) !== Number(expected[field].value))) return false;
  }
  return true;
}
