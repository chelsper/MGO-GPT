import { describe, expect, it } from "vitest";
import { isOpportunityEligibleForImport, opportunityCreatedOn } from "./opportunityImportEligibility";

const now = new Date("2026-10-06T12:00:00Z");
const opportunity = {
  id: "900", constituent_id: "123", purpose: "STEAM", status: "Solicitation",
  date_added: "2026-08-25T12:00:00Z", expected_date: "2026-12-31",
};
const eligible = (patch = {}, at = now) => isOpportunityEligibleForImport({ ...opportunity, ...patch }, at);

describe("opportunity import fiscal-year eligibility", () => {
  it("adds this fiscal year's opportunities regardless of Purpose or Reason", () => {
    expect(eligible()).toBe(true);
    expect(eligible({ purpose: null, reason: "Family interest" })).toBe(true);
    expect(eligible({ purpose: "Scholarship", date_added: "2027-08-01T12:00:00Z" })).toBe(true);
  });

  it("retains the original campaign-purpose rule", () => {
    expect(eligible({ purpose: " Future. Made. Campaign ", date_added: "2020-01-01" })).toBe(true);
    expect(eligible({ purpose: "future. made. campaign", date_added: undefined })).toBe(true);
  });

  it("does not treat an old record's expected date or recent edit as its entry date", () => {
    expect(eligible({ date_added: "2026-06-30T23:59:59-04:00", expected_date: "2028-06-30",
      date_modified: "2026-10-06T12:00:00Z", ask_date: "2026-10-01" })).toBe(false);
  });

  it.each([undefined, null, "", "bad", "2026-02-30T12:00:00Z", "2026-07-01junk", "2026-07-01T00:00:00",
    "2026-07-01T99:00:00Z", 1791288000000, {}])("rejects missing or invalid creation dates: %j", (date_added) => {
    expect(opportunityCreatedOn({ date_added })).toBeNull();
    expect(eligible({ date_added, created_at: "2026-08-25T12:00:00Z", date_modified: "2026-10-01T12:00:00Z" })).toBe(false);
  });

  it("uses JU's fiscal boundary in Eastern time", () => {
    expect(eligible({ date_added: "2026-07-01T03:59:59Z" })).toBe(false);
    expect(eligible({ date_added: "2026-07-01T04:00:00Z" })).toBe(true);
    expect(eligible({ date_added: "2026-07-01T00:00:00-04:00" })).toBe(true);
    expect(eligible({ date_added: "2026-07-01" })).toBe(true);
  });

  it("advances the new-import cutoff with the fiscal year, not the calendar year", () => {
    expect(eligible({}, new Date("2027-01-01T12:00:00Z"))).toBe(true);
    expect(eligible({}, new Date("2027-07-01T03:59:59Z"))).toBe(true);
    expect(eligible({}, new Date("2027-07-01T04:00:00Z"))).toBe(false);
  });

  it.each([
    { inactive: true }, { status: "Funded" }, { status: "Declined" }, { status: "Withdrawn" },
    { status: "Unknown" }, { expected_date: null }, { expected_date: "2027-02-30" },
    { id: null }, { constituent_id: null },
  ])("retains active-status, date, and identity safeguards: %j", (patch) => {
    expect(eligible(patch)).toBe(false);
    expect(eligible({ ...patch, purpose: "Future. Made. Campaign" })).toBe(false);
  });
});
