import { expect, it, vi } from "vitest";
import { readOutreachNxtReadiness } from "./projectOutreachReadiness";
const context={user:{id:8,role:"mgo"},report:{key:"fictional-project",revision:"r1"}};
it("returns only advisory flags, not credentials, IDs, scopes or raw provider errors", async () => {
  const db=vi.fn().mockResolvedValue([{id:"8",name:"Fictional Caller",connection:"saved",fundraiser_mapped:true,access_token:"secret",refresh_token:"secret",email:"private",blackbaud_constituent_id:"123"}]);
  const value=await readOutreachNxtReadiness(context,db);
  expect(value).toMatchObject({state:"saved",callers:[{id:8,name:"Fictional Caller",connection:"saved",fundraiserMapped:true}]});
  expect(Object.keys(value.callers[0]).sort()).toEqual(["connection","fundraiserMapped","id","name"]);
  expect(JSON.stringify(value)).not.toContain("secret");
  expect(db).toHaveBeenCalledWith(expect.stringContaining("SELECT u.id,u.name"),["fictional-project",8,"r1"]);
  expect(db.mock.calls[0][0]).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/);
});
it("makes metadata failure non-blocking for local work", async () => {
  const value=await readOutreachNxtReadiness(context,vi.fn().mockRejectedValue(new Error("private database details")));
  expect(value).toEqual({state:"unavailable",checkedAt:null,callers:[]});
});
it("does not expose connection status to executive-only project viewers", async () => {
  const db=vi.fn();
  expect(await readOutreachNxtReadiness({...context,user:{id:10,role:"executive"}},db)).toBeNull();
  expect(db).not.toHaveBeenCalled();
});
