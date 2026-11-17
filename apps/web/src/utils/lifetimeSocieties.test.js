import { expect, it } from "vitest";
import { filterLifetimeRows, lifetimeActiveGroupIds, lifetimeConstituentType, lifetimeCoverage, lifetimeCsv, lifetimeFiscalYear, lifetimeHouseholdRows, lifetimeTypeLabel } from "./lifetimeSocieties";
it("uses July-June fiscal years", () => {
  expect(lifetimeFiscalYear("2020-06-30")).toBe("FY20"); expect(lifetimeFiscalYear("2020-07-01")).toBe("FY21");
  expect(lifetimeFiscalYear(null)).toBe("");
});
it("automatically replaces verified spouse members, respects separation and keeps organizational rows visible", () => {
  const members = [{ id: "1", name: "Fictional A", lookupId: "A1" }, { id: "2", name: "Fictional B", lookupId: "B2" }];
  const combined = { id: "group:demo", name: "Fictional Spouses", members, constituentType: "individual", groupBasis: "spouse", thresholdCents: 10000000, reasons: [] };
  const company = { id: "3", name: "Fictional Company", constituentType: "organization" };
  const snapshot = { rows: [...members, company], sharedGroups: [{ id: "demo", automatic: true, members, rows: [combined] }], confirmedGroupIds: [] };
  expect([...lifetimeActiveGroupIds(snapshot)]).toEqual(["demo"]);
  expect(lifetimeHouseholdRows(snapshot)).toEqual([company, combined]);
  expect(filterLifetimeRows(lifetimeHouseholdRows(snapshot), { constituentType: "individual" })).toEqual([combined]);
  expect(lifetimeCsv([combined])).toContain("NXT-linked married spouses");
  snapshot.separateGroupIds = ["demo"];
  expect(lifetimeHouseholdRows(snapshot)).toEqual(snapshot.rows);
});
it("filters locally across names, both identity types, society, status and year", () => {
  const rows = [{ id: '["system","7"]', systemId: "7", lookupId: "ABC", name: "Fictional Donor", societyKey: "1934_club", status: "provisional", date: "2020-07-01" }];
  expect(filterLifetimeRows(rows, { search: "abc", society: "1934_club", year: "FY21" })).toHaveLength(1);
  expect(filterLifetimeRows(rows, { status: "review" })).toHaveLength(0);
});
it.each([["I", "individual"], ["Individual", "individual"], [" O ", "organization"], ["Organization", "organization"], ["", "unknown"], [null, "unknown"], ["true", "unknown"], ["Trust", "unknown"]])("normalizes only explicit constituent type %j", (raw, expected) => {
  expect(lifetimeConstituentType(raw)).toBe(expected);
});
it.each(["constructor", "__proto__", "toString"])("treats inherited object keys as unknown type: %s", value => {
  expect(lifetimeConstituentType(value)).toBe("unknown");
  expect(lifetimeTypeLabel(value)).toBe("Type not supplied / needs review");
});
it("combines type, society, search, status and year filters and keeps unknowns in the combined view", () => {
  const base = { id: "1", name: "Fictional Donor", constituentType: "individual", societyKey: "1934_club", status: "provisional", date: "2020-07-01" };
  const rows = [base, { ...base, societyKey: "frances_bartlett_kinne_society" }, { ...base, id: "2", constituentType: "organization" }, { ...base, id: "3", constituentType: "unknown" }];
  expect(filterLifetimeRows(rows)).toHaveLength(4);
  expect(filterLifetimeRows(rows, { constituentType: "individual", society: "1934_club", year: "FY21", status: "provisional", search: "fictional" })).toEqual([base]);
  expect(filterLifetimeRows(rows, { constituentType: "organization" })).toHaveLength(1);
  expect(filterLifetimeRows(rows, { constituentType: "unknown" })).toHaveLength(1);
  expect(lifetimeCoverage(rows)).toEqual({ constituents: 3, confirmed: 0, provisional: 4, review: 0, unclassified: 1 });
});
it("exports explicit provisional labels, preserves blank dates and escapes formulas", () => {
  const csv = lifetimeCsv([{ id: '["system","1"]', systemId: "1", lookupId: "=1+1", name: '+Fictional "Donor"', societyName: "1934 Club", thresholdCents: 10000000,
    date: null, totalCents: null, status: "review", reasons: ["Needs history"] }]);
  expect(csv).toContain("Entry date (see confirmation status)"); expect(csv).toContain("'\u003d1+1");
  expect(csv).toContain("'+Fictional \"\"Donor\"\""); expect(csv).toContain('"","","","Needs review"');
});
it("never exports the query-local lookup key as a constituent system ID", () => {
  const csv = lifetimeCsv([{ id: '["lookup","00123"]', systemId: null, lookupId: "00123", name: "Fictional Donor", societyName: "1934 Club",
    thresholdCents: 10000000, date: null, totalCents: null, status: "review", reasons: [] }]);
  expect(csv.split("\r\n")[1]).toMatch(/^"","00123","Fictional Donor"/);
  expect(csv).not.toContain("lookup");
});
it("exports constituent type and type-review notes with only the filtered rows", () => {
  const base = { id: "1", name: "Fictional Individual", constituentType: "individual", societyKey: "1934_club", societyName: "1934 Club", thresholdCents: 10000000, reasons: [] };
  const csv = lifetimeCsv(filterLifetimeRows([base, { ...base, id: "2", name: "Fictional Organization", constituentType: "organization" }], { constituentType: "organization" }));
  expect(csv).toContain('"Constituent type"'); expect(csv).toContain('"Organization"');
  expect(csv).not.toContain("Fictional Individual");
  expect(lifetimeCsv([{ ...base, constituentType: "unknown", constituentTypeNote: "Missing type" }])).toContain("Missing type");
});
it("only replaces members of confirmed groups and searches their IDs without inventing system IDs", () => {
  const members = [{ id: "1", name: "Fictional A", lookupId: "A1" }, { id: "2", name: "Fictional B", lookupId: "B2" }];
  const combined = { id: "group:demo", name: "Fictional A & Fictional B", members, constituentType: "mixed" };
  const snapshot = { rows: [...members, { id: "3", name: "Separate" }], sharedGroups: [{ id: "demo", members, rows: [combined] }], confirmedGroupIds: [] };
  expect(lifetimeHouseholdRows(snapshot)).toHaveLength(3);
  snapshot.confirmedGroupIds = ["demo"];
  const rows = lifetimeHouseholdRows(snapshot);
  expect(rows).toHaveLength(2); expect(rows).toContainEqual(combined);
  expect(filterLifetimeRows(rows, { search: "B2" })).toEqual([combined]);
  expect(filterLifetimeRows([combined], { constituentType: "individual" })).toEqual([]);
  expect(filterLifetimeRows([combined], { constituentType: "mixed" })).toEqual([combined]);
  expect(lifetimeCoverage([combined]).unclassified).toBe(0);
});
