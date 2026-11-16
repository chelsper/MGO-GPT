// @vitest-environment node
import { expect, it } from "vitest";
import { aggregateLifetimeHistory, lifetimeDay } from "./lifetimeSocietyHistory";
import { inspectLifetimeQuery } from "./lifetimeSocieties";
import { lifetimeQueryFixture, lifetimeRules, lifetimeCsvFixture } from "../../../../test/lifetimeQueryFixture";
const inspection = inspectLifetimeQuery(lifetimeQueryFixture());
const run = (rows, source = inspection) => aggregateLifetimeHistory(lifetimeCsvFixture(rows), source, lifetimeRules, rows.length, new Date("2026-11-16T12:00:00Z"));

it("sorts gift history and crosses both distinct thresholds on the right date", () => {
  const result = run([{ giftId: "103", date: "7/1/2025", amount: "900000" }, { giftId: "101", date: "1/1/2020", amount: "50000" },
    { giftId: "102", date: "6/30/2021", amount: "50000" }]);
  expect(result.rows.map(row => row.date)).toEqual(["2021-06-30", "2025-07-01"]);
  expect(result.rows[0]).toMatchObject({ totalCents: 100000000, status: "provisional", crossingGiftIds: ["102"] });
});
it("counts a gift once despite repeated funds and installments; groups same-day gifts", () => {
  const result = run([{ amount: "50000" }, { amount: "50000", fund: "Another Fund" }, { giftId: "102", amount: "50000" }]);
  expect(result.repeatedRows).toBe(1); expect(result.rows[0].totalCents).toBe(10000000);
  expect(result.rows[0].crossingGiftIds).toEqual(["101", "102"]);
});
it("isolates conflicting duplicates rather than blocking unaffected donors", () => {
  const result = run([{ amount: "50000" }, { amount: "100000" }, { id: "2", name: "Other Fictional Donor", giftId: "102" }]);
  expect(result.rows.find(row => row.systemId === "1")).toMatchObject({ date: null, totalCents: null, status: "review" });
  expect(result.rows.find(row => row.systemId === "2")).toMatchObject({ date: "2020-01-01", status: "provisional" });
});
it("withholds both owners when the same direct gift is assigned to different constituents", () => {
  expect(run([{}, { id: "2", name: "Other Fictional Donor" }]).rows.every(row => row.date === null)).toBe(true);
});
it("does not award the same personal gift twice when soft credited to its donor", () => {
  const result = run([{ amount: "600000" }, { amount: "600000", credit: "Soft Credit Recipient" }]);
  expect(result.rows[1].date).toBeNull(); expect(result.rows[1].totalCents).toBe(60000000);
});
it("honors the approved full-gift recognition rule in both societies", () => {
  const result = run([{}, { giftId: "102", amount: "950000", credit: "Soft Credit Recipient" }]);
  expect(result.rows.every(row => row.date === "2020-01-01" && row.totalCents === 105000000)).toBe(true);
  const unsupported = run([{}, { giftId: "102", credit: "Soft Credit Recipient" }], { ...inspection, fullRecognition: false });
  expect(unsupported.rows.every(row => row.date === null && row.reasons.join().includes("allocation"))).toBe(true);
});
it("suggests exact co-credit sets without combining a chain or double-counting group gifts", () => {
  const a = { id: "1", name: "Fictional A", giftId: "101", amount: "60000" };
  const b = { id: "2", name: "Fictional B", credit: "Soft Credit Recipient", giftId: "101", amount: "60000" };
  const c = { id: "3", name: "Fictional C", giftId: "102", amount: "50000" };
  const result = run([a, b, { ...b, giftId: "102", amount: "50000" }, c, { ...a, giftId: "103", amount: "40000" }, b]);
  expect(result.sharedGroups.map(group => group.members.map(member => member.systemId))).toEqual([["1", "2"], ["2", "3"]]);
  const ab = result.sharedGroups[0];
  expect(ab).toMatchObject({ sharedGiftCount: 1 });
  expect(ab.rows[0]).toMatchObject({ totalCents: 15000000, date: "2020-01-01", members: expect.any(Array) });
  expect(result.sharedGroups[1].rows[0].constituentType).toBe("individual");
  expect(result.confirmedGroupIds).toEqual([]);
  expect(result.rows).toHaveLength(6);
  expect(run([b, { ...a, giftId: "103", amount: "40000" }, c, { ...b, giftId: "102", amount: "50000" }, b, a]).sharedGroups.map(group => group.id))
    .toEqual(result.sharedGroups.map(group => group.id));
});
const spouseOptions = { identity: false, spouses: true };
const spouseInspection = inspectLifetimeQuery(lifetimeQueryFixture(spouseOptions));
const spouseRun = rows => aggregateLifetimeHistory(lifetimeCsvFixture(rows, spouseOptions), spouseInspection, lifetimeRules, rows.length, new Date("2026-11-16T12:00:00Z"));
const spouseA = { id: "1", name: "Fictional Harry", spouseId: "DEMO-2", maritalStatus: "Married", giftId: "101", amount: "40000" };
const spouseB = { id: "2", name: "Fictional Cynthia", spouseId: "DEMO-1", maritalStatus: "Married", giftId: "102", amount: "30000" };
it("automatically groups reciprocal married individuals even without shared gifts", () => {
  const result = spouseRun([spouseA, spouseB]);
  expect(result).toMatchObject({ automaticHouseholdCount: 1, householdReviewCount: 0, confirmedGroupIds: [] });
  expect(result.sharedGroups[0]).toMatchObject({ automatic: true, sharedGiftCount: 0,
    rows: [expect.objectContaining({ totalCents: 7000000, groupBasis: "spouse", constituentType: "individual", systemId: null }), expect.any(Object)] });
  expect(result.sharedGroups[0].members.map(member => member.lookupId)).toEqual(["DEMO-1", "DEMO-2"]);
});
it("keeps a corporate donor's unrelated gifts out of spouses' combined giving and deduplicates their shared credits", () => {
  const company = { id: "3", name: "Fictional Company", constituentType: "O", giftId: "103", amount: "50000" };
  const result = spouseRun([spouseA, spouseB, company,
    { ...spouseA, giftId: "103", amount: "50000", credit: "Soft Credit Recipient" },
    { ...spouseB, giftId: "103", amount: "50000", credit: "Soft Credit Recipient" },
    { ...company, giftId: "104", amount: "900000" }]);
  expect(result.sharedGroups).toHaveLength(1);
  expect(result.sharedGroups[0].rows[0]).toMatchObject({ totalCents: 12000000, date: "2020-01-01" });
  expect(result.sharedGroups[0].members.every(member => member.constituentType === "individual")).toBe(true);
  expect(result.rows.find(row => row.lookupId === "DEMO-3")).toMatchObject({ totalCents: 95000000 });
});
it("never suggests a company/person household; individual shared-credit suggestions exclude the company", () => {
  const company = { id: "3", name: "Fictional Company", constituentType: "O", giftId: "101", amount: "50000" };
  const a = { ...spouseA, spouseId: "", maritalStatus: "", credit: "Soft Credit Recipient", amount: "50000" };
  const b = { ...spouseB, spouseId: "", maritalStatus: "", giftId: "101", credit: "Soft Credit Recipient", amount: "50000" };
  expect(spouseRun([company, a]).sharedGroups).toEqual([]);
  const result = spouseRun([company, a, b, { ...company, giftId: "102", amount: "900000" }]);
  expect(result.sharedGroups[0]).toMatchObject({ automatic: false, members: [expect.objectContaining({ name: a.name }), expect.objectContaining({ name: b.name })] });
  expect(result.sharedGroups[0].rows[0].totalCents).toBe(5000000);
});
it.each(["Divorced", "Separated", "Widowed", "Single", "", "Unknown"])("does not auto-group when either spouse has marital status %j", status => {
  const result = spouseRun([spouseA, { ...spouseB, maritalStatus: status }]);
  expect(result.automaticHouseholdCount).toBe(0);
  expect(result.householdReviewCount).toBeGreaterThan(0);
  expect(result.rows).toHaveLength(4);
});
it("keeps missing, self, one-sided, organization, conflicting and chained spouse links separate", () => {
  for (const rows of [[spouseA], [spouseA, { ...spouseB, spouseId: "" }], [{ ...spouseA, spouseId: "DEMO-1" }],
    [spouseA, { ...spouseB, constituentType: "O" }], [spouseA, spouseB, { ...spouseA, spouseId: "DEMO-3" }],
    [spouseA, spouseB, { id: "3", name: "Fictional Third", giftId: "103", maritalStatus: "Married", spouseId: "DEMO-2" }],
    [spouseA, { ...spouseB, spouseId: "DEMO-3" }, { id: "3", name: "Fictional Third", giftId: "103", maritalStatus: "Married", spouseId: "DEMO-1" }]]) {
    const result = spouseRun(rows);
    expect(result.automaticHouseholdCount).toBe(0);
    expect(result.householdReviewCount).toBeGreaterThan(0);
  }
});
it("does not infer spouses from a shared name or silently normalize lookup IDs", () => {
  expect(spouseRun([{ ...spouseA, spouseId: "demo-2" }, spouseB]).automaticHouseholdCount).toBe(0);
  expect(spouseRun([{ ...spouseA, lookupId: "001", spouseId: "002" }, { ...spouseB, lookupId: "002", spouseId: "001" }]).automaticHouseholdCount).toBe(1);
  expect(spouseRun([{ ...spouseA, spouseId: "", name: "Same Name" }, { ...spouseB, spouseId: "", name: "Same Name" }]).automaticHouseholdCount).toBe(0);
});
it("allows missing spouse outputs without blocking individual history or inventing auto households", () => {
  const result = run([spouseA, spouseB]);
  expect(result.automaticHouseholdCount).toBe(0); expect(result.rows).toHaveLength(4);
});
it("retains complex and conflicting gift safeguards inside an automatic household", () => {
  const complex = spouseRun([spouseA, { ...spouseB, type: "Pledge" }]);
  expect(complex.sharedGroups[0].rows[0]).toMatchObject({ totalCents: null, date: null, supportedCents: 4000000 });
  const conflict = spouseRun([spouseA, spouseB, { ...spouseB, giftId: "101", credit: "Soft Credit Recipient", amount: "99999" }]);
  expect(conflict.sharedGroups[0].rows.every(row => row.date === null && row.supportedCents === null)).toBe(true);
});
it("spouse evidence is order-independent and detects changed marital status", () => {
  expect(spouseRun([spouseA, spouseB, spouseA]).sharedGroups[0].id).toBe(spouseRun([spouseB, spouseA]).sharedGroups[0].id);
  expect(spouseRun([spouseA, spouseB, { ...spouseA, giftId: "103" }, { ...spouseB, giftId: "103", amount: spouseA.amount, credit: "Soft Credit Recipient" }]).sharedGroups[0].id).toBe(spouseRun([spouseA, spouseB]).sharedGroups[0].id);
  expect(spouseRun([spouseA, spouseB, { ...spouseB, maritalStatus: "Divorced" }]).automaticHouseholdCount).toBe(0);
});
it("does not suggest groups based on name, employee matching credit, or conflicting amounts", () => {
  expect(run([{}, { id: "2", giftId: "102" }]).sharedGroups).toEqual([]);
  expect(run([{}, { id: "2", name: "Fictional Employee", credit: "Constituent MG-Payment" }]).sharedGroups).toEqual([]);
  const conflict = run([{}, { id: "2", name: "Fictional Recipient", credit: "Soft Credit Recipient", amount: "60000" }]);
  expect(conflict.sharedGroups).toEqual([]);
  expect(conflict.rows.every(row => row.date === null && row.totalCents === null && row.supportedCents === null)).toBe(true);
});
it("changes group evidence identity when members or credited gifts change", () => {
  const a = {}, b = { id: "2", name: "Fictional B", credit: "Soft Credit Recipient" };
  const original = run([a, b]).sharedGroups[0].id;
  expect(run([a, { ...b, constituentType: "O" }]).sharedGroups).toEqual([]);
  for (const rows of [[a, { ...b, name: "Different B" }],
    [a, b, { giftId: "102" }, { ...b, giftId: "102" }]])
    expect(run(rows).sharedGroups[0].id).not.toBe(original);
});
it("can use spouse system IDs only with constituent system IDs and does not confuse them with lookup IDs", () => {
  const options = { spouses: true };
  const source = inspectLifetimeQuery(lifetimeQueryFixture(options));
  source.spouseIdentityMode = "system"; source.columns.spouseId = source.columns.spouseLookupId; source.columns.spouseLookupId = "";
  const rows = [{ ...spouseA, spouseId: "2" }, { ...spouseB, spouseId: "1" }];
  const result = aggregateLifetimeHistory(lifetimeCsvFixture(rows, options), source, lifetimeRules, rows.length);
  expect(result.automaticHouseholdCount).toBe(1);
  expect(aggregateLifetimeHistory(lifetimeCsvFixture([spouseA, spouseB], options), source, lifetimeRules, 2).automaticHouseholdCount).toBe(0);
});
it("shows supported subtotals without pretending complex histories have complete totals or dates", () => {
  const result = run([{ amount: "60000" }, { giftId: "102", type: "Pledge", amount: "500000" }]);
  expect(result.rows[0]).toMatchObject({ supportedCents: 6000000, totalCents: null, date: null });
});
it("reads constituent types independently of names and gift types", () => {
  const result = run([{ name: "Fictional Company", constituentType: "Individual" },
    { id: "2", giftId: "102", name: "Fictional Person", constituentType: "O" }]);
  expect(result.rows.filter(row => row.systemId === "1").every(row => row.constituentType === "individual")).toBe(true);
  expect(result.rows.filter(row => row.systemId === "2").every(row => row.constituentType === "organization")).toBe(true);
});
it.each(["", "Unknown", "1", "True"])("retains unrecognized constituent type %j without guessing or changing dates", constituentType => {
  expect(run([{ constituentType }]).rows[0]).toMatchObject({ constituentType: "unknown", date: "2020-01-01" });
});
it("retains records with missing type outputs, and isolates inconsistent types regardless of row order", () => {
  const source = inspectLifetimeQuery(lifetimeQueryFixture({ constituentType: false }));
  const result = aggregateLifetimeHistory(lifetimeCsvFixture([{}], { constituentType: false }), source, lifetimeRules, 1);
  expect(result.rows[0]).toMatchObject({ constituentType: "unknown", date: "2020-01-01" });
  for (const types of [["I", "O"], ["O", "I"], ["I", ""], ["", "I"]]) {
    const mixed = run([...types.map(constituentType => ({ constituentType })), { id: "2", giftId: "102", constituentType: "O" }]);
    expect(mixed.rows.find(row => row.systemId === "1")).toMatchObject({ constituentType: "unknown", date: "2020-01-01", constituentTypeNote: expect.stringContaining("inconsistent") });
    expect(mixed.rows.find(row => row.systemId === "2").constituentType).toBe("organization");
  }
});
it.each(["Pledge", "Pledge Payment", "Write Off", "Matching Gift Write Off", "Planned Gift", "Recurring Gift", "Unknown"])("withholds %s histories rather than double-counting", type => {
  const result = run([{}, { giftId: "102", type }]);
  expect(result.rows.every(row => row.date === null && row.totalCents === null)).toBe(true);
});
it.each([{ date: "2/30/2020" }, { date: "" }, { date: "1/1/2027" }, { amount: "" }, { amount: "bad" }, { amount: "-100000" }, { credit: "Unknown" }])("withholds uncertain history: %j", row => {
  expect(run([row]).rows.every(row => row.date === null)).toBe(true);
});
it("does not treat a gift-filtered history as lifetime history", () => {
  expect(run([{}], { ...inspection, restrictedHistory: true }).rows[0].date).toBeNull();
});
it("rejects identity failures, missing outputs and truncated results", () => {
  expect(() => run([{ id: "" }])).toThrow(/identities/);
  expect(() => run([{ id: "integration-guid" }])).toThrow(/identities/);
  expect(() => aggregateLifetimeHistory(lifetimeCsvFixture([{}]), inspection, lifetimeRules, 2)).toThrow(/counts differ/);
  expect(() => aggregateLifetimeHistory(lifetimeCsvFixture([{}]), inspection, lifetimeRules, null)).toThrow(/row count/);
  expect(() => run([{}], { ...inspection, ready: false })).toThrow(/outputs/);
  expect(() => run([{}], { ...inspection, columns: { ...inspection.columns, date: "Missing Date" } })).toThrow(/outputs/);
});
it("accepts a completed empty result without inventing members", () => { expect(run([])).toMatchObject({ peopleCount: 0, rows: [], rawRows: 0 }); });
const lookupInspection = inspectLifetimeQuery(lifetimeQueryFixture({ identity: false }));
const runLookup = rows => aggregateLifetimeHistory(lifetimeCsvFixture(rows, { identity: false }), lookupInspection, lifetimeRules, rows.length);
it("preserves leading zeros and case without merging people with the same name", () => {
  const result = runLookup(["00123", "123", "DEMO-A", "demo-a"].map((lookupId, i) => ({ lookupId, giftId: String(101 + i) })));
  expect(result.peopleCount).toBe(4);
  expect(new Set(result.rows.map(row => row.lookupId))).toEqual(new Set(["00123", "123", "DEMO-A", "demo-a"]));
  expect(result.rows.every(row => row.systemId === null && row.id === JSON.stringify(["lookup", row.lookupId]))).toBe(true);
});
it("deduplicates repeated funds in lookup mode and retains the gift's system identity", () => {
  const result = runLookup([{ amount: "50000" }, { amount: "50000", fund: "Other Fund" }, { giftId: "102", amount: "50000" }]);
  expect(result).toMatchObject({ peopleCount: 1, repeatedRows: 1, uniqueCreditGifts: 2 });
  expect(result.rows[0]).toMatchObject({ totalCents: 10000000, crossingGiftIds: ["101", "102"] });
});
it.each(["", " ", "DEMO\n1", "X".repeat(101)])("rejects invalid lookup ID %j without substituting a gift ID or name", lookupId => {
  expect(() => runLookup([{ lookupId }])).toThrow(/identities/);
});
it("fails closed on conflicting lookup names or crosswalks", () => {
  expect(() => runLookup([{}, { name: "Another Fictional Donor" }])).toThrow(/conflicting identity/);
  expect(() => run([{}, { lookupId: "OTHER-ID" }])).toThrow(/conflicting identity/);
  expect(() => run([{}, { id: "2", lookupId: "DEMO-1" }])).toThrow(/conflicting system/);
});
it("does not silently fall back for a missing system ID when that output was provided", () => {
  expect(() => run([{ id: "", lookupId: "DEMO-1" }])).toThrow(/identities/);
});
it.each([["2020-02-29", "2020-02-29"], ["2/29/2021", null], ["2020-01-01T00:00:00", "2020-01-01"], ["01/01/20", null]])("parses strict date %s", (input, result) => expect(lifetimeDay(input)).toBe(result));
