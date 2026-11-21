import { describe, expect, it } from "vitest";
import { outreachSetupChecks, outreachConnectionLabel } from "./outreachReadiness";
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
});
