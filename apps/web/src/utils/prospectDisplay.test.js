import { describe, expect, it } from "vitest";
import {
  fiscalYearForOpportunityDate,
  getProspectFiscalYearLabel,
  isPlaceholderProspectName,
  matchesProspectFiscalYear,
  withProspectDisplayData,
} from "./prospectDisplay";

describe("prospect display data", () => {
  it.each([
    ["2026-06-30", "FY26"],
    ["2026-07-01", "FY27"],
    ["2027-06-30T04:00:00.000Z", "FY27"],
    ["2027-07-01", "FY28"],
    [null, null],
    ["", null],
    ["not a date", null],
  ])("uses the July-June year for %s", (date, expected) => {
    expect(fiscalYearForOpportunityDate(date)).toBe(expected);
  });

  it("uses open opportunity dates instead of an older prospect planning year", () => {
    const prospect = withProspectDisplayData({ status: "Active", expected_close_fy: "FY26" }, [
      { opportunity_status: "Closed – Gift Secured", expected_date: "2026-06-30" },
      { opportunity_status: "Active", expected_date: "2027-06-30" },
    ]);
    expect(getProspectFiscalYearLabel(prospect)).toBe("Open opportunities: FY27");
    expect(matchesProspectFiscalYear(prospect, "FY27")).toBe(true);
    expect(matchesProspectFiscalYear(prospect, "FY26")).toBe(false);
    expect(prospect.expected_close_fy).toBe("FY26");
  });

  it("deduplicates and sorts years and keeps undated opportunities visible", () => {
    const prospect = withProspectDisplayData({
      status: "Active", open_opportunity_dates: ["2028-02-01", "2027-06-01", "2027-06-30", null],
    });
    expect(getProspectFiscalYearLabel(prospect)).toBe("Open opportunities: FY27, FY28, date not set");
    expect(matchesProspectFiscalYear(prospect, "FY28")).toBe(true);
    expect(matchesProspectFiscalYear(prospect, "all")).toBe(true);
  });

  it("does not invent a fiscal year when dates are missing or data is unavailable", () => {
    expect(getProspectFiscalYearLabel(withProspectDisplayData({ status: "Active", open_opportunity_dates: [null] })))
      .toBe("Open opportunities: date not set");
    expect(getProspectFiscalYearLabel(withProspectDisplayData({ status: "Active", open_opportunity_dates: [] })))
      .toBe("No open opportunities");
    expect(getProspectFiscalYearLabel({ status: "Active", expected_close_fy: "FY26" }))
      .toBe("Open opportunity years unavailable");
  });

  it("preserves historical closed-prospect labels", () => {
    const prospect = { status: "Closed – Gift Secured", expected_close_fy: "FY26" };
    expect(getProspectFiscalYearLabel(prospect)).toBe("FY26");
    expect(matchesProspectFiscalYear(prospect, "FY26")).toBe(true);
  });

  it("uses cached identity even when optional summary enrichment is incomplete", () => {
    const original = {
      prospect_name: "NXT constituent 123", linked_constituent_name: "NXT constituent 123",
      cached_constituent_name: "Alex Prospect", data_complete: false, last_error_stage: "optional_enrichment",
    };
    const prospect = withProspectDisplayData(original);
    expect(prospect.prospect_name).toBe("Alex Prospect");
    expect(prospect.name_status).toBe("loaded");
    expect(prospect.cached_constituent_name).toBeUndefined();
    expect(original.prospect_name).toBe("NXT constituent 123");
  });

  it("retains an intentionally saved name and falls back to summary identity if needed", () => {
    expect(withProspectDisplayData({ prospect_name: "Preferred prospect name", cached_constituent_name: "NXT name" }).prospect_name)
      .toBe("Preferred prospect name");
    expect(withProspectDisplayData({ prospect_name: "Constituent 123", cached_summary_name: "Alex Prospect" }).prospect_name)
      .toBe("Alex Prospect");
    expect(withProspectDisplayData({ prospect_name: "NXT constituent 123", cached_constituent_name: "" }).name_status)
      .toBe("unavailable");
  });

  it.each(["NXT constituent 123", "Constituent 123", "Unnamed constituent", "", null])("recognizes placeholder %s", (name) => {
    expect(isPlaceholderProspectName(name)).toBe(true);
  });
});
