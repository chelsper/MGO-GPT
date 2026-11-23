import { describe, expect, it } from "vitest";
import { orderedProjectPeople, projectSortOptions, projectSortType, sortProjectGroups } from "./projectProspectingSort";
import { projectGroupKey } from "./projectProspectRanking";
const headers = ["Name", "Amount", "Gift Date", "Head of Household", "Lifetime Giving"];
const display = { name: 0, solicitor: -1, head: 3, lifetime: 4 };
const p = (id, name, amount = "", date = "", head = "Yes") => ({ id, row: [name, amount, date, head, amount], values: [[name], amount ? [amount] : [], date ? [date] : [], [head], amount ? [amount] : []] });
const group = (...members) => ({ name: members.map(p => p.row[0]).join(" & "), members });
function sorted(groups, option, direction = "ascending", extra = {}) {
  return sortProjectGroups(groups, { headers, display, assignments: new Map(), solicitors: new Map(), sort: { key: option.key, direction }, option, ...extra });
}
const ids = groups => groups.map(g => g.members[0].id);
describe("project prospect sorting", () => {
  it("offers ranking, name, tags, solicitor and visible fields, but not hidden fields", () => {
    const options = projectSortOptions(headers, headers.map(header => ({ header, visible: header !== "Amount", format: "text" })), { ...display, solicitor: 2 });
    expect(options[0].label).toBe("Prospect Ranking");
    expect(options.map(o => o.key)).toEqual(["ranking", "query", "name", "solicitor", "tagCount", "column:Head of Household", "column:Lifetime Giving"]);
    expect(options.at(-1).type).toBe("number");
    expect(projectSortType({ header: "System ID" })).toBe("text");
    expect(projectSortType({ header: "Last Gift Date" })).toBe("date");
    expect(projectSortType({ header: "Pledge Balance" })).toBe("number");
  });
  it("keeps original query order available without mutating the groups", () => {
    const groups = [group(p("2", "Z")), group(p("1", "A"))];
    const result = sorted(groups, { key: "query" }); expect(result).toEqual(groups); expect(result).not.toBe(groups);
  });
  it("sorts numeric amounts and leaves invalid/blanks last in both directions", () => {
    const groups = [group(p("1", "Blank")), group(p("2", "Ten", "$10")), group(p("3", "Two", "2")), group(p("4", "Invalid", "=1+2"))];
    const option = { key: "amount", header: "Amount", type: "number" };
    expect(ids(sorted(groups, option))).toEqual(["3", "2", "1", "4"]);
    expect(ids(sorted(groups, option, "descending"))).toEqual(["2", "3", "1", "4"]);
  });
  it("sorts full-year dates chronologically across formats and refuses invalid dates", () => {
    const groups = [group(p("1", "A", "", "2/29/2025")), group(p("2", "B", "", "12/1/2025")), group(p("3", "C", "", "2026-01-01")), group(p("4", "D", "", "1/1/26"))];
    expect(ids(sorted(groups, { key: "date", header: "Gift Date", type: "date" }, "descending"))).toEqual(["3", "2", "1", "4"]);
  });
  it("sorts names naturally, keeps households intact, and preserves IDs on equal names", () => {
    const one = group(p("20", "Avery"), p("21", "Zora")); const two = group(p("3", "Blake"));
    expect(sorted([two, one], { key: "name", type: "text" })[0]).toBe(one);
    expect(ids(sorted([group(p("2", "Same")), group(p("1", "Same"))], { key: "name", type: "text" }))).toEqual(["1", "2"]);
  });
  it("does not use a context-only spouse for ordinary name or tag-count sorting", () => {
    const a = p("1", "A"), z = p("2", "Z"), m = p("3", "M"); const groups = [group(a, z), group(m)];
    const matchingPeople = new Set([z, m]);
    expect(ids(sorted(groups, { key: "name", type: "text" }, "ascending", { matchingPeople }))).toEqual(["3", "1"]);
    expect(orderedProjectPeople(sorted(groups, { key: "name", type: "text" }, "ascending", { matchingPeople }), [z, m])).toEqual([m, z]);
  });
  it("sorts household giving by the head even when source order and spouse giving differ", () => {
    const spouse = p("1", "A", "9000", "", "No"), head = p("2", "B", "5");
    const groups = [group(spouse, head), group(p("3", "C", "100"))];
    expect(ids(sorted(groups, { key: "giving", header: "Lifetime Giving", type: "number" }, "descending"))).toEqual(["3", "1"]);
    expect(ids(sorted(groups, { key: "giving", header: "Lifetime Giving", type: "number" }, "ascending", { matchingPeople: new Set([spouse]) }))).toEqual(["1", "3"]);
  });
  it("sorts by distinct tags, not spouse counts added together", () => {
    const groups = [group(p("1", "A"), p("2", "B")), group(p("3", "C"))];
    const assignments = new Map([["1", new Set(["a"])], ["2", new Set(["a"])], ["3", new Set(["b", "c"])]]);
    expect(ids(sorted(groups, { key: "tagCount", type: "number" }, "descending", { assignments }))).toEqual(["3", "1"]);
  });
  it("uses saved active/unverified solicitor assignments rather than ended or future ones", () => {
    const groups = [group(p("1", "A")), group(p("2", "B"))];
    const solicitors = new Map([["1", [{ name: "Aaron", status: "Ended" }, { name: "Zelda", status: "Current in saved data" }]], ["2", [{ name: "Beth", status: "Dates not verified" }]]]);
    expect(ids(sorted(groups, { key: "solicitor", type: "text" }, "ascending", { solicitors }))).toEqual(["2", "1"]);
  });
  it("sorts computed rankings with unranked rows last regardless of direction", () => {
    const groups = [group(p("1", "A")), group(p("2", "B")), group(p("3", "C"))];
    const rankings = new Map(groups.map((g, i) => [projectGroupKey(g), { score: [null, 10, 90][i] }]));
    expect(ids(sorted(groups, { key: "ranking" }, "descending", { rankings }))).toEqual(["3", "2", "1"]);
    expect(ids(sorted(groups, { key: "ranking" }, "ascending", { rankings }))).toEqual(["2", "3", "1"]);
  });
});
