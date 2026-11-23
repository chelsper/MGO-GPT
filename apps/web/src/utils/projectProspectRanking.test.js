import { describe, expect, it } from "vitest";
import { projectDisplayColumns } from "./projectProspectingDisplay";
import { CONSTITUENCY_TIERS, projectAmount, projectGroupKey, projectPrimaryPerson, projectProspectRankings, isProjectGivingColumn } from "./projectProspectRanking";

const headers = ["Name", "Head of Household", "Constituency", "Spouse Constituency", "Lifetime Giving", "Key Indicator"];
const display = projectDisplayColumns(headers, {});
const person = (id, values = {}) => {
  const row = [id, values.head ?? "Yes", values.constituency ?? "Trustee", values.spouse ?? "", values.giving ?? "$1,000", values.type ?? "Individual"];
  return { id, row, values: row.map(value => value ? [value] : []) };
};
const group = (...members) => ({ members, name: members.map(p => p.id).join(" & ") });
const rank = (groups, options = {}) => projectProspectRankings(groups, { display, assignments: new Map(), ...options });
const result = (groups, options) => [...rank(groups, options).values()];

describe("project prospect ranking", () => {
  it("recognizes only unique, exact-purpose fields and never uses largest gift as lifetime", () => {
    expect(display).toMatchObject({ head: 1, constituency: 2, spouseConstituency: 3, lifetime: 4, indicator: 5 });
    expect(projectDisplayColumns(["Largest Gift Amount"], {}).lifetime).toBe(-1);
    expect(projectDisplayColumns(["Lifetime Giving", "Total Lifetime Giving"], {}).lifetime).toBe(-1);
    expect(projectDisplayColumns(headers, { projectDisplay: { lifetimeGivingColumn: "Name", headOfHouseholdColumn: "" } })).toMatchObject({ lifetime: 0, head: -1 });
  });
  it.each(CONSTITUENCY_TIERS.flatMap((tier, index) => tier.map(name => [name, index + 1, (5 - index) * 20])))
  ("honors %s as tier %s with %s points", (constituency, tier, score) => {
    expect(result([group(person("1", { constituency }))])[0].constituency).toMatchObject({ tier, score });
  });
  it("uses the best constituency from either married member, primary giving, and distinct household tags", () => {
    const spouse = person("2", { head: "No", constituency: "Friend", spouse: "Alumni Bachelor's Degree", giving: "$9,000,000" });
    const primary = person("1", { constituency: "Trustee", giving: "$500" });
    const row = group(spouse, primary);
    const [entry] = result([row], { assignments: new Map([["1", new Set(["a", "b"])], ["2", new Set(["b", "c"])]]) });
    expect(entry.primary).toBe(primary);
    expect(entry.lifetime).toBe(500);
    expect(entry.constituency.tier).toBe(1);
    expect(entry.tagCount).toBe(3);
    expect(projectPrimaryPerson(group(primary, spouse), display)).toBe(primary);
  });
  it("does not use a spouse outside the list to boost an individual constituency", () => {
    const [entry] = result([group(person("1", { constituency: "Friend", spouse: "Trustee" }))]);
    expect(entry.constituency.tier).toBe(6);
  });
  it("requires a single confirmed household head, not source order or largest giving", () => {
    const a = person("1", { head: "" }), b = person("2", { head: "" });
    expect(projectPrimaryPerson(group(a, b), display)).toBeNull();
    expect(projectPrimaryPerson(group(person("1"), person("2")), display)).toBeNull();
    a.values[1] = ["Yes", "No"];
    expect(projectPrimaryPerson(group(a, person("2", { head: "No" })), display)).toBeNull();
    expect(result([group(a, b)])[0].reason).toMatch(/Head of household/);
    expect(projectPrimaryPerson(group(person("1"), b), display)?.id).toBe("1");
    expect(projectPrimaryPerson(group(person("1", { head: "No" })), display)?.id).toBe("1");
  });
  it("weights individual components equally, not as a hierarchy-first tie breaker", () => {
    const rows = [group(person("1", { constituency: "Alumni Bachelor's Degree", giving: "100" })), group(person("2", { constituency: "Friend", giving: "1000000" }))];
    const entries = result(rows, { assignments: new Map([["2", new Set(["a", "b"])]]) });
    expect(entries[0].score).toBeCloseTo(100 / 3);
    expect(entries[1].score).toBeCloseTo(200 / 3);
  });
  it("uses equal giving/tag weights for an explicitly identified organization", () => {
    const rows = [group(person("1", { giving: "0" })), group(person("2", { constituency: "Corporation", type: "Organization", giving: "100" }))];
    const entries = result(rows, { assignments: new Map([["2", new Set(["a"])]]) });
    expect(entries[1]).toMatchObject({ organization: true, score: 100, constituency: null, reason: "" });
  });
  it("keeps ties equal and does not make a dollar outlier overpower other components", () => {
    const rows = [group(person("1", { giving: "1" })), group(person("2", { giving: "2" })), group(person("3", { giving: "1000000000" }))];
    expect(result(rows).map(e => e.givingScore)).toEqual([0, 50, 100]);
    const tied = result([group(person("1")), group(person("2"))]);
    expect(tied[0].score).toEqual(tied[1].score);
    expect(tied[0].givingScore).toBe(50);
  });
  it.each(["", "=SUM(1)", "12,34", "unknown", "9007199254740993"])("does not turn %s into zero giving", giving => {
    expect(result([group(person("1", { giving }))])[0]).toMatchObject({ lifetime: null, score: null });
  });
  it("keeps an explicit zero valid and rejects conflicting lifetime totals", () => {
    expect(result([group(person("1", { giving: "0" }))])[0].score).not.toBeNull();
    const p = person("1"); p.values[4] = ["100", "$100.00"];
    expect(result([group(p)])[0].lifetime).toBe(100);
    p.values[4].push("200");
    expect(result([group(p)])[0].score).toBeNull();
  });
  it("does not rank unverified identities, unloaded tags, or unknown constituencies", () => {
    expect(result([group(person(null))])[0].reason).toMatch(/identity/);
    expect(result([group(person("1"))], { tagsAvailable: false })[0].score).toBeNull();
    expect(result([group(person("1", { constituency: "Unknown" }))])[0].score).toBeNull();
    expect(result([group(person("1", { type: "" }))])[0].score).toBeNull();
    const p = person("1"); p.values[5] = ["Individual", "Organization"];
    expect(result([group(p)])[0].reason).toMatch(/indicator/);
  });
  it("identifies giving display fields without treating unrelated fields as giving", () => {
    for (const h of ["Last Gift Amount", "Largest Gift Date", "Last Gift Fund Description", "Lifetime Giving"]) expect(isProjectGivingColumn(h, display, headers)).toBe(true);
    expect(isProjectGivingColumn(undefined, { lifetime: -1 }, headers)).toBe(false);
    expect(isProjectGivingColumn("Constituency", display, headers)).toBe(false);
  });
  it("keeps household keys stable if members change order, and never mutates input", () => {
    const a = person("1"), b = person("2", { head: "No" }); const rows = [group(a, b)];
    const before = structuredClone(rows); result(rows);
    expect(rows).toEqual(before);
    expect(projectGroupKey(group(a, b))).toEqual(projectGroupKey(group(b, a)));
  });
  it.each([["($1,234.50)", -1234.5], ["0", 0], [" +$20.00 ", 20], ["", null], ["$1,2", null]])("parses %s safely", (text, expected) => expect(projectAmount(text)).toBe(expected));
});
