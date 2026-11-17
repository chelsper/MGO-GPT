// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./reportRefresh", () => ({ getReportRefreshUser: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn(), getBlackbaudConnection: vi.fn() }));
vi.mock("./savedQueryExecution", () => ({ executeSavedQueryResults: vi.fn() }));
vi.mock("./givingSocietyConfigurations", () => ({ listGivingSocietyConfigurations: vi.fn() }));
import { checkLifetimeLinkedHistory } from "./lifetimeLinkedReports";
import { inspectLifetimeQuery, publicLifetimeState, savedLifetimeGiftReview, updateLifetimeRecord } from "./lifetimeSocieties";
import { aggregateLifetimeHistory, LIFETIME_LIMITS } from "./lifetimeSocietyHistory";
import { lifetimeQueryFixture, lifetimeCsvFixture, lifetimeRules } from "../../../../test/lifetimeQueryFixture";

function fixture({rows=[{type:"Pledge"},{giftId:"102",type:"Pledge Payment",amount:"20000",date:"1/1/2019"}], sourceOptions={}}={}) {
  const source = inspectLifetimeQuery(lifetimeQueryFixture(sourceOptions));
  let state = {revision:"a".repeat(36), snapshot:{...aggregateLifetimeHistory(lifetimeCsvFixture(rows,sourceOptions),source,lifetimeRules,rows.length,new Date("2026-11-17")),
    societies:lifetimeRules,source,rulesFingerprint:createHash("sha256").update(JSON.stringify(lifetimeRules)).digest("hex")}};
  const raw = {
    "/gift/v1/gifts/101":{id:"101",type:"Pledge",amount:{value:100000},balance:{value:80000},date:"2020-01-01",constituent_id:"1",soft_credits:[],linked_gifts:[]},
    "/gift/v1/gifts/102":{id:"102",type:"PledgePayment",amount:{value:20000},date:"2019-01-01",constituent_id:"1",soft_credits:[],linked_gifts:["101"]},
    "/constituent/v1/constituents/1":{id:"1",lookup_id:"DEMO-1"},
    "/gft-gifts/v2/gifts/101/installments":{pledge_id:"101",installments:[{id:"801",amount:{value:100000},balance:80000,date:"2025-01-01"}]},
    "/gft-gifts/v2/gifts/101/pledgepayments":{pledge_id:"101",pledge_payments:[{installment_id:"801",payment_gift_id:"102",amount_applied:{value:20000}}]},
  };
  const db = vi.fn(async (strings,...values) => {
    if(strings.join().startsWith("SELECT")) return [{payload:structuredClone(state)}];
    if(values.at(-1)!==state.revision) return [];
    state=JSON.parse(values[0]); return [{report_key:"saved"}];
  });
  const read=vi.fn(async path=>structuredClone(raw[path])), transport=vi.fn(async()=>({read}));
  const view=()=>publicLifetimeState(state,lifetimeRules);
  const run=(extra={})=>checkLifetimeLinkedHistory({revision:state.revision,milestoneKey:view().snapshot.rows[0].milestoneKey,
    giftId:"101",operation:"check-linked",user:{id:1},db,transport,rules:async()=>lifetimeRules,now:()=>new Date("2026-11-17T12:00:00Z"),...extra});
  return {run,view,read,db,transport,raw,state:()=>state,job:()=>Object.values(state.snapshot.giftReview.linkedScopes||{})[0]?.job};
}
it("saves at most five reads per turn, resumes without replay and publishes only completed reconciliations", async()=>{
  const f=fixture(); await f.run();
  expect(f.read).toHaveBeenCalledTimes(5); expect(f.job().stage).toBe("verify");
  expect(f.view().snapshot.rows[0].date).toBeNull();
  await f.run(); expect(f.job().status).toBe("complete"); expect(f.read).toHaveBeenCalledTimes(10);
  expect(f.view().snapshot.rows[0]).toMatchObject({date:"2020-01-01",totalCents:10000000,status:"provisional"});
  const revision=f.state().revision; await f.run(); expect(f.read).toHaveBeenCalledTimes(10); expect(f.state().revision).toBe(revision);
  expect(f.view().snapshot).not.toHaveProperty("giftReview"); expect(JSON.stringify(f.view())).not.toContain("soft_credits");
  const detail=savedLifetimeGiftReview(f.state(),lifetimeRules,{revision,milestoneKey:f.view().snapshot.rows[0].milestoneKey});
  expect(detail.counts.review).toBe(0); expect(detail.items.find(i=>i.giftId==="101").reconciledCents).toBe(8000000);
});
it("preserves confirmed dates and archive decisions when linked checks finish",async()=>{
  const f=fixture(), row=f.view().snapshot.rows[0];
  f.state().recordDecisions={milestones:[{key:row.milestoneKey,date:"1998-04-01",crossingGiftIds:["old"],ruleVersion:5,rulesFingerprint:f.state().snapshot.rulesFingerprint}],archives:[{key:"unrelated"}]};
  await f.run(); await f.run();
  expect(f.view().snapshot.rows[0]).toMatchObject({date:"1998-04-01",status:"confirmed",crossingGiftIds:["old"]});
  expect(f.state().recordDecisions.archives).toEqual([{key:"unrelated"}]);
});
it("retains archived company credits, counts shared spouse gifts once and changes only the checked household",async()=>{
  const f=fixture({sourceOptions:{identity:false,spouses:true},rows:[
    {type:"Pledge",credit:"Soft Credit Recipient",spouseId:"DEMO-2",maritalStatus:"Married"},
    {id:"2",name:"Fictional Spouse",type:"Pledge",credit:"Soft Credit Recipient",spouseId:"DEMO-1",maritalStatus:"Married"},
    {id:"9",name:"Example Company",constituentType:"O",type:"Pledge"},
    {id:"9",name:"Example Company",constituentType:"O",giftId:"999",amount:"9000000"},
  ]});
  f.raw["/gift/v1/gifts/101"].constituent_id="9";
  f.raw["/gift/v1/gifts/101"].soft_credits=["1","2"].map(id=>({id:`10${id}`,constituent_id:id,gift_id:"101",amount:{value:100000}}));
  f.raw["/constituent/v1/constituents/2"]={id:"2",lookup_id:"DEMO-2"};
  const company=f.view().snapshot.rows.find(row=>row.name==="Example Company");
  f.state().recordDecisions={archives:[{key:company.recordKey}]};
  const before=structuredClone(f.view().snapshot.rows);
  const milestoneKey=f.view().snapshot.sharedGroups[0].rows[0].milestoneKey;
  for(let i=0;i<4&&f.job()?.status!=="complete";i++) await f.run({milestoneKey});
  expect(f.job().status).toBe("complete");
  expect(f.view().snapshot.sharedGroups[0].rows[0]).toMatchObject({totalCents:10000000,date:"2020-01-01"});
  expect(f.view().snapshot.rows).toEqual(before);
  expect(f.read.mock.calls.map(([path])=>path)).not.toContain("/gift/v1/gifts/999");
});
it("pauses on provider errors with saved progress and no private provider payload",async()=>{
  const f=fixture(); f.read.mockImplementationOnce(async path=>f.raw[path]).mockRejectedValueOnce(new Error("private token donor"));
  await f.run(); expect(f.job()).toMatchObject({status:"paused",reads:1}); expect(f.job().message).not.toMatch(/private|token|donor/);
  expect(f.view().snapshot.rows[0].date).toBeNull(); await f.run(); await f.run(); expect(f.job().status).toBe("complete");
});
it("marks changed NXT evidence for review and withholds unconfirmed dates",async()=>{
  const f=fixture(); await f.run(); f.raw["/gift/v1/gifts/101"].amount.value++;
  await f.run(); expect(f.job().status).toBe("attention"); expect(f.job().message).toMatch(/changed/);
  expect(f.view().snapshot.rows[0].date).toBeNull(); const count=f.read.mock.calls.length;
  await f.run(); expect(f.read).toHaveBeenCalledTimes(count);
});
it("invalidates a previously accepted calculation on contradictory evidence and rejects confirmation",async()=>{
  const f=fixture(); await f.run(); await f.run();
  expect(f.view().snapshot.rows[0].status).toBe("provisional");
  f.raw["/gift/v1/gifts/101"].amount.value=50000;
  f.raw["/gift/v1/gifts/101"].balance.value=30000;
  const installment=f.raw["/gft-gifts/v2/gifts/101/installments"].installments[0];
  installment.amount.value=50000; installment.balance=30000;
  await f.run({operation:"restart-linked"}); await f.run();
  const row=f.view().snapshot.rows[0];
  expect(f.job().status).toBe("attention"); expect(row).toMatchObject({date:null,status:"review"});
  expect(row.reasons.join(" ")).toMatch(/differ/);
  expect(Object.values(f.state().snapshot.giftReview.linkedScopes)[0].checks).toEqual([]);
  await expect(updateLifetimeRecord({operation:"confirm-date",revision:f.state().revision,milestoneKey:row.milestoneKey,
    user:{id:1},db:f.db,rules:async()=>lifetimeRules})).rejects.toThrow(/supported provisional/);
  await f.run({operation:"restart-linked"});
  expect(f.view().snapshot.rows[0].date).toBeNull();
});
it("preserves a locked date but exposes new warnings after a contradictory recheck",async()=>{
  const f=fixture(); await f.run(); await f.run(); const row=f.view().snapshot.rows[0];
  await updateLifetimeRecord({operation:"confirm-date",revision:f.state().revision,milestoneKey:row.milestoneKey,
    user:{id:1},db:f.db,rules:async()=>lifetimeRules});
  await f.run({operation:"restart-linked"}); f.raw["/gift/v1/gifts/101"].amount.value++;
  await f.run();
  expect(f.view().snapshot.rows[0]).toMatchObject({date:row.date,status:"confirmed"});
  expect(f.view().snapshot.rows[0].reasons.length).toBeGreaterThan(0);
});
it("clears a blocked check only after successful verification, not after a restart or provider pause",async()=>{
  const f=fixture(); await f.run(); f.raw["/gift/v1/gifts/101"].amount.value++;
  await f.run(); f.raw["/gift/v1/gifts/101"].amount.value--;
  f.read.mockRejectedValueOnce(new Error("timeout")); await f.run({operation:"restart-linked"});
  expect(Object.values(f.state().snapshot.giftReview.linkedScopes)[0].blockedChecks).toHaveLength(1);
  expect(f.view().snapshot.rows[0].date).toBeNull();
  await f.run(); await f.run();
  expect(Object.values(f.state().snapshot.giftReview.linkedScopes)[0].blockedChecks).toEqual([]);
  expect(f.view().snapshot.rows[0].status).toBe("provisional");
});
it("does not clear unresolved evidence for gifts outside a newly verified graph",async()=>{
  const f=fixture(); await f.run(); await f.run();
  const scope=Object.values(f.state().snapshot.giftReview.linkedScopes)[0];
  scope.blockedChecks=[{seed:"101",giftIds:["101","999"],reason:"Previously linked records need review; refresh gift history if links changed."}];
  await f.run({operation:"restart-linked"}); await f.run();
  expect(f.job().status).toBe("complete");
  expect(f.view().snapshot.rows[0]).toMatchObject({date:null,status:"review"});
  expect(Object.values(f.state().snapshot.giftReview.linkedScopes)[0].blockedChecks).toHaveLength(1);
});
it("rejects stale, invented, archived or inactive household targets before NXT reads",async()=>{
  const f=fixture();
  await expect(f.run({revision:"old"})).rejects.toThrow(/changed/);
  await expect(f.run({giftId:"999"})).rejects.toThrow(/Choose a pledge/);
  await expect(f.run({milestoneKey:"0".repeat(64)})).rejects.toThrow(/no longer/);
  f.state().recordDecisions={archives:[{key:f.view().snapshot.rows[0].recordKey}]};
  await expect(f.run()).rejects.toThrow(/active/); expect(f.transport).not.toHaveBeenCalled();
});
it("does not overwrite a concurrent refresh or publish after rules changed",async()=>{
  const f=fixture(); f.db.mockImplementation(async strings=>strings.join().startsWith("SELECT")?[{payload:structuredClone(f.state())}]:[]);
  await expect(f.run()).rejects.toThrow(/another update/);
  const g=fixture(), rules=vi.fn().mockResolvedValueOnce(lifetimeRules).mockResolvedValueOnce([]);
  await expect(g.run({rules})).rejects.toThrow(/rules changed/); expect(g.job()).toBeUndefined();
});
it("rejects oversize checkpoints without truncating or publishing",async()=>{
  const f=fixture(), limit=LIFETIME_LIMITS.bytes;
  try{LIFETIME_LIMITS.bytes=1;await expect(f.run()).rejects.toThrow(/exceeds/);expect(f.job()).toBeUndefined();}
  finally{LIFETIME_LIMITS.bytes=limit;}
});
it("restarts an expired check explicitly and does not refresh the saved query",async()=>{
  const f=fixture(); await f.run(); f.job().startedAt="2000-01-01";
  await f.run(); expect(f.job().status).toBe("attention");
  await f.run({operation:"restart-linked"}); expect(f.job().status).toBe("running");
  await f.run(); expect(f.job().status).toBe("complete");
  expect(f.read.mock.calls.every(([path])=>!path.includes("query"))).toBe(true);
});
