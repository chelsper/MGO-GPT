import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { buildProspectExport, DEFAULT_EXPORT_COLUMNS, prospectExportCsv, validateExportOptions } from "./prospectExport";

const input = (overrides = {}) => ({ scope: "active", format: "xlsx", ownerIds: [1], columns: DEFAULT_EXPORT_COLUMNS, ...overrides });
const owner = { id: 1, name: "MGO One" };
const prospect = (overrides = {}) => ({ id: 9, user_id: 1, prospect_name: "Example Prospect", status: "Active", portfolio_rank: "3", updated_at: "2026-09-09T12:00:00Z", opportunities: [], ...overrides });
const opportunity = (overrides = {}) => ({ id: 1, title: "Scholarship", opportunity_status: "Active", estimated_amount: "1500.25", expected_date: "2027-06-30", ...overrides });
const build = (records, overrides) => buildProspectExport(records, validateExportOptions(input(overrides)), [owner, { id: 2, name: "MGO Two" }], new Date("2026-09-09T12:00:00Z"));

describe("prospect export model", () => {
  it("keeps one summary row with multiple opportunity rows and excludes closed by default", () => {
    const model = build([prospect({ opportunities: [opportunity(), opportunity({ id: 2 }), opportunity({ id: 3, opportunity_status: "Funded" })] })]);
    expect(model.summary).toHaveLength(1);
    expect(model.opportunities).toHaveLength(2);
    expect(model.summary[0]).toMatchObject({ pipeline: 3000.5, openCount: 2, rank: 3, years: "Open opportunities: FY27" });
    expect(model.opportunities[0]).toMatchObject({ expected: "2027-06-30", fy: "FY27", amount: 1500.25 });
  });
  it("includes closed opportunity detail only when requested, without increasing open pipeline", () => {
    const model = build([prospect({ opportunities: [opportunity({ opportunity_status: "Funded", closed_amount: "1200" })] })], { includeClosedOpportunities: true });
    expect(model.summary[0].pipeline).toBe(0);
    expect(model.opportunities[0].funded).toBe(1200);
  });
  it("does not collapse shared prospects across selected MGOs or conceal shared opportunity identity", () => {
    const model = build([1, 2].map((id) => prospect({ id, user_id: id, opportunities: [opportunity({ blackbaud_opportunity_id: "123" })] })));
    expect(model.summary.map((r) => r.mgo)).toEqual(["MGO One", "MGO Two"]);
    expect(model.opportunities.map((o) => o.sharedKey)).toEqual(["NXT:123", "NXT:123"]);
    expect(model.notes.find(([key]) => key === "Shared prospects")[1]).toContain("do not sum");
  });
  it("resolves placeholder names from saved identity and leaves missing optional data blank", () => {
    const model = build([prospect({ prospect_name: "NXT constituent 123", cached_constituent_name: "Saved Name" })]);
    expect(model.summary[0]).toMatchObject({ name: "Saved Name", latestGiftAmount: null, latestGiftDate: null, email: "" });
    expect(model.columns.some((c) => c.key === "email")).toBe(false);
  });
  it("preserves zero, marks malformed/missing open amounts unknown and never computes a partial total", () => {
    expect(build([prospect({ opportunities: [opportunity({ estimated_amount: "0" })] })]).summary[0].pipeline).toBe(0);
    for (const value of [null, "", " ", false, "bad", "Infinity"]) {
      expect(build([prospect({ opportunities: [opportunity(), opportunity({ estimated_amount: value })] })]).summary[0].pipeline).toBeNull();
    }
  });
  it("uses calendar dates for fiscal boundaries and ignores impossible dates", () => {
    const model = build([prospect({ opportunities: [opportunity({ expected_date: "2026-06-30" }), opportunity({ expected_date: "2026-07-01" }), opportunity({ expected_date: "2026-02-30" })] })]);
    expect(model.opportunities.map((o) => o.fy)).toEqual(["FY26", "FY27", null]);
    expect(model.summary[0].years).toBe("Open opportunities: FY26, FY27, date not set");
  });
  it("keeps a completed next step out of the current action columns", () => {
    const model = build([prospect({ next_action_text: "Done", next_action_due_date: "2026-08-01", next_action_completed_at: "2026-08-02" })]);
    expect(model.summary[0]).toMatchObject({ nextStep: "", due: null, followUp: "No next step" });
  });
  it.each([["2026-09-08", "Overdue"], ["2026-09-09", "Due today"], ["2026-09-10", "Scheduled"], [null, "Date not set"]])("shows next step status for %s", (due, followUp) => {
    expect(build([prospect({ next_action_text: "Call", next_action_due_date: due })]).summary[0].followUp).toBe(followUp);
  });
  it("selects latest known past action, not a future action, and includes provenance dates", () => {
    const model = build([prospect({ cached_action: { data: { date: "2026-10-01", summary: "Future" }, fetchedAt: "2026-09-09T10:00:00Z" },
      latest_local_action: { date: "2026-09-08", summary: "Meeting", category: "Meeting" },
      cached_gift: { data: { date: "2026-08-30", amount: 0 }, fetchedAt: "2026-09-08T10:00:00Z" } })]);
    expect(model.summary[0]).toMatchObject({ latestAction: "Meeting / Meeting", latestActionDate: "2026-09-08", latestGiftAmount: 0, giftAt: "2026-09-08T10:00:00.000Z" });
  });
  it("requires an explicitly selected workspace and validates all options", () => {
    for (const change of [{ ownerIds: [] }, { ownerIds: [1, 2] }, { ownerIds: [-1] }, { ownerIds: ["1 OR 1=1"] }, { columns: ["secret"] }, { scope: "everyone" }, { format: "html" }, { includeInactive: "false" }, { scope: "filtered", prospectIds: [] }, { scope: "master", ownerIds: [1, 1] }]) {
      expect(() => validateExportOptions(input(change))).toThrow();
    }
  });
  it("requires identity columns and automatically accompanies optional caches with freshness", () => {
    const options = validateExportOptions(input({ columns: ["latestGiftAmount", "email", "societies", "latestAction"] }));
    expect(options.columns.map((c) => c.key)).toEqual(expect.arrayContaining(["mgo", "name", "savedAt", "giftAt", "identityAt", "societiesAt", "activityAt"]));
    expect(validateExportOptions(input({ scope: "filtered", prospectIds: [9], includeInactive: true })).includeInactive).toBe(false);
  });
  it("exports a 301-member portfolio without truncating or changing source order", () => {
    const model = build(Array.from({ length: 301 }, (_, index) => prospect({ id: index + 1, portfolio_rank: index + 1 })));
    expect(model.summary).toHaveLength(301);
    expect(model.summary.at(-1).rank).toBe(301);
  });
  it("escapes CSV separators, quotes and formula injection while leaving numbers numeric", () => {
    const model = { columns: [{ key: "name", label: "Name" }, { key: "amount", label: "Amount" }],
      summary: ["=HYPERLINK(1)", " +SUM(1)", "@cmd", "-cmd", "\tcmd", 'Example, "quoted"\nname'].map((name) => ({ name, amount: -20 })) };
    const result = Papa.parse(prospectExportCsv(model), { header: true }).data;
    expect(result.slice(0, 5).every((row) => row.Name.startsWith("'"))).toBe(true);
    expect(result.at(-1).Name).toBe('Example, "quoted"\nname');
    expect(result[0].Amount).toBe("-20");
  });
});
