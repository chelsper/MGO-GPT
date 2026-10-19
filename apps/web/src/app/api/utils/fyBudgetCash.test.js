// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Live SQL forbidden"); }) }));
import { aggregateBudgetCashCsv, BUDGET_CASH_CACHE_KEY, inspectBudgetCashQuery, refreshBudgetCash } from "./fyBudgetCash";
import { budgetFundGroup, defaultBudgetFundNames, suggestBudgetColumns, validateBudgetCashSource } from "@/utils/fyBudgetCash";

const source = { queryId: "31075", queryName: "Budget Relieving Cash - JUMGOGPT", mode: "gift", confirmed: true,
  columns: { giftId: "System Record ID", fundId: "Fund System Record ID", fundName: "Fund Description", amount: "Gift Amount" }, fundNames: defaultBudgetFundNames() };
const splitSource = { ...source, mode: "split", columns: { ...source.columns, splitId: "Gift Split System Record ID", amount: "Gift Split Amount" } };
const metadata = config => ({ id: "31075", name: config.queryName, type: "Gift", select_fields: Object.values(config.columns).map(name => ({ query_field: { selected_field_name: name } })) });
const csv = (rows, config = source) => `${Object.values(config.columns).join(",")}\n${rows}`;
const aggregate = (rows, count, config = source) => aggregateBudgetCashCsv(csv(rows, config), config, count);
describe("Budget cash source and named funds", () => {
  it("defaults to the five requested fund names and keeps every other fund in Other Scholarships", () => {
    expect(budgetFundGroup("  JU\u2019s Greatest Needs  ", source.fundNames)).toBe("greatest_needs");
    expect(budgetFundGroup("future made impact fund", source.fundNames)).toBe("impact");
    expect(budgetFundGroup("JU Scholarship Funds", source.fundNames)).toBe("other");
    expect(budgetFundGroup("Other Non-Scholarship Fund", source.fundNames)).toBe("other");
    expect(budgetFundGroup("Parents Fund", { ...source.fundNames, parent: "Parents Fund" })).toBe("parent");
    expect(validateBudgetCashSource(source)).toEqual(source);
    expect(validateBudgetCashSource(splitSource)).toEqual(splitSource);
  });
  it("suggests only unambiguous output mappings for the selected amount basis", () => {
    expect(suggestBudgetColumns(Object.values(source.columns))).toEqual({ ...source.columns, splitId: "" });
    expect(suggestBudgetColumns(Object.values(splitSource.columns), "split")).toEqual(splitSource.columns);
    expect(suggestBudgetColumns([...Object.values(source.columns), "Gift System Record ID", "Fund Name"])).toMatchObject({ giftId: "", fundName: "" });
  });
  it.each([
    { queryId: "31074" }, { confirmed: false }, { mode: "all" }, { userId: 7 },
    { fundNames: { ...source.fundNames, parent: "JU's Greatest Needs" } },
    { columns: { ...source.columns, giftId: "Gift ID" } },
    { columns: { ...source.columns, fundId: "Fund ID" } },
    { columns: { ...source.columns, amount: "Pledge Balance" } },
    { columns: { ...source.columns, amount: "Gift Split Amount" } },
    { columns: { ...source.columns, amount: "Write-off Amount" } },
  ])("rejects invalid or unsafe mappings %j", changes => expect(() => validateBudgetCashSource({ ...source, ...changes })).toThrow());
  it("requires split identity and allocation amounts in split mode", () => {
    expect(() => validateBudgetCashSource({ ...source, mode: "split" })).toThrow();
    expect(() => validateBudgetCashSource({ ...splitSource, columns: { ...splitSource.columns, amount: "Gift Amount" } })).toThrow("fund-split");
  });
  it("checks the fixed query ID, name, type and output fields", () => {
    expect(inspectBudgetCashQuery(metadata(source), source)).toMatchObject({ queryId: "31075", suggested: { ...source.columns, splitId: "" } });
    expect(() => inspectBudgetCashQuery({ ...metadata(source), id: "31074" }, source)).toThrow();
    expect(() => inspectBudgetCashQuery({ ...metadata(source), name: "Changed" }, source)).toThrow();
    expect(() => inspectBudgetCashQuery({ ...metadata(source), type: "Constituent" }, source)).toThrow();
  });
});
describe("Budget cash aggregation", () => {
  it("reconciles the six rows to the total and counts duplicated query rows only once", () => {
    const rows = Object.values(source.fundNames).map((name, i) => `${i + 1},${i + 101},${name},10`).concat(["6,106,Named Endowment,20", "7,107,Another Fund,30", "1,101,JU's Greatest Needs,10"]);
    const result = aggregate(rows.join("\n"), 8);
    expect(result).toMatchObject({ receivedCents: 10000, giftCount: 7, allocationCount: 7, rawRows: 8, duplicateRows: 1 });
    expect(result.groups.map(group => group.receivedCents)).toEqual([1000, 1000, 1000, 1000, 1000, 5000]);
    expect(result.groups.reduce((sum, group) => sum + group.receivedCents, 0)).toBe(result.receivedCents);
    expect(result.funds.reduce((sum, fund) => sum + fund.receivedCents, 0)).toBe(result.receivedCents);
    expect(result).not.toHaveProperty("gifts");
  });
  it("supports multiple allocations without repeating whole gift amounts or overall gift counts", () => {
    const result = aggregate("1,101,JU Parent Fund,25,201\n1,102,JU Scholarship Fund,75,202\n1,102,JU Scholarship Fund,75,202", 3, splitSource);
    expect(result).toMatchObject({ receivedCents: 10000, giftCount: 1, allocationCount: 2, duplicateRows: 1 });
    expect(result.groups.find(group => group.key === "parent").receivedCents).toBe(2500);
    expect(result.groups.find(group => group.key === "scholarship").receivedCents).toBe(7500);
  });
  it("distinguishes a completed empty query from missing or incomplete results", () => {
    expect(aggregate("", 0)).toMatchObject({ receivedCents: 0, giftCount: 0, funds: [] });
    expect(aggregate("", 0).groups).toHaveLength(6);
    expect(() => aggregate("", null)).toThrow("row count");
    expect(() => aggregate("1,101,Fund,10", 2)).toThrow("count");
    expect(() => aggregateBudgetCashCsv("Other,Amount\n1,10", source, 1)).toThrow("missing");
  });
  it("keeps precise cents, negative adjustments and zero gifts", () => {
    const result = aggregate("1,101,JU Parent Fund,10.05\n2,101,JU Parent Fund,(5.20)\n3,102,Fund,0", 3);
    expect(result).toMatchObject({ receivedCents: 485, giftCount: 3 });
  });
  it.each([
    "1,101,Fund,10\n1,102,Another Fund,10", "1,101,Fund,10\n1,101,Fund,20",
    "1,101,Fund,10\n2,101,Different Name,10", "1,101,,10", ",101,Fund,10", "1,Fund Code,Fund,10", "1,101,Fund,not-money",
  ])("rejects conflicting or incomplete records instead of publishing partial totals: %s", rows => expect(() => aggregate(rows, rows.split("\n").length)).toThrow());
  it("rejects a split tied to different gifts, conflicting split amounts, and unsafe totals", () => {
    expect(() => aggregate("1,101,Fund,10,201\n2,101,Fund,10,201", 2, splitSource)).toThrow("conflicting gift IDs");
    expect(() => aggregate("1,101,Fund,10,201\n1,101,Fund,20,201", 2, splitSource)).toThrow("conflicting");
    expect(() => aggregate("1,101,Fund,90071992547409\n2,101,Fund,90071992547409", 2)).toThrow("range");
  });
  it("does not truncate after the usual dashboard display limit", () => {
    const rows = Array.from({ length: 1500 }, (_, i) => `${i + 1},101,JU Parent Fund,10`).join("\n");
    expect(aggregate(rows, 1500)).toMatchObject({ receivedCents: 1500000, giftCount: 1500 });
  });
});
describe("Atomic budget cash refresh", () => {
  function fixture() {
    return { input: source, revision: "before", user: { id: 3 },
      db: vi.fn().mockResolvedValueOnce([{ payload: { revision: "before", source, snapshot: { receivedCents: 500 } } }]).mockResolvedValue([{ report_key: BUDGET_CASH_CACHE_KEY }]),
      transport: { metadata: vi.fn().mockResolvedValue(metadata(source)), execute: vi.fn().mockResolvedValue({ body: new TextEncoder().encode(csv("1,101,JU Parent Fund,100")), contentType: "text/csv", queryJobRowCount: 1 }) } };
  }
  it("publishes source and verified totals together in the isolated cash snapshot", async () => {
    const f = fixture(); const result = await refreshBudgetCash(f);
    expect(result.snapshot).toMatchObject({ receivedCents: 10000, giftCount: 1 });
    expect(result.source).toEqual(source);
    expect(f.transport.metadata).toHaveBeenCalledTimes(2);
    expect(f.db).toHaveBeenCalledTimes(2);
    expect(f.db.mock.calls.every(call => call.includes(BUDGET_CASH_CACHE_KEY))).toBe(true);
  });
  it("rejects stale refreshes before query execution", async () => {
    const f = fixture(); await expect(refreshBudgetCash({ ...f, revision: "old" })).rejects.toMatchObject({ status: 409 });
    expect(f.transport.execute).not.toHaveBeenCalled(); expect(f.db).toHaveBeenCalledTimes(1);
  });
  it("preserves totals when NXT fails, result counts differ or metadata changes", async () => {
    for (const failure of ["network", "count", "metadata"]) {
      const f = fixture();
      if (failure === "network") f.transport.execute.mockRejectedValue(new Error("network"));
      if (failure === "count") f.transport.execute.mockResolvedValue({ body: new TextEncoder().encode(csv("1,101,Fund,10")), contentType: "text/csv", queryJobRowCount: 2 });
      if (failure === "metadata") f.transport.metadata.mockResolvedValueOnce(metadata(source)).mockResolvedValueOnce({ ...metadata(source), name: "Changed" });
      await expect(refreshBudgetCash(f)).rejects.toThrow(); expect(f.db).toHaveBeenCalledTimes(1);
    }
  });
});
