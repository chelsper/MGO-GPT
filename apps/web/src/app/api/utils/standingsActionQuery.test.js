import { describe, expect, it } from "vitest";
import { buildStandingsActionQuery } from "./standingsActionQuery";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

const input = { fundraiserIds: ["101", "102", "101"], startsOn: "2026-07-01", endsOn: "2027-06-30" };
describe("scoped standings action queries", () => {
  it("filters the action date AND the action solicitors on Blackbaud, not constituent assignments", () => {
    const query = buildStandingsActionQuery(input);
    expect(query.filter.filter_items).toEqual([
      { field: { field_id: "action_date", operator: "Equal", value: { value: {
        date_range_type: "SpecificRange", start_date: "2026-07-01T00:00:00+00:00", end_date: "2027-06-30T23:59:59+00:00",
      } } } },
      { collection_field: { field_id: "fundraisers", filter_fields: [
        { field_id: "fundraisers.system_record_id", operator: "OneOf", value: { value: [{ id: "101", label: "101" }, { id: "102", label: "102" }] }, is_aggregate: false },
      ] } },
    ]);
    expect(JSON.stringify(query)).not.toMatch(/last_modified|date_added|constituent_fundraisers/);
    expect(query.output.items).toContainEqual({ field_id: "type.description" });
    expect(query.output.items).toContainEqual({ field_id: "category" });
  });
  it("retrieves only the two fiscal years, independently of the YTD cutoff", () => {
    const periods = getStandingsPeriods(new Date("2026-09-04T15:00:00Z"));
    expect(periods.actionFiscalYears).toEqual([
      { label: "FY27", startsOn: "2026-07-01", endsOn: "2027-06-30" },
      { label: "FY26", startsOn: "2025-07-01", endsOn: "2026-06-30" },
    ]);
    expect(periods.current.endsOn).toBe("2026-09-04");
    expect(periods.prior.endsOn).toBe("2025-09-04");
  });
  it.each([{ fundraiserIds: [] }, { fundraiserIds: [""] }, { fundraiserIds: ["someone"] }, { fundraiserIds: ["101", "bad"] }])("rejects missing or invalid mappings rather than running an unfiltered query: %j", ({ fundraiserIds }) => {
    expect(() => buildStandingsActionQuery({ ...input, fundraiserIds })).toThrow("solicitor system IDs");
  });
  it.each([
    { startsOn: "2026-02-30" }, { endsOn: "invalid" }, { startsOn: "2028-07-01" },
  ])("rejects invalid date windows: %j", (window) => {
    expect(() => buildStandingsActionQuery({ ...input, ...window })).toThrow("date range");
  });
});
