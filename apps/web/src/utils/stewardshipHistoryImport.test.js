import { expect, it } from "vitest";
import { HISTORY_COLUMNS, historyDate, historyMapping, prepareHistoryRows, classifyHistoryRows } from "./stewardshipHistoryImport";
const columns = Object.fromEntries(Object.keys(HISTORY_COLUMNS).map(key => [key, key]));
const mapping = { columns, rules: [{ category: "Blanket", itemId: "1", value: "Yes", anyValue: false }], completedValue: "Yes", confirmed: true };
const items = [{ id: "1", name: "JU Blanket", version: 1 }];
const row = ["100", "Example Donor", "10", "20", "Blanket", "Yes", "Yes", "9/20/2026"];
const table = rows => ({ headers: Object.keys(columns), rows });
const prepare = rows => prepareHistoryRows(table(rows), mapping, items, "2026-10-01");
it("consolidates repeated attributes without collapsing separate gifts for the same constituent", () => {
  const result = prepare([row, row, [...row.slice(0,2), "11", "21", ...row.slice(4)]]);
  expect(result.rows.map(row => row.key)).toEqual(["10:20", "11:21"]);
  expect(result.totals.repeated).toBe(1);
  expect(result.rows[0].date).toBe("2026-09-20");
});
it("never treats an uncompleted action, empty marker, unmapped category or unaccepted value as received", () => {
  const changed = (index, value) => row.map((cell,i) => i===index ? value : cell);
  const result = prepare([changed(6,"No"), changed(5,""), changed(4,"Workflow"), changed(5,"No")]);
  expect(result.rows).toEqual([]);
  expect(result.totals).toMatchObject({ notCompleted: 1, notMapped: 1, valueNotMatched: 2 });
});
it.each([[0,"ABC"],[2,"0"],[3,""],[1,""]])("fails closed on invalid identity field %s", (index,value) => {
  expect(() => prepare([row.map((cell,i) => i===index ? value : cell)])).toThrow();
});
it.each([["", "Missing date"], ["2/30/2026", "Invalid date"], ["2026-12-01", "Future date"]])("holds %s dates without blocking distinct valid records", (value, reason) => {
  const invalid = [...row]; invalid[2] = "11"; invalid[7] = value;
  const result = prepare([row, invalid]);
  expect(result.rows).toHaveLength(1);
  expect(result.totals.needsReview).toBe(1);
  expect(result.held[0]).toMatchObject({ row: 2, actionId: "11", reason });
});
it("never silently picks a dated row when the same source also has an invalid date", () => {
  const invalid = [...row]; invalid[7] = "";
  expect(() => prepare([row, invalid])).toThrow(/conflicts/);
  expect(() => prepare([invalid, row])).toThrow(/conflicts/);
});
it("uses an explicitly mapped fallback only for a blank primary date and records its source", () => {
  const values = [...row]; values[7] = ""; values[8] = "2026-09-21";
  const result = prepare([values]);
  expect(result.rows[0]).toMatchObject({ date: "2026-09-21", dateBasis: "fallbackDate" });
  values[7] = "bad date";
  expect(prepare([values]).held[0].reason).toBe("Invalid date");
  values[7] = "2026-09-20";
  expect(prepare([values]).rows[0]).toMatchObject({ date: "2026-09-20", dateBasis: "date" });
});
it("requires reviewed distinct returned fields and valid item mappings", () => {
  expect(historyMapping({ ...mapping, confirmed: false })).toBeNull();
  expect(historyMapping({ ...mapping, columns: { ...columns, actionId: "constituentId" } })).toBeNull();
  expect(() => prepareHistoryRows(table([row]), mapping, [], "2026-10-01")).toThrow(/no longer exists/);
  expect(() => prepareHistoryRows({ ...table([row]), headers: [] }, mapping, items, "2026-10-01")).toThrow(/missing/);
});
it("rejects conflicting rows rather than selecting the first one", () => {
  expect(() => prepare([row, row.map((cell,i) => i===0 ? "101" : cell)])).toThrow(/conflicts/);
});
it("allows archived items and any-populated-value mode only with explicit mapping confirmation", () => {
  const result = prepareHistoryRows(table([row]), { ...mapping, rules: [{ category: "Blanket", itemId: "1", anyValue: true }] }, [{ ...items[0], archived_at: "2026-01-01" }], "2026-10-01");
  expect(result.rows).toHaveLength(1);
});
it("classifies source duplicates, corrections, conflicts and possible app overlaps separately", () => {
  const [candidate] = prepare([row]).rows;
  const stored = { source_key:"10:20",source_kind:"nxt_history",item_id:"1",constituent_id:"100",received_on:"2026-09-20" };
  expect(classifyHistoryRows([candidate], [stored])[0].status).toBe("existing");
  expect(classifyHistoryRows([candidate], [{ ...stored,voided_at:"now" }])[0].status).toBe("corrected");
  expect(classifyHistoryRows([candidate], [{ ...stored,item_id:"2" }])[0].status).toBe("conflict");
  expect(classifyHistoryRows([candidate], [{ ...stored,source_key:null,source_kind:"app" }])[0].status).toBe("possible_app_match");
  expect(classifyHistoryRows([candidate], [])[0].status).toBe("new");
});
it("validates real dates without guessing ambiguous non-US formats", () => {
  expect(historyDate("2024-02-29")).toBe("2024-02-29");
  expect(historyDate("2025-02-29")).toBeNull();
  expect(historyDate("09/20/2026")).toBe("2026-09-20");
  expect(historyDate("20/09/2026")).toBeNull();
});
it("accepts compound custom-field Import IDs without substituting an action import ID", () => {
  const values = [...row]; values[3] = "00001-505-0000012345";
  expect(prepare([values]).rows[0].key).toBe("10:00001-505-0000012345");
});
it("requires explicit reviewed field presence when no value column exists", () => {
  const noValue = { ...mapping, columns: { ...columns, value: "" } };
  expect(prepareHistoryRows(table([row]), noValue, items, "2026-10-01").rows).toHaveLength(0);
  expect(prepareHistoryRows(table([row]), { ...noValue, rules: [{ ...mapping.rules[0], anyValue: true }] }, items, "2026-10-01").rows).toHaveLength(1);
});
it("does not allow No as completed or false/planned gift markers even with an any-value rule", () => {
  expect(historyMapping({ ...mapping, completedValue: "No" })).toBeNull();
  for (const value of ["No", "False", "0", "Planned"]) {
    const values = [...row]; values[5] = value;
    expect(prepareHistoryRows(table([values]), { ...mapping, rules: [{ ...mapping.rules[0], anyValue: true }] }, items, "2026-10-01").rows).toHaveLength(0);
  }
});
it("imports explicitly approved missing dates as null but continues holding malformed and future dates", () => {
  const undated = [...row]; undated[7] = "";
  const approved = { ...mapping, allowUndated: true };
  expect(prepareHistoryRows(table([undated]), approved, items, "2026-10-01").rows[0]).toMatchObject({ date: null, dateBasis: null });
  expect(prepare([undated]).held[0].reason).toBe("Missing date");
  for (const date of ["invalid", "2026-12-01"]) {
    undated[7] = date;
    expect(prepareHistoryRows(table([undated]), approved, items, "2026-10-01").rows).toHaveLength(0);
  }
});
it("keeps null-date source deduplication and conflict detection strict", () => {
  const candidate = { key: "10:20", itemId: "1", constituentId: "100", date: null };
  const saved = { source_key: "10:20", item_id: "1", constituent_id: "100", received_on: null };
  expect(classifyHistoryRows([candidate], [saved])[0].status).toBe("existing");
  expect(classifyHistoryRows([candidate], [{ ...saved, received_on: "2026-09-20" }])[0].status).toBe("conflict");
  expect(classifyHistoryRows([candidate], [{ ...saved, source_key: null, source_kind: "app", received_on: "2026-09-20" }])[0].status).toBe("possible_app_match");
});
