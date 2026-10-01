import { receiptDate, receiptId } from "./stewardshipReceipts";

export const HISTORY_COLUMNS = Object.freeze({
  constituentId: "Constituent system record ID (optional)",
  name: "Constituent name",
  actionId: "Action system record ID",
  fieldId: "Action custom-field Import ID",
  category: "Custom-field category",
  value: "Custom-field value (optional)",
  completed: "Action completed",
  date: "Date received (custom-field or action date)",
  fallbackDate: "Fallback date when the first is blank (optional)",
});
export const HISTORY_LIMITS = Object.freeze({ bytes: 4 * 1024 * 1024, rows: 10000, receipts: 2000 });
export const isCompletedHistoryValue = value => typeof value === "string" && /^(yes|true|1)$/i.test(value.trim());
const plain = value => value && typeof value === "object" && !Array.isArray(value);
export function historyMapping(input) {
  if (!plain(input) || !plain(input.columns) || !Array.isArray(input.rules) ||
      !input.rules.length || input.rules.length > 100 || input.confirmed !== true ||
      !isCompletedHistoryValue(input.completedValue)) return null;
  const columns = Object.fromEntries(Object.keys(HISTORY_COLUMNS).map(key => [key, input.columns[key]]));
  columns.value ||= "";
  columns.constituentId ||= "";
  columns.fallbackDate ||= "";
  if (Object.entries(columns).some(([key,v]) => typeof v !== "string" || (!["value", "constituentId", "fallbackDate"].includes(key) && !v.trim()) || v.length > 240) ||
      new Set(Object.values(columns).filter(Boolean)).size !== Object.values(columns).filter(Boolean).length) return null;
  const rules = input.rules.map(rule => ({ category: typeof rule?.category === "string" ? rule.category.trim() : "", itemId: rule?.itemId,
    value: typeof rule?.value === "string" ? rule.value.trim() : "", anyValue: rule?.anyValue === true }));
  if (rules.some(rule => !rule.category || rule.category.length > 240 || !receiptId(rule.itemId) ||
      (!rule.anyValue && (typeof rule.value !== "string" || !rule.value || rule.value.length > 1000))) ||
      new Set(rules.map(r => r.category)).size !== rules.length) return null;
  return { columns, rules, completedValue: input.completedValue.trim(), confirmed: true };
}

export function historyDate(value) {
  const text = String(value || "").trim();
  if (receiptDate(text)) return text;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const day = match && `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  return receiptDate(day) ? day : null;
}

// Source identity is action + attribute, never donor name or constituent alone.
export function prepareHistoryRows(table, input, items, today) {
  const mapping = historyMapping(input);
  if (!mapping || !receiptDate(today)) throw new Error("Review the field mappings and confirm what counts as a received gift.");
  const indexes = Object.fromEntries(Object.entries(mapping.columns).map(([key, label]) => [key, table.headers.indexOf(label)]));
  if (Object.entries(indexes).some(([key,i]) => i < 0 && !(["value", "constituentId", "fallbackDate"].includes(key) && !mapping.columns[key]))) throw new Error("A mapped output field is missing. Load the query again and review its fields.");
  const catalog = new Map(items.map(item => [String(item.id), item]));
  const rules = new Map(mapping.rules.map(rule => [rule.category, rule]));
  for (const rule of mapping.rules) if (!catalog.has(rule.itemId)) throw new Error("A selected catalog item no longer exists.");
  const rows = new Map();
  const held = [];
  const heldKeys = new Set();
  const totals = { raw: table.rows.length, repeated: 0, notCompleted: 0, notMapped: 0, valueNotMatched: 0, needsReview: 0 };
  const seenCategories = new Set();
  table.rows.forEach((values, index) => {
    const row = Object.fromEntries(Object.entries(indexes).map(([key, i]) => [key, String(values[i] ?? "").trim()]));
    seenCategories.add(row.category);
    const rule = rules.get(row.category);
    if (!rule) { totals.notMapped++; return; }
    if (row.completed !== mapping.completedValue) { totals.notCompleted++; return; }
    if (mapping.columns.value ? (!row.value || /^(no|false|0|planned)$/i.test(row.value) || (!rule.anyValue && row.value !== rule.value)) : !rule.anyValue) { totals.valueNotMatched++; return; }
    const dateValue = row.date || row.fallbackDate;
    const date = historyDate(dateValue);
    const invalid = [!receiptId(row.actionId) && "action system ID", mapping.columns.constituentId && !receiptId(row.constituentId) && "constituent system ID",
      !/^[A-Za-z0-9_-]{1,100}$/.test(row.fieldId) && "custom-field Import ID", (!row.name || row.name.length > 240) && "recipient name"].filter(Boolean);
    if (invalid.length) throw new Error(`Query row ${index + 1} needs a valid ${invalid.join(", ")}. Nothing was imported.`);
    const key = `${row.actionId}:${row.fieldId}`;
    if (!date || date > today) {
      if (rows.has(key)) throw new Error(`Query row ${index + 1} conflicts with a dated row for the same action custom field.`);
      heldKeys.add(key); totals.needsReview++;
      if (held.length < 100) held.push({ row: index + 1, name: row.name, actionId: row.actionId, fieldId: row.fieldId, category: row.category,
        dateValue, reason: !dateValue ? "Missing date" : !date ? "Invalid date" : "Future date" });
      return;
    }
    if (heldKeys.has(key)) throw new Error(`Query row ${index + 1} conflicts with an undated or invalid-date row for the same action custom field.`);
    const item = catalog.get(rule.itemId);
    const candidate = { key, actionId: row.actionId, fieldId: row.fieldId, constituentId: row.constituentId,
      name: row.name, itemId: rule.itemId, item: { id: rule.itemId, name: item.name, version: Number(item.version) },
      date, dateBasis: row.date ? mapping.columns.date : mapping.columns.fallbackDate, category: row.category, value: row.value };
    if (rows.has(key)) {
      if (JSON.stringify(rows.get(key)) !== JSON.stringify(candidate)) throw new Error(`Query row ${index + 1} conflicts with another row for the same action custom field. Review the query; no row was chosen automatically.`);
      totals.repeated++;
    } else rows.set(key, candidate);
    if (rows.size > HISTORY_LIMITS.receipts) throw new Error("Import up to 2,000 gift records at a time. Narrow this query by date.");
  });
  if (mapping.rules.some(rule => !seenCategories.has(rule.category))) throw new Error("A selected category was not returned. Review the mappings before continuing.");
  return { rows: [...rows.values()], totals, held, mapping };
}

export function classifyHistoryRows(rows, existing) {
  return rows.map(row => {
    const found = existing.find(item => item.source_key === row.key);
    let status = "new";
    if (found) status = found.item_id === row.itemId && found.constituent_id === row.constituentId && found.received_on === row.date
      ? (found.voided_at ? "corrected" : "existing") : "conflict";
    else if (existing.some(item => item.source_kind === "app" && !item.voided_at && item.item_id === row.itemId &&
      item.constituent_id === row.constituentId && item.received_on === row.date)) status = "possible_app_match";
    return { ...row, status };
  });
}
