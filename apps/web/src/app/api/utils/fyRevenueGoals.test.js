// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Live SQL forbidden"); }) }));
import { aggregateRevenueCsv, inspectRevenueQuery, publishRevenueState, refreshRevenue } from "./fyRevenueGoals";
import { projectionCents, suggestRevenueColumns, validateRevenueSource } from "@/utils/fyRevenueGoals";

const source = { queryId: "31074", queryName: "Eligible gifts", columns: { giftId: "System Record ID", amount: "Gift Amount" }, projection: "remaining", confirmed: true };
const metadata = { id: "31074", name: source.queryName, type: "Gift", select_fields: Object.values(source.columns).map(name => ({ query_field: { selected_field_name: name } })) };
const csv = rows => `System Record ID,Gift Amount,Donor\n${rows}`;
const aggregate = (rows, count, config = source) => aggregateRevenueCsv(csv(rows), config, count);
describe("FY revenue calculation and query validation", () => {
  it("sums whole gifts once even when unrelated output columns repeat", () => {
    expect(aggregate('1,"$1,000.00",A\n1,1000,B\n2,20.05,C', 3)).toEqual({ receivedCents: 102005, projectedCents: 91804, giftCount: 2, rawRows: 3, duplicateRows: 1 });
  });
  it("supports more than the dashboard table's 1,000-row display limit without truncation", () => {
    const rows = Array.from({ length: 1473 }, (_, i) => `${i + 1},10,A`).join("\n");
    expect(aggregate(rows, 1473)).toMatchObject({ giftCount: 1473, receivedCents: 1473000 });
  });
  it("distinguishes a verified empty result from a missing result", () => {
    expect(aggregate("", 0)).toMatchObject({ giftCount: 0, receivedCents: 0, projectedCents: 0 });
    expect(() => aggregate("", null)).toThrow("row count");
    expect(() => aggregate("1,10,A", 2)).toThrow("row count");
  });
  it("keeps negative adjustments, zero gifts, and currency precision", () => {
    expect(aggregate('1,(10.20),A\n2,-0.15,B\n3,0,C', 3)).toMatchObject({ receivedCents: -1035, projectedCents: -931 });
    expect(projectionCents(5, "set_aside")).toBe(1);
    expect(projectionCents(5, "remaining")).toBe(4);
    expect(projectionCents(10000, "set_aside")).toBe(1000);
    expect(projectionCents(10000, "remaining")).toBe(9000);
    expect(projectionCents(Number.MAX_SAFE_INTEGER, "remaining")).toBe(8106479329266892);
  });
  it.each(["", "1.999", "NaN", "12abc", "1e6", "9,00", "9007199254740992", "(-1)"])("rejects invalid amounts %s rather than treating them as zero", amount => {
    expect(() => aggregate(`1,"${amount}",A`, 1)).toThrow();
  });
  it("stops for conflicting duplicate values, invalid IDs, missing headers and unsafe totals", () => {
    expect(() => aggregate("1,10,A\n1,20,A", 2)).toThrow("conflicting");
    expect(() => aggregate(",10,A", 1)).toThrow("system record ID");
    expect(() => aggregateRevenueCsv("Other,Gift Amount\n1,10", source, 1)).toThrow("missing");
    expect(() => aggregate("1,90071992547409,A\n2,90071992547409,B", 2)).toThrow("range");
  });
  it("suggests only unambiguous system IDs and whole-gift amounts", () => {
    expect(suggestRevenueColumns(["Gift ID", "Gift Import ID", "Gift Amount", "System Record ID"])).toEqual({ giftId: "System Record ID", amount: "Gift Amount" });
    expect(suggestRevenueColumns(["System Record ID", "Gift System Record ID", "Pledge Balance"])).toEqual({ giftId: "", amount: "" });
  });
  it.each(["Gift ID", "Fund System Record ID", "Constituent System Record ID", "Gift Split System Record ID"])("rejects %s as gift identity", giftId => {
    expect(() => validateRevenueSource({ ...source, columns: { ...source.columns, giftId } })).toThrow("System Record ID");
  });
  it.each(["Pledge Balance", "Gift Split Amount", "Write-off Amount", "Soft Credit Amount"])("rejects misleading monetary mapping %s", amount => {
    expect(() => validateRevenueSource({ ...source, columns: { ...source.columns, amount } })).toThrow("whole-gift");
  });
  it("validates type, prompts, definition changes and manager confirmation", () => {
    expect(inspectRevenueQuery(metadata, source).suggested).toEqual(source.columns);
    expect(() => inspectRevenueQuery({ ...metadata, type: "Constituent" }, source)).toThrow("Gift query");
    expect(() => inspectRevenueQuery({ ...metadata, has_ask_fields: true }, source)).toThrow("Gift query");
    expect(() => inspectRevenueQuery({ ...metadata, name: "Changed" }, source)).toThrow("changed");
    expect(() => validateRevenueSource({ ...source, confirmed: false })).toThrow("Confirm");
    expect(() => validateRevenueSource({ ...source, projection: "anything" })).toThrow("calculation");
  });
});
describe("atomic revenue refresh", () => {
  function fixture(body = csv("1,100,A")) {
    const db = vi.fn().mockResolvedValueOnce([{ payload: { revision: "before", source, snapshot: { receivedCents: 500 } } }]).mockResolvedValue([{ report_key: "saved" }]);
    const transport = { metadata: vi.fn().mockResolvedValue(metadata), execute: vi.fn().mockResolvedValue({ body: new TextEncoder().encode(body), contentType: "text/csv", queryJobRowCount: 1 }) };
    return { db, transport, input: source, revision: "before", user: { id: 3 } };
  }
  it("publishes verified aggregates and setup together, not donor data", async () => {
    const f = fixture();
    const state = await refreshRevenue(f);
    expect(state.snapshot).toMatchObject({ receivedCents: 10000, projectedCents: 9000, giftCount: 1 });
    expect(state.source).toEqual(source);
    expect(state).not.toHaveProperty("gifts");
    expect(f.transport.metadata).toHaveBeenCalledTimes(2);
    expect(f.db).toHaveBeenCalledTimes(2);
  });
  it("rejects a stale version before running the query", async () => {
    const f = fixture();
    await expect(refreshRevenue({ ...f, revision: "old" })).rejects.toThrow("Reload");
    expect(f.transport.execute).not.toHaveBeenCalled(); expect(f.db).toHaveBeenCalledTimes(1);
  });
  it.each(["invalid CSV", csv("1,bad,A")])("keeps all previous data on a result validation failure", async content => {
    const f = fixture(content);
    await expect(refreshRevenue(f)).rejects.toThrow(); expect(f.db).toHaveBeenCalledTimes(1);
  });
  it("keeps previous totals when metadata changes during refresh or NXT is unavailable", async () => {
    const f = fixture(); f.transport.metadata.mockResolvedValueOnce(metadata).mockResolvedValueOnce({ ...metadata, name: "Changed" });
    await expect(refreshRevenue(f)).rejects.toThrow("changed"); expect(f.db).toHaveBeenCalledTimes(1);
    const g = fixture(); g.transport.execute.mockRejectedValue(new Error("network"));
    await expect(refreshRevenue(g)).rejects.toThrow(); expect(g.db).toHaveBeenCalledTimes(1);
  });
  it("does not overwrite a newer refresh", async () => {
    await expect(publishRevenueState("old", {}, vi.fn().mockResolvedValue([]))).rejects.toMatchObject({ status: 409 });
  });
});
