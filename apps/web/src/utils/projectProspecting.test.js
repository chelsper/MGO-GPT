import { describe, expect, it } from "vitest";
import { projectSource, projectIdentity, normalizeProjectTag, projectCsv, PROJECT_SECTION } from "./projectProspecting";
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
    expect(listSnapshotKeys(report, "https://app.test")).not.toEqual(listSnapshotKeys({ ...report, dataConfiguration: { ...source, queryId: "99" } }, "https://app.test"));
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
