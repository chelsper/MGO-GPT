import { describe, expect, it } from "vitest";
import { buildPipelineReport, currentPipelineFiscalYear, pipelineAmount, pipelineFiscalWindow, pipelineFiscalYear, pipelineTotals, selectPipelineRows } from "./pipelineReport";

const now = new Date("2026-09-27T12:00:00Z");
const row = (id, overrides = {}) => ({
  id, user_id: 1, prospect_name: `Constituent ${id}`, constituent_name: `Donor ${id}`,
  blackbaud_constituent_id: String(id + 100), title: `Ask ${id}`, current_stage: "Cultivation",
  opportunity_status: "Active", prospect_status: "Active", estimated_amount: "1000.00",
  expected_date: "2027-05-20", updated_at: "2026-09-01T10:00:00Z", ...overrides,
});
const build = (rows) => buildPipelineReport(rows, [{ id: 1, name: "One" }, { id: 2, name: "Two", active: false }], now);

describe("pipeline fiscal years", () => {
  it("uses the July-June end year and the Eastern current day", () => {
    expect(pipelineFiscalYear("2026-06-30")).toBe(2026);
    expect(pipelineFiscalYear("2026-07-01")).toBe(2027);
    expect(currentPipelineFiscalYear(new Date("2026-07-01T03:59:59Z"))).toBe(2026);
    expect(currentPipelineFiscalYear(new Date("2026-07-01T04:00:00Z"))).toBe(2027);
    expect(pipelineFiscalWindow(2027)).toEqual({ year: 2027, label: "FY27", startsOn: "2026-07-01", endsOn: "2027-06-30" });
  });
  it.each([null, "", "2026-02-30", "invalid", "9999-08-01", "1800-01-01"])("does not infer an FY from %s", (value) => {
    expect(pipelineFiscalYear(value)).toBeNull();
  });
  it.each(["all", null, 1899, 9999, 2026.5])("rejects invalid FY windows: %s", (value) => {
    expect(pipelineFiscalWindow(value)).toBeNull();
  });
});

describe("saved pipeline model", () => {
  it("includes all open stages and never substitutes the legacy prospect FY", () => {
    const report = build([row(1), row(2, { current_stage: "Custom open stage" }), row(3, { expected_date: null, expected_close_fy: "FY27", close_date: "2026-09-01" })]);
    expect(report.currentYear).toBe(2027);
    expect(report.years).toEqual([2028, 2027, 2026]);
    expect(selectPipelineRows(report.opportunities, { year: 2027 }).map((item) => item.id)).toEqual(["1", "2"]);
    expect(report.opportunities[0].constituentName).toBe("Donor 1");
    expect(report.opportunities[2]).toMatchObject({ fiscalYear: null, yearBasis: "undated", status: "Active" });
  });
  it.each([
    ["Funded", "Cultivation", "Funded"], ["Active", "Closed - Gift Secured", "Funded"],
    ["Declined", "Solicitation", "Declined"], ["Active", "Closed – Declined", "Declined"],
    ["Withdrawn", "Cultivation", "Withdrawn"], ["Active", "Closed - Withdrawn", "Withdrawn"],
    ["Archived", "Cultivation", "Archived"], ["Inactive", "Cultivation", "Archived"],
  ])("separates %s / %s as %s", (status, stage, expected) => {
    const [item] = build([row(1, { opportunity_status: status, current_stage: stage })]).opportunities;
    expect(item.status).toBe(expected);
    expect(selectPipelineRows([item], { year: 2027 })).toEqual([]);
    expect(selectPipelineRows([item], { year: 2027, view: "archive" })).toEqual([item]);
  });
  it("uses the expected date first, with a labeled close-date fallback for closed records only", () => {
    const report = build([
      row(1, { opportunity_status: "Funded", closed_amount: "800", close_date: "2025-06-30" }),
      row(2, { opportunity_status: "Declined", expected_date: null, close_date: "2025-06-30" }),
      row(3, { opportunity_status: "Withdrawn", expected_date: null, close_date: null }),
    ]);
    expect(report.opportunities[0]).toMatchObject({ fiscalYear: 2027, yearBasis: "expected", fundedAmount: 800 });
    expect(report.opportunities[1]).toMatchObject({ fiscalYear: 2025, yearBasis: "closed", fundedAmount: null });
    expect(selectPipelineRows(report.opportunities, { year: "all", view: "archive" })).toHaveLength(2);
    expect(selectPipelineRows(report.opportunities, { year: 2027, view: "undated" })).toHaveLength(1);
  });
  it("collapses transitive shared/NXT identities, chooses the latest check/edit and combines all owners", () => {
    const report = build([
      row(1, { blackbaud_opportunity_id: "900", shared_opportunity_key: "joint", updated_at: "2026-09-10T00:00:00Z" }),
      row(2, { blackbaud_constituent_id: "101", shared_opportunity_key: "joint", user_id: 2 }),
      row(3, { blackbaud_constituent_id: "101", blackbaud_opportunity_id: "900", nxt_checked_at: "2026-09-20T00:00:00Z", estimated_amount: "25000", joint_mgo_user_ids: '[2,"3"]' }),
    ]);
    expect(report.copiesCollapsed).toBe(2);
    expect(report.opportunities).toHaveLength(1);
    expect(report.opportunities[0]).toMatchObject({ id: "3", amount: 25000, copyCount: 3, identityConflict: false, savedAt: "2026-09-20T00:00:00.000Z" });
    expect(report.opportunities[0].fundraisers.map((owner) => owner.id)).toEqual(["1", "2", "3"]);
    expect(pipelineTotals(selectPipelineRows(report.opportunities, { year: 2027, owner: "2" })).knownAmount).toBe(25000);
  });
  it("does not collapse separate opportunities with the same donor and title", () => {
    const report = build([row(1), row(2, { blackbaud_constituent_id: "101", title: "Ask 1", prospect_name: "Donor 1" })]);
    expect(report.opportunities).toHaveLength(2);
    expect(pipelineTotals(report.opportunities).knownAmount).toBe(2000);
  });
  it.each([
    [{ blackbaud_constituent_id: "202" }, {}],
    [{ blackbaud_opportunity_id: "900" }, { blackbaud_opportunity_id: "901" }],
  ])("holds conflicting shared identities out of year totals", (first, second) => {
    const report = build([row(1, { shared_opportunity_key: "joint", ...first }), row(2, { blackbaud_constituent_id: "101", shared_opportunity_key: "joint", ...second })]);
    expect(report.opportunities[0]).toMatchObject({ identityConflict: true, fiscalYear: null, amount: null, constituentId: null, nxtOpportunityId: null });
    expect(selectPipelineRows(report.opportunities, { year: "all" })).toEqual([]);
    expect(selectPipelineRows(report.opportunities, { year: 2027, view: "undated" })).toHaveLength(1);
  });
  it("keeps prospect-only archives out of active but preserves an active joint copy", () => {
    const archived = row(1, { prospect_status: "Archived", shared_opportunity_key: "joint" });
    expect(build([archived]).opportunities[0].status).toBe("Archived");
    expect(build([archived, row(2, { shared_opportunity_key: "joint", blackbaud_constituent_id: "101" })]).opportunities[0].status).toBe("Active");
  });
  it("keeps unknown amounts distinct from zero and sums cents", () => {
    expect(pipelineTotals([{ amount: "0.10" }, { amount: "0.20" }, { amount: null }, { amount: 0 }])).toEqual({ count: 4, knownAmount: 0.3, unknownCount: 1 });
    for (const value of ["", null, undefined, false, -1, "garbage", Infinity, "1,000", Number.MAX_SAFE_INTEGER]) expect(pipelineAmount(value)).toBeNull();
    expect(pipelineTotals([{ amount: 90000000000000 }, { amount: 90000000000000 }]).knownAmount).toBeNull();
  });
  it("filters and sorts saved data without changing the source rows", () => {
    const { opportunities } = build([row(1), row(2, { estimated_amount: 3000, current_stage: "Solicitation", user_id: 2 }), row(3, { expected_date: "2028-01-01", estimated_amount: null })]);
    expect(selectPipelineRows(opportunities, { year: 2027, search: "TWO", stage: "Solicitation" }).map((item) => item.id)).toEqual(["2"]);
    expect(selectPipelineRows(opportunities, { year: "all", sort: "amount" }).map((item) => item.id)).toEqual(["2", "1", "3"]);
    expect(opportunities.map((item) => item.id)).toEqual(["1", "2", "3"]);
  });
});
