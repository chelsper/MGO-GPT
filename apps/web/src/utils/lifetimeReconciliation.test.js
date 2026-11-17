import { expect, it } from "vitest";
import { lifetimeReconciliationCsv, lifetimeReconciliationNeeds, lifetimeReconciliationSummary } from "./lifetimeReconciliation";
const complex = type => ({ giftId: "101", type, outcome: "review", reasons: ["Pledges, payments, write-offs or other complex gifts need linked history reconciliation."] });
it.each([
  ["Pledge", "pledge"], ["Pledge Payment", "payment"], ["Pay-Stock/Property", "payment"],
  ["Matching Gift Pledge", "matching"], ["Matching Gift Pledge Payment", "matching"], ["MatchingGiftPayment", "matching"], ["MG-Pledge", "matching"],
  ["Pledge Write-Off", "write_off"], ["Matching Gift Write-Off", "write_off"], ["Gift Adjustment", "write_off"],
  ["Planned Gift", "planned"], ["Stock/Property (Sold)", "stock_sale"], ["Recurring Gift", "recurring"], ["Unknown", "other"],
])("requests specific evidence without changing treatment: %s", (type, code) => {
  const item = complex(type), before = JSON.stringify(item);
  expect(lifetimeReconciliationNeeds(item)).toEqual([expect.objectContaining({ code, evidence: expect.any(String) })]);
  expect(JSON.stringify(item)).toBe(before);
});
it("never promotes excluded employee credit or supported gifts to a reconciliation task", () => {
  for (const outcome of ["excluded", "counted"]) expect(lifetimeReconciliationNeeds({ ...complex("Pledge"), outcome })).toEqual([]);
});
it("keeps multiple issues on one gift and counts each issue only once", () => {
  const item = { ...complex("Pledge"), reasons: [...complex("Pledge").reasons, "A gift date is missing, invalid or in the future.",
    "A gift date is invalid.", "A missing, invalid or negative gift amount needs review.", "Repeated gift records conflict; reconcile amounts, dates, types or ownership.",
    "An unrecognized credit flag needs review."] };
  expect(lifetimeReconciliationNeeds(item).map(need => need.code)).toEqual(["pledge", "date", "amount", "conflict", "credit"]);
  expect(lifetimeReconciliationSummary([item, { ...complex("Pledge"), giftId: "102" }])).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "pledge", gifts: 2 }), expect.objectContaining({ code: "date", gifts: 1 }),
  ]));
});
it("exports unresolved records only, quotes cells and neutralizes spreadsheet formulas", () => {
  const csv = lifetimeReconciliationCsv({ row: { name: '=HYPERLINK("unsafe")', lookupId: "DEMO-1", societyName: "1934 Club", status: "confirmed", date: "2000-01-01" },
    asOf: "2026-11-17", refreshedAt: "2026-11-17T12:00:00Z", items: [
      { ...complex("Pledge"), cents: 12345, day: "2020-01-01", credits: [{ recipients: ["@Example"], flag: "Regular Gift" }] },
      { ...complex("Cash"), outcome: "counted", credits: [] }, { ...complex("Pledge"), outcome: "excluded", credits: [] },
    ] });
  expect(csv.split("\r\n")).toHaveLength(2);
  expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"'); expect(csv).toContain('"\'@Example"');
  expect(csv).toContain('"123.45"'); expect(csv).toContain('"2000-01-01"');
  expect(csv).toContain("NOT additive"); expect(csv).toContain("Not an NXT import template");
});
