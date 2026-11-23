import { describe, expect, it } from "vitest";
import { outreachSetupChecks, outreachConnectionLabel, outreachPhoneCoverage } from "./outreachReadiness";
import { report, snapshot, saved } from "../../test/fixtures/projectOutreach";
const checks = (state = saved, data = snapshot, config = report) => Object.fromEntries(outreachSetupChecks(config, data, state).map(c => [c.key, c]));

describe("saved outreach setup checklist", () => {
  it("counts distinct people and separates optional contact data from required setup", () => {
    const value = checks();
    expect(value.source.detail).toContain("2 distinct");
    expect(value.identity.state).toBe("ready");
    expect(value.nameColumn.state).toBe("ready");
    expect(value.phoneColumn).toMatchObject({state:"review"});
    expect(value.phoneColumn.detail).toContain("1 person");
    expect(value.restrictionColumn.detail).toContain("Blank values do not mean");
    expect(value.deadline.state).toBe("ready");
  });
  it("handles no query yet without implying an NXT failure", () => {
    const value = checks({...saved,settings:null,canManage:true},null);
    expect(value.source).toMatchObject({state:"needed"});
    expect(value.source.detail).toContain("No complete saved results yet");
    expect(value.identity.state).toBe("needed");
    expect(value.callers.state).toBe("needed");
    expect(value.instructions.state).toBe("review");
    expect(value.phoneColumn.state).toBe("review");
  });
  it("distinguishes empty complete results, invalid IDs and ambiguous column mappings", () => {
    expect(checks(saved,{...snapshot,tableRows:[]}).source.state).toBe("ready");
    const invalid={...snapshot,tableRows:[...snapshot.tableRows,["bad","Name","",""]]};
    expect(checks(saved,invalid).identity).toMatchObject({state:"review"});
    expect(checks(saved,invalid).identity.detail).toContain("1 row");
    expect(checks(saved,snapshot,{...report,dataConfiguration:{systemIdColumn:"QRECID"}}).identity.state).toBe("needed");
    expect(checks(saved,{...snapshot,headers:[...snapshot.headers,"Name"]}).nameColumn.state).toBe("needed");
  });
  it("flags elapsed deadlines and missing instructions as suggestions, not new write gates", () => {
    const value=checks({...saved,today:"2027-01-02",settings:{...saved.settings,instructions:"  ",phoneColumn:"",restrictionColumn:""}});
    expect(value.deadline.state).toBe("review");
    expect(value.instructions.state).toBe("review");
    expect(value.phoneColumn.state).toBe("review");
    expect(value.restrictionColumn.state).toBe("review");
  });
  it("does not label saved credentials as a verified live connection", () => {
    expect(outreachConnectionLabel("saved")).toBe("Connection saved");
    expect(outreachConnectionLabel("refresh_due")).toContain("renewal due");
    expect(outreachConnectionLabel("reconnect")).toContain("Reconnect");
    expect(outreachConnectionLabel("not_connected")).toContain("No saved");
    expect(outreachConnectionLabel("unknown")).toContain("unavailable");
  });
  it("counts mapped alternate phone values without claiming missing contacts",()=>{
    const data={...snapshot,headers:[...snapshot.headers,"Home phone"],tableRows:snapshot.tableRows.map(row=>[...row,"904-555-0100"])};
    expect(checks({...saved,settings:{...saved.settings,alternatePhoneColumn:"Home phone"}},data).phoneColumn.state).toBe("ready");
    expect(checks({...saved,settings:{...saved.settings,alternatePhoneColumn:"Missing"}},data).phoneColumn.state).toBe("review");
  });
});

describe("saved phone coverage", () => {
  const data = {...snapshot, headers:[...snapshot.headers,"Home phone"],
    tableRows:snapshot.tableRows.map(row=>[...row, row[0] === "456" ? "904-555-0100" : ""])};
  const mapped = {...saved.settings,alternatePhoneColumn:"Home phone"};
  it("counts people, not repeated rows, and shows alternate-only coverage", () => {
    expect(outreachPhoneCoverage(report,data,mapped)).toMatchObject({
      total:2, withPrimary:1, withAlternateOnly:1, withPhone:2, missingPhone:0,
      primaryMapped:true, alternateMapped:true,
    });
    expect(checks({...saved,settings:mapped},data).phoneColumn.detail).toContain("1 relies on the alternate phone");
  });
  it("does not treat an unmapped home phone or duplicate mapping as extra coverage", () => {
    expect(outreachPhoneCoverage(report,data,saved.settings)).toMatchObject({withPhone:1,missingPhone:1});
    expect(outreachPhoneCoverage(report,data,{...mapped,alternatePhoneColumn:"Phone"})).toMatchObject({withPhone:1,withAlternateOnly:0,missingPhone:1});
    expect(outreachPhoneCoverage(report,{...data,headers:[...data.headers,"Home phone"]},mapped)).toMatchObject({withPhone:1,missingPhone:1,alternateMapped:false});
  });
  it("keeps an explicitly unmapped primary phone and blank values distinct from an alternate", () => {
    expect(outreachPhoneCoverage(report,data,{...mapped,phoneColumn:""})).toMatchObject({withPhone:1,withAlternateOnly:1,primaryMapped:false});
    const blank={...data,tableRows:data.tableRows.map(row=>[...row.slice(0,-1),"  "])};
    expect(outreachPhoneCoverage(report,blank,mapped)).toMatchObject({withPhone:1,missingPhone:1});
  });
  it("distinguishes unavailable data from a complete empty list", () => {
    expect(outreachPhoneCoverage(report,null,mapped)).toBeNull();
    expect(outreachPhoneCoverage(report,{...data,generatedAt:null},mapped)).toBeNull();
    expect(outreachPhoneCoverage({...report,dataConfiguration:{systemIdColumn:"QRECID"}},data,mapped)).toBeNull();
    expect(outreachPhoneCoverage(report,{...data,tableRows:[]},mapped)).toMatchObject({total:0,withPhone:0,missingPhone:0});
  });
  it("excludes unidentified rows and does not infer calling permission from coverage", () => {
    const invalid={...data,tableRows:[...data.tableRows,["bad","Name","904-555-0199","",""]]};
    expect(outreachPhoneCoverage(report,invalid,mapped)).toMatchObject({total:2,withPhone:2});
    expect(checks({...saved,settings:{...mapped,restrictionColumn:""}},data).restrictionColumn.state).toBe("review");
    expect(outreachPhoneCoverage(report,data,null)).toMatchObject({total:2,withPhone:0,missingPhone:2});
  });
});
