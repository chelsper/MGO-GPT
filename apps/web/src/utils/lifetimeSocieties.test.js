import { expect, it } from "vitest";
import { filterLifetimeRows, lifetimeCsv, lifetimeFiscalYear } from "./lifetimeSocieties";
it("uses July-June fiscal years", () => {
  expect(lifetimeFiscalYear("2020-06-30")).toBe("FY20"); expect(lifetimeFiscalYear("2020-07-01")).toBe("FY21");
  expect(lifetimeFiscalYear(null)).toBe("");
});
it("filters locally across names, both identity types, society, status and year", () => {
  const rows = [{ id: '["system","7"]', systemId: "7", lookupId: "ABC", name: "Fictional Donor", societyKey: "1934_club", status: "provisional", date: "2020-07-01" }];
  expect(filterLifetimeRows(rows, { search: "abc", society: "1934_club", year: "FY21" })).toHaveLength(1);
  expect(filterLifetimeRows(rows, { status: "review" })).toHaveLength(0);
});
it("exports explicit provisional labels, preserves blank dates and escapes formulas", () => {
  const csv = lifetimeCsv([{ id: '["system","1"]', systemId: "1", lookupId: "=1+1", name: '+Fictional "Donor"', societyName: "1934 Club", thresholdCents: 10000000,
    date: null, totalCents: null, status: "review", reasons: ["Needs history"] }]);
  expect(csv).toContain("Calculated qualification date (provisional)"); expect(csv).toContain("'\u003d1+1");
  expect(csv).toContain("'+Fictional \"\"Donor\"\""); expect(csv).toContain('"","","","Needs review"');
});
it("never exports the query-local lookup key as a constituent system ID", () => {
  const csv = lifetimeCsv([{ id: '["lookup","00123"]', systemId: null, lookupId: "00123", name: "Fictional Donor", societyName: "1934 Club",
    thresholdCents: 10000000, date: null, totalCents: null, status: "review", reasons: [] }]);
  expect(csv.split("\r\n")[1]).toMatch(/^"","00123","Fictional Donor"/);
  expect(csv).not.toContain("lookup");
});
