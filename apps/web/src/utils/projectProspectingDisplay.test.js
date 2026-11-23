import { describe, expect, it } from "vitest";
import { projectIdentity, projectProspectRows, projectCsv } from "./projectProspecting";
import { projectDisplayColumns, projectHouseholds, projectExportData, projectSolicitors } from "./projectProspectingDisplay";
const headers = ["System ID", "Constituent ID", "Name", "Spouse ID", "Marital Status", "Key Indicator"];
const source = { systemIdColumn: "System ID" };
const pair = [["1", "001", "Avery", "002", "Married", "Individual"], ["2", "002", "Blake", "001", "Alum married to alum", "Individual"]];
function setup(rows = pair, columns = headers, config = source) {
  const snapshot = { headers: columns, tableRows: rows };
  const identity = projectIdentity(snapshot, config);
  const people = projectProspectRows(snapshot, identity);
  const display = projectDisplayColumns(columns, config);
  return { snapshot, identity, people, display, groups: projectHouseholds(people, display) };
}
describe("safe project household display", () => {
  it("groups married records by exact lookup IDs including alum married to alum", () => {
    const { groups } = setup();
    expect(groups.grouped).toBe(1);
    expect(groups.rows[0].members.map(p => p.id)).toEqual(["1", "2"]);
    expect(groups.rows[0].name).toBe("Avery & Blake");
  });
  it("allows a single unambiguous spouse link only when both are married", () => {
    const rows = structuredClone(pair); rows[1][3] = "";
    expect(setup(rows).groups.grouped).toBe(1);
  });
  it.each(["Divorced", "Separated", "Widowed", "Single", "", "Unknown"])("does not group %s", status => {
    const rows = structuredClone(pair); rows[1][4] = status;
    expect(setup(rows).groups.grouped).toBe(0);
  });
  it("never matches by name or treats a spouse system ID as a lookup ID", () => {
    const rows = structuredClone(pair); rows[0][3] = "2"; rows[1][3] = "1";
    expect(setup(rows).groups.grouped).toBe(0);
    expect(setup(rows, headers, { ...source, projectDisplay: { spouseIdColumn: "Spouse ID", spouseIdType: "system" } }).groups.grouped).toBe(1);
  });
  it("rejects duplicate lookup identities, conflicting spouses and chains", () => {
    expect(setup([...pair, ["3", "001", "Third", "", "Married", "Individual"]]).groups.grouped).toBe(0);
    expect(setup([...pair, ["3", "003", "Third", "001", "Married", "Individual"]]).groups.grouped).toBe(0);
    const rows = structuredClone(pair); rows[1][3] = "003";
    expect(setup([...rows, ["3", "003", "Third", "002", "Married", "Individual"]]).groups.grouped).toBe(0);
    expect(setup([...pair, ["1", "001", "Avery", "003", "Married", "Individual"]]).groups.grouped).toBe(0);
  });
  it("does not group organizations, unlisted spouses, or ambiguous marital values", () => {
    const rows = structuredClone(pair); rows[1][5] = "Organization";
    expect(setup(rows).groups.grouped).toBe(0);
    expect(setup([pair[0]]).groups.grouped).toBe(0);
    expect(setup([...pair, ["1", "001", "Avery", "002", "Separated", "Individual"]]).groups.grouped).toBe(0);
  });
  it("requires the constituent's own marital status, not the spouse field", () => {
    expect(setup(pair, headers.map(h => h === "Marital Status" ? "Spouse Marital Status" : h)).groups.missing).toBe(true);
    const display = projectDisplayColumns([...headers, "Constituent Marital Status"], source);
    expect(display.marital).toBe(-1);
  });
  it("honors explicit mapping and disabling without falling back", () => {
    expect(projectDisplayColumns(headers, { projectDisplay: { spouseIdColumn: "", nameColumn: "missing" } })).toMatchObject({ spouse: -1, name: -1 });
    const { people, display } = setup();
    expect(projectHouseholds(people, display, false)).toMatchObject({ grouped: 0, missing: false });
    expect(projectHouseholds(people.filter(p => p.id === "2"), display).rows).toHaveLength(1);
  });
  it("exports individual tag ownership and household context without merging amounts", () => {
    const { people, display, groups } = setup();
    const tags = [{ id: "a", name: "=unsafe" }, { id: "b", name: "Science" }];
    const data = projectExportData({ people, households: groups.rows, display, headers, columns: [{ header: "Name" }], tags,
      assignments: new Map([["1", new Set(["a"])], ["2", new Set(["b"])]]), archivedIds: new Set(["2"]) });
    expect(data.headers.slice(-2)).toEqual(["Tag: =unsafe", "Tag: Science"]);
    expect(data.rows[0]).toEqual(["Avery", "=unsafe", "Avery & Blake", "1; 2", "Active", "Yes", ""]);
    expect(data.rows[1]).toEqual(["Blake", "Science", "Avery & Blake", "1; 2", "Archived", "", "Yes"]);
    expect(projectCsv(data.headers, data.rows)).toContain('"\'=unsafe"');
  });
});
describe("saved solicitor assignments", () => {
  it("preserves original name/type/date combinations and distinguishes historical assignments", () => {
    const columns = [...headers, "Assigned Fundraiser Name", "Assigned Fundraiser Type", "Assigned Fundraiser Date From", "Assigned Fundraiser Date To"];
    const rows = [
      [...pair[0], "Current MGO", "Lead", "1/1/2026", ""],
      [...pair[0], "Past MGO", "Lead", "1/1/2024", "12/31/2025"],
      [...pair[0], "Future MGO", "Secondary", "1/1/2027", ""],
      [...pair[0], "Uncertain MGO", "Lead", "bad date", ""],
      [...pair[0], "Current MGO", "Lead", "1/1/2026", ""],
    ];
    const { snapshot, identity, display } = setup(rows, columns);
    expect(projectSolicitors(snapshot, identity, display, "2026-11-23").get("1").map(s => [s.name, s.status])).toEqual([
      ["Current MGO", "Current in saved data"], ["Past MGO", "Ended"], ["Future MGO", "Future"], ["Uncertain MGO", "Dates not verified"],
    ]);
  });
  it("does not imply current when date columns are absent or use spouse fundraiser fields", () => {
    const { snapshot, identity, display } = setup([[...pair[0], "A solicitor"]], [...headers, "Assigned Fundraiser Name"]);
    expect(projectSolicitors(snapshot, identity, display).get("1")[0].status).toBe("Dates not verified");
    expect(projectDisplayColumns(["Spouse Assigned Fundraiser Name"], source).solicitor).toBe(-1);
  });
});
