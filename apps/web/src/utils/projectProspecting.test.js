import { describe, expect, it } from "vitest";
import { projectSource, projectIdentity, projectProspectRows, normalizeProjectTag, projectCsv, PROJECT_SECTION } from "./projectProspecting";
import { validateListSource, normalizeListSource, reportNavigation, LIST_SCHEMA } from "./constituentLists";
import { getReportHref } from "@/app/api/utils/reportRegistry";
import { listSnapshotKeys } from "@/app/api/utils/constituentListRefresh";
import { serializeList } from "@/app/api/utils/listConfigurations";

const source = { ...projectSource(), systemIdColumn: "Constituent system ID" };
describe("Project Prospecting", () => {
  it("prefills The Center's query and preserves project identity mapping", () => {
    expect(source.queryId).toBe("31110"); expect(validateListSource(source)).toBeFalsy();
    expect(normalizeListSource(source)).toEqual(source);
    expect(validateListSource({ ...source, fieldCategory: "NXT write" })).toBeTruthy();
    expect(validateListSource({ ...source, fieldDescription: "The Center" })).toBeTruthy();
    const membership = { ...source, fieldCategory: "Prospect Research", fieldDescription: "The Center" };
    expect(validateListSource(membership)).toBeFalsy();
    expect(normalizeListSource(membership)).toEqual(membership);
    expect(validateListSource({ ...source, systemIdColumn: "qrecid" })).toBeTruthy();
    expect(validateListSource({ ...source, source: "custom_field" })).toBeTruthy();
    expect(validateListSource({ ...source, section: "arbitrary" })).toBeTruthy();
  });
  it("uses only the explicitly mapped system ID and deduplicates people", () => {
    const snapshot = { headers: ["Name", source.systemIdColumn, "qrecid"], tableRows: [["One", "123", "1"], ["One again", "123", "2"], ["Bad", "", "3"], ["Bad", "1.0", "4"], ["Two", "9007199254740999", "5"]] };
    expect(projectIdentity(snapshot, source)).toMatchObject({ ids: ["123", "9007199254740999"], invalidRows: 2 });
    expect(projectIdentity(snapshot, { ...source, systemIdColumn: "" }).error).toBeTruthy();
    expect(projectIdentity(snapshot, { ...source, systemIdColumn: "qrecid" }).error).toBeTruthy();
    expect(projectIdentity({ headers: [source.systemIdColumn, source.systemIdColumn] }, source).error).toBeTruthy();
  });
  it("does not invalidate saved query data when mapping or display changes", () => {
    const report = { key: "list-project-center", dataConfiguration: source };
    expect(listSnapshotKeys(report, "https://app.test")).toEqual(listSnapshotKeys({ ...report, dataConfiguration: { ...source, systemIdColumn: "ID", columns: [] } }, "https://app.test"));
    expect(listSnapshotKeys(report, "https://app.test")).toEqual(listSnapshotKeys({ ...report, dataConfiguration: { ...source, fieldCategory: "Prospect Research", fieldDescription: "The Center" } }, "https://app.test"));
    expect(listSnapshotKeys(report, "https://app.test")).not.toEqual(listSnapshotKeys({ ...report, dataConfiguration: { ...source, queryId: "99" } }, "https://app.test"));
  });
  it("groups repeated system IDs in first-seen order and keeps all distinct nonblank values", () => {
    const snapshot = { headers: ["Name", source.systemIdColumn, "Interest", "Amount"], tableRows: [
      ["Fictional Avery", "123", "", "100"],
      ["Fictional Avery", "456", "Research", "100"],
      ["Fictional Avery", " 123 ", "Arts", "200"],
      ["Fictional Avery", "123", "Arts", "100"],
      ["Avery Alias", "123", "Science", ""],
    ] };
    const original = structuredClone(snapshot);
    expect(projectProspectRows(snapshot, projectIdentity(snapshot, source))).toEqual([
      { id: "123", row: ["Fictional Avery", "123", "Arts", "100"],
        values: [["Fictional Avery", "Avery Alias"], ["123"], ["Arts", "Science"], ["100", "200"]] },
      { id: "456", row: ["Fictional Avery", "456", "Research", "100"],
        values: [["Fictional Avery"], ["456"], ["Research"], ["100"]] },
    ]);
    expect(snapshot).toEqual(original);
  });
  it("never combines invalid or unmapped IDs, even with identical names and lookup IDs", () => {
    const snapshot = { headers: ["Name", source.systemIdColumn, "Lookup ID"], tableRows: [
      ["Same name", "", "123"], ["Same name", "", "123"],
      ["Same name", "1.0", "123"], ["Same name", "1.0", "123"],
      ["Same name", "9007199254740999", "123"], ["Same name", "9007199254740998", "123"],
    ] };
    expect(projectProspectRows(snapshot, projectIdentity(snapshot, source))).toHaveLength(6);
    const unmapped = projectProspectRows(snapshot, projectIdentity(snapshot, projectSource()));
    expect(unmapped).toHaveLength(6); expect(unmapped.every(row => row.id === null)).toBe(true);
  });
  it("keeps representative cells bounded while retaining a long collection of alternate values", () => {
    const snapshot = { headers: [source.systemIdColumn, "Notes"], tableRows: Array.from({ length: 100 }, (_, i) => ["123", `${i} ${"x".repeat(200)}`]) };
    const rows = projectProspectRows(snapshot, projectIdentity(snapshot, source));
    expect(rows).toHaveLength(1); expect(rows[0].values[1]).toHaveLength(100);
    expect(rows[0].row[1]).toBe(snapshot.tableRows[0][1]);
    expect(projectProspectRows({ tableRows: [] }, { rowIds: [] })).toEqual([]);
  });
  it("keeps project and normal list navigation separate", () => {
    const report = { key: "list-project-center", dataConfiguration: source, configurationSchema: LIST_SCHEMA, canView: true, active: true };
    expect(getReportHref(report)).toBe("/reports/project-prospecting/list-project-center");
    expect(reportNavigation([report, { ...report, key: "list-two" }, { key: PROJECT_SECTION }]).map(r => r.key)).toEqual([PROJECT_SECTION]);
    expect(reportNavigation([report, { ...report, key: "list-ordinary", dataConfiguration: {} }]).map(r => r.key)).toEqual([PROJECT_SECTION, "lists"]);
  });
  it.each(["mgo", "admin", "advancement_services"])("requires explicit selected-user access for %s", role => {
    const record = { report_key: "list-project-center", active: true, specific_user_ids: [7], data_configuration: source };
    expect(serializeList(record, { id: 7, role, active: true }).canManageTags).toBe(true);
    expect(serializeList(record, { id: 8, role, active: true }).canManageTags).toBe(false);
    expect(serializeList(record, { id: 7, role, active: false }).canManageTags).toBe(false);
    expect(serializeList({ ...record, active: false }, { id: 7, role, active: true }).canManageTags).toBe(false);
  });
  it("normalizes tag whitespace/case and bounds input", () => {
    expect(normalizeProjectTag("  Leadership   Interest ")).toEqual({ name: "Leadership Interest", key: "leadership interest" });
    for (const name of [null, {}, " ", "a".repeat(51), "bad\u0000"]) expect(normalizeProjectTag(name)).toBeNull();
  });
  it("exports quoted CSV and neutralizes spreadsheet formulas", () => {
    expect(projectCsv(["Name", "Tags"], [['Smith, "Jo"', "=HYPERLINK(1)"], ["@formula", "Leadership; Research"]]))
      .toBe('\uFEFF"Name","Tags"\r\n"Smith, ""Jo""","\'=HYPERLINK(1)"\r\n"\'@formula","Leadership; Research"');
  });
});
