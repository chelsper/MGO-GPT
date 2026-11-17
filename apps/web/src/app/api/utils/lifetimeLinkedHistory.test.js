// @vitest-environment node
import { expect, it, vi } from "vitest";
import { advanceLifetimeCheck, newLifetimeCheck, normalizeLifetimeRead, reconcileLifetimeGraph, analyzeReconciledLifetime, summarizeReconciledLifetime } from "./lifetimeLinkedHistory";
const options = { sources: ["committed", "recognition_credit"], fullRecognition: true, today: "2026-11-17" };
const person = n => JSON.stringify(["lookup", `DEMO-${n}`]);
const giftPath = id => `/gift/v1/gifts/${id}`;
const rawGift = (id, type, amount, date, extra = {}) => ({ id, type, amount: { value: amount }, date, balance: { value: 0 }, constituent_id: "1", linked_gifts: [], soft_credits: [], ...extra });
const credit = (giftId, who) => ({ id: `${giftId}${who}`, gift_id: giftId, constituent_id: who, amount: { value: 1 } });
const event = (giftId, type, cents, day, extra = {}) => ({ giftId, type, cents, day, credit: "Regular Gift", recipientIds: [person(1)], ...extra });
function fixture({ gifts, pledges, events }) {
  const data = Object.fromEntries(gifts.map(g => [giftPath(g.id), g]));
  for (const [id, total, balance, applied] of pledges) {
    data[`/gft-gifts/v2/gifts/${id}/installments`] = { pledge_id: id, installments: [{ id: `8${id}`, amount: { value: total }, balance, date: "2025-01-01" }] };
    data[`/gft-gifts/v2/gifts/${id}/pledgepayments`] = { pledge_id: id, pledge_payments: applied.map(([giftId, amount]) => ({ installment_id: `8${id}`, payment_gift_id: giftId, amount_applied: { value: amount } })) };
  }
  for (const id of ["1", "2", "9"]) data[`/constituent/v1/constituents/${id}`] = { id, lookup_id: `DEMO-${id}` };
  const job = { ...newLifetimeCheck(gifts[0].id), stage: "complete", data: Object.fromEntries(Object.entries(data).map(([path, raw]) => [path, normalizeLifetimeRead(path, raw)])) };
  return { data, job, events, analyze: () => analyzeReconciledLifetime(events, options, [job]), resolved: () => reconcileLifetimeGraph(events, job, options).resolved };
}
const early = () => fixture({ gifts: [rawGift("101", "Pledge", 50000, "2020-01-01", { balance: { value: 40000 } }), rawGift("102", "PledgePayment", 10000, "2019-01-01", { linked_gifts: ["101"] })],
  pledges: [["101", 50000, 40000, [["102", 10000]]]], events: [event("101", "Pledge", 5000000, "2020-01-01"), event("102", "Pledge Payment", 1000000, "2019-01-01")] });

it("retains an earlier credited gift on its original date and adds only the remaining later commitment", () => {
  const f = early(), resolved = f.resolved();
  expect(resolved.get("101").cents).toBe(4000000); expect(resolved.get("102").cents).toBe(1000000);
  expect(f.analyze().reasons).toEqual([]);
  expect(summarizeReconciledLifetime(f.analyze(), 1000000)).toMatchObject({ date: "2019-01-01", totalCents: 5000000, crossingGiftIds: ["102"] });
  expect(summarizeReconciledLifetime(f.analyze(), 5000000).date).toBe("2020-01-01");
});
it("does not add an ordinary later payment to its already credited pledge", () => {
  const f = early(); f.events[1].day = "2021-01-01"; f.job.data[giftPath("102")].day = "2021-01-01";
  expect(f.resolved().get("101").cents).toBe(5000000); expect(f.resolved().get("102").cents).toBe(0);
  expect(summarizeReconciledLifetime(f.analyze(), 5000000).date).toBe("2020-01-01");
});
it("does not move recognition back to a pledge credited only to a different person", () => {
  const f = early(); f.events = [f.events[1]];
  const result = reconcileLifetimeGraph(f.events, f.job, options).resolved;
  expect(result.has("101")).toBe(false); expect(result.get("102").cents).toBe(1000000);
});
it("uses an absent query payment as financial evidence only; it adds no recipient credit", () => {
  const f = early(); f.events.splice(1);
  expect(f.resolved().get("101").cents).toBe(5000000); expect(f.resolved().has("102")).toBe(false);
});
it("handles a payment applied to two pledges, preserving its unapplied remainder once", () => {
  const f = fixture({ gifts: [rawGift("101", "Pledge", 500, "2018-01-01", { balance: { value: 400 } }), rawGift("103", "Pledge", 500, "2020-01-01", { balance: { value: 300 } }),
    rawGift("102", "PledgePayment", 350, "2019-01-01", { linked_gifts: ["101", "103"] })],
    pledges: [["101", 500, 400, [["102", 100]]], ["103", 500, 300, [["102", 200]]]],
    events: [event("101", "Pledge", 50000, "2018-01-01"), event("103", "Pledge", 50000, "2020-01-01"), event("102", "Pledge Payment", 35000, "2019-01-01")] });
  expect([...f.resolved().values()].map(e => e.cents).sort((a,b)=>a-b)).toEqual([25000,30000,50000]);
  expect(summarizeReconciledLifetime(f.analyze(), 100000).totalCents).toBe(105000);
});
function writtenOff() {
  return fixture({ gifts: [rawGift("101", "Pledge", 100, "2020-01-01"), rawGift("102", "PledgePayment", 60, "2021-01-01", { linked_gifts: ["101"] }), rawGift("103", "PledgeWriteOff", 40, "2022-01-01", { linked_gifts: ["101"] })],
    pledges: [["101", 100, 0, [["102",60],["103",40]]]], events: [event("101", "Pledge", 10000, "2020-01-01")] });
}
it("reduces a credited pledge for its dated write-off even when neither write-off nor payment appears in query rows", () => {
  const f = writtenOff();
  expect(f.resolved().get("103")).toMatchObject({ cents: -4000, day: "2022-01-01", derived: true });
  expect(f.resolved().has("102")).toBe(false);
  expect(summarizeReconciledLifetime(f.analyze(),5000)).toMatchObject({ totalCents:6000,date:"2020-01-01" });
  expect(summarizeReconciledLifetime(f.analyze(),8000)).toMatchObject({ totalCents:6000,date:null,status:"review",reasons:[expect.stringContaining("later reduction")] });
});
it("does not treat a zero balance with a write-off as fully paid or recalculate a locked date", () => {
  const f = writtenOff(); expect(summarizeReconciledLifetime(f.analyze(),8000,true)).toMatchObject({ calculationSkipped:true,date:null,totalCents:6000 });
});
it("applies a verified write-off even when its query row is excluded as a standalone gift", () => {
  const f = writtenOff(); f.events.push(event("103", "Write-off", 4000, "2022-01-01", {credit:"Constituent MG-Pledge"}));
  expect(f.analyze().items.find(item => item.giftId === "103")).toMatchObject({outcome:"counted",reconciledCents:-4000});
  expect(summarizeReconciledLifetime(f.analyze(),8000).date).toBeNull();
});
it("keeps a subsequently recovered unconfirmed crossing in staff review after a write-off dip", () => {
  const f = writtenOff(); f.events.push(event("104","One-Time Gift",10000,"2023-01-01"));
  expect(summarizeReconciledLifetime(f.analyze(),8000)).toMatchObject({date:null,totalCents:16000,reasons:[expect.stringContaining("later reduction")]});
});
it("keeps the original donor gift separate from its matching pledge/payment and scopes individual vs household credit", () => {
  const gifts = [rawGift("101","MatchingGiftPledge",200,"2020-01-01",{constituent_id:"9",linked_gifts:["103"],soft_credits:[credit("101","1")]}),
    rawGift("102","MatchingGiftPayment",200,"2021-01-01",{constituent_id:"9",linked_gifts:["101","103"],soft_credits:[credit("102","1"),credit("102","2")]}), rawGift("103","Donation",100,"2020-01-01",{linked_gifts:["101"]})];
  const events = [event("101","Matching Gift Pledge",20000,"2020-01-01",{credit:"Soft Credit Recipient"}),
    event("102","Matching Gift Pledge Payment",20000,"2021-01-01",{credit:"Soft Credit Recipient",recipientIds:[person(1),person(2)]}), event("103","One-Time Gift",10000,"2020-01-01")];
  const f = fixture({gifts,pledges:[["101",200,0,[["102",200]]]],events});
  expect(summarizeReconciledLifetime(f.analyze(),30000)).toMatchObject({date:"2020-01-01",totalCents:30000});
  expect(f.resolved().get("103").cents).toBe(10000);
  const second = [ {...events[1],recipientIds:[person(2)]} ];
  const analysis = analyzeReconciledLifetime(second,options,[f.job]);
  expect(summarizeReconciledLifetime(analysis,20000)).toMatchObject({date:"2021-01-01",totalCents:20000});
  const employee = [{...events[0],credit:"Constituent MG-Pledge"}];
  expect(analyzeReconciledLifetime(employee,options,[f.job]).items[0].outcome).toBe("excluded");
});
it("does not excuse missing applications for ordinary pledges or matching payments",()=>{
  for (const type of ["Pledge","MatchingGiftPledge"]) {
    const f=early();
    f.job.data[giftPath("101")].type=type; f.events[0].type=type==="Pledge"?"Pledge":"Matching Gift Pledge";
    f.job.data[giftPath("101")].links.push("103");
    f.job.data[giftPath("103")]=normalizeLifetimeRead(giftPath("103"),rawGift("103",type==="Pledge"?"Donation":"MatchingGiftPayment",100,"2010-01-01",{linked_gifts:["101"]}));
    f.events.push(event("103",type==="Pledge"?"One-Time Gift":"Matching Gift Payment",10000,"2010-01-01"));
    expect(()=>f.resolved()).toThrow(/no verified application/);
  }
});
it.each(["amount","date","identity","type","conflict"])("fails closed on mismatched %s evidence", key => {
  const f=early();
  if(key==="amount") f.events[0].cents++;
  if(key==="date") f.events[0].day="2017-01-01";
  if(key==="identity") f.events[0].recipientIds=[person(2)];
  if(key==="type") f.events[0].type="Planned Gift";
  if(key==="conflict") f.events[0].conflict=true;
  expect(()=>f.resolved()).toThrow(); expect(f.analyze().reasons.length).toBeGreaterThan(0);
  expect(summarizeReconciledLifetime(f.analyze(),1).date).toBeNull();
});
it.each(["amount","date","identity"])("validates %s on an original donor gift linked to a matching pledge", key => {
  const f=early();
  f.job.data[giftPath("101")].links.push("103");
  f.job.data[giftPath("103")]=normalizeLifetimeRead(giftPath("103"),rawGift("103","Donation",100000,"2010-01-01"));
  f.events.push(event("103","One-Time Gift",10000000,"2010-01-01"));
  if(key==="amount") f.job.data[giftPath("103")].cents=100;
  if(key==="date") f.job.data[giftPath("103")].day="2011-01-01";
  if(key==="identity") f.job.data[giftPath("103")].owner="2";
  expect(()=>f.resolved()).toThrow();
  const analysis=f.analyze();
  expect(summarizeReconciledLifetime(analysis,9000000).date).toBeNull();
  expect(analysis.items.find(item=>item.giftId==="103").outcome).toBe("review");
  expect(analysis.supportedEvents.some(item=>item.giftId==="103")).toBe(false);
});
it("does not infer recognition without an explicit recipient identity",()=>{
  const f=early(); f.events[0].recipientIds=[]; expect(()=>f.resolved()).toThrow(/identity/);
});
it("rejects overlapping reconciliations without partially applying the second graph",()=>{
  const f=early();
  const analysis=analyzeReconciledLifetime(f.events,options,[f.job,f.job]);
  expect(analysis.reasons).toContain("Overlapping saved reconciliations need a fresh check.");
  expect(analysis.supportedEvents).toHaveLength(0);
  expect(summarizeReconciledLifetime(analysis,1).date).toBeNull();
});
it("rejects duplicate, incomplete, overapplied or wrong-pledge applications", () => {
  for(const kind of ["duplicate","missing","over","link"]) {
    const f=early(), rows=f.job.data["/gft-gifts/v2/gifts/101/pledgepayments"].rows;
    if(kind==="duplicate") rows.push({...rows[0]});
    if(kind==="missing") rows.length=0;
    if(kind==="over") rows[0].cents++;
    if(kind==="link") f.job.data[giftPath("102")].links=[];
    expect(()=>f.resolved()).toThrow();
  }
});
it("rejects incomplete collections, unsafe amounts, invalid dates, unexpected types and parent IDs", () => {
  const path="/gft-gifts/v2/gifts/101/pledgepayments";
  for(const raw of [{pledge_id:"101",pledge_payments:[],count:2},{pledge_id:"101",pledge_payments:[],next_link:"secret"},{pledge_id:"999",pledge_payments:[]}]) expect(()=>normalizeLifetimeRead(path,raw)).toThrow();
  for(const change of [{amount:{value:null}},{date:"2020-02-31"},{type:"PlannedGift"},{id:"999"},{linked_gifts:["101"]}]) expect(()=>normalizeLifetimeRead(giftPath("101"),rawGift("101","Pledge",100,"2020-01-01",change))).toThrow();
});
it("supports resumable one-GET steps with no query or provider write and rechecks every collected object", async () => {
  const f=early(), read=vi.fn(async path=>f.data[path]); let job=newLifetimeCheck("101");
  for(let n=0;n<30 && job.stage!=="complete";n++) {
    const count=read.mock.calls.length, before=JSON.stringify(job); const next=await advanceLifetimeCheck(job,f.events,read);
    expect(read.mock.calls.length-count).toBe(1); expect(JSON.stringify(job)).toBe(before); job=next;
  }
  expect(job.stage).toBe("complete"); expect(job.reads).toBe(job.queue.length*2);
  for(const path of job.queue) expect(read.mock.calls.filter(([p])=>p===path)).toHaveLength(2);
  expect(reconcileLifetimeGraph(f.events,job,options).resolved.get("101").cents).toBe(4000000);
});
it("resumes JSONB checkpoints whose object keys have been recursively reordered",async()=>{
  const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value;
  const f=early(); let job=newLifetimeCheck("101");
  for(let n=0;n<30&&job.stage!=="complete";n++) job=reorder(await advanceLifetimeCheck(job,f.events,async path=>f.data[path]));
  expect(job.stage).toBe("complete"); expect(f.resolved().get("101").cents).toBe(4000000);
});
it("does not advance on provider failures and rejects changed or expired evidence", async () => {
  const f=early(), original=newLifetimeCheck("101");
  await expect(advanceLifetimeCheck(original,f.events,async()=>{throw new Error("private provider data");})).rejects.toThrow();
  expect(original.reads).toBe(0); expect(original.data).toEqual({});
  let job=original; const read=vi.fn(async path=>f.data[path]);
  while(job.stage==="collect") job=await advanceLifetimeCheck(job,f.events,read);
  f.data[giftPath("101")].amount.value++;
  await expect(advanceLifetimeCheck(job,f.events,read)).rejects.toThrow(/changed/);
  await expect(advanceLifetimeCheck({...original,startedAt:"2000-01-01"},f.events,read)).rejects.toThrow(/expired/);
});
it("groups same-day debits and credits before a threshold crossing", () => {
  const a={reasons:[],supportedEvents:[{day:"2020-01-01",giftId:"1",cents:100},{day:"2020-01-01",giftId:"2",cents:-50}]};
  expect(summarizeReconciledLifetime(a,80).date).toBeNull();
});
