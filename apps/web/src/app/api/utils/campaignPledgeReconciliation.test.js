import { describe, expect, it, vi } from "vitest";
import { advanceCampaignPledge, campaignPledgeAllocations } from "./campaignPledgeReconciliation";

export function pledgeFixture({ matching=false, split=false }={}) {
  const gift = { id:"10",type:matching ? "MatchingGiftPledge" : "Pledge",amount:{value:750000},balance:{value:0},date_modified:"2026-10-14T10:00:00Z",
    gift_splits:split ? [{id:"71",fund_id:"4",amount:{value:450000}},{id:"72",fund_id:"5",amount:{value:300000}}] : [{id:"71",fund_id:"4",amount:{value:750000}}] };
  const installments = { installments:Array.from({length:5},(_,i)=>({id:String(i+1),amount:{value:150000},balance:0})) };
  const applications = { pledge_id:"10",pledge_payments:Array.from({length:5},(_,i)=>({installment_id:String(i+1),payment_gift_id:String(i<2 ? i+20 : 22),amount_applied:{value:150000}})) };
  const details = {
    "20":{id:"20",type:matching ? "MatchingGiftPayment" : "PledgePayment",amount:{value:150000},linked_gifts:["10"]},
    "21":{id:"21",type:matching ? "MatchingGiftPayment" : "PledgePayment",amount:{value:150000},linked_gifts:["10"]},
    "22":{id:"22",type:matching ? "MatchingGiftWriteOff" : "PledgeWriteOff",amount:{value:450000},linked_gifts:["10"]},
  };
  const transport = { gift:vi.fn(async id=>structuredClone(id==="10" ? gift : details[id])),pledge:vi.fn(async (_id,section)=>structuredClone(section==="installments" ? installments : applications)) };
  return {gift,installments,applications,details,transport};
}
async function finish(t) {
  let check = {gift_id:"10",stage:"gift",draft:{}};
  for (let i=0;i<30 && check.stage!=="complete";i++) check = await advanceCampaignPledge(check,t);
  expect(check.stage).toBe("complete");
  return check;
}
const row = (splitId=null,fundId="4",amount=75000000) => ({item_key:splitId ? `10:${splitId}` : "10",gift_id:"10",split_id:splitId,fund_id:fundId,amount_cents:String(amount),gift_type:"Pledge",gift_date:"8/9/2021",fund_name:"Fund",donor_name:""});

describe("campaign pledge reconciliation",()=>{
  it("finds zero-balance pledge write-offs without multiplying the gift across installments",async()=>{
    const f=pledgeFixture(),done=await finish(f.transport);
    expect(done.result).toMatchObject({originalCents:75000000,writeOffCents:45000000,paidCents:30000000,balanceCents:0});
    expect(done.result.evidence).toHaveLength(3);
    expect(f.transport.gift.mock.calls.filter(([id])=>id==="22")).toHaveLength(1);
    expect(campaignPledgeAllocations([row()],done,"gift")[0])
      .toMatchObject({amountCents:75000000,writeOffCents:45000000,pledgeBalanceCents:0});
  });
  it("does not assume a matching pledge's original donation is its payment or call unsupported APIs",async()=>{
    const f=pledgeFixture({matching:true}); f.gift.linked_gifts=["99"];
    await expect(finish(f.transport)).rejects.toThrow(/does not support matching/);
    expect(f.transport.pledge).not.toHaveBeenCalled();
    expect(f.transport.gift.mock.calls).toEqual([["10"]]);
  });
  it("only credits the amount applied to this pledge, not a shared payment's full value",async()=>{
    const f=pledgeFixture(); f.details["20"].amount.value=1000000; f.details["20"].linked_gifts.push("99");
    expect((await finish(f.transport)).result.paidCents).toBe(30000000);
  });
  it("reconciles an unpaid pledge without mistaking its balance for received money",async()=>{
    const f=pledgeFixture(); f.gift.balance.value=750000; f.installments.installments.forEach(i=>i.balance=150000); f.applications.pledge_payments=[];
    expect((await finish(f.transport)).result).toMatchObject({writeOffCents:0,paidCents:0,balanceCents:75000000});
  });
  it("allocates whole-gift deductions across actual splits and supports selected split subsets",async()=>{
    const f=pledgeFixture({split:true}),done=await finish(f.transport);
    const values=campaignPledgeAllocations([row("71","4",45000000),row("72","5",30000000)],done,"gift");
    expect(values.map(v=>v.writeOffCents)).toEqual([27000000,18000000]);
    expect(campaignPledgeAllocations([row("72","5",30000000)],done,"split")[0].writeOffCents).toBe(18000000);
    expect(()=>campaignPledgeAllocations([row("72","5",30000000)],done,"gift")).toThrow(/omits/);
  });
  it.each([
    ["missing balance",f=>delete f.gift.balance],
    ["wrong pledge ID",f=>f.gift.id="99"],
    ["incomplete installment list",f=>f.installments.installments.pop()],
    ["incomplete applications",f=>f.applications.pledge_payments.pop()],
    ["duplicate applications",f=>f.applications.pledge_payments.push(f.applications.pledge_payments[0])],
    ["missing linked record",f=>delete f.details["22"]],
    ["unlinked write-off",f=>f.details["22"].linked_gifts=[]],
    ["unknown gift type",f=>f.details["22"].type="Adjustment"],
    ["applications exceed write-off",f=>f.details["22"].amount.value=1],
    ["truncated pagination",f=>f.applications.next_link="https://example.test/next"],
    ["wrong parent pledge",f=>f.applications.pledge_id="999"],
  ])("stops publication for %s",async(_name,change)=>{
    const f=pledgeFixture(); change(f); await expect(finish(f.transport)).rejects.toThrow();
  });
  it("rejects a query amount or fund that no longer matches NXT",async()=>{
    const done=await finish(pledgeFixture().transport);
    expect(()=>campaignPledgeAllocations([row(null,"4",100)],done,"gift")).toThrow(/differs/);
    expect(()=>campaignPledgeAllocations([row(null,"99")],done,"gift")).toThrow(/differs/);
  });
  it("checks again for pledge and application changes before accepting results",async()=>{
    const f=pledgeFixture(); let n=0;
    f.transport.gift.mockImplementation(async id=>id==="10" ? {...f.gift,date_modified:++n===1 ? "initial" : "changed"} : f.details[id]);
    await expect(finish(f.transport)).rejects.toThrow(/changed during/);
    const g=pledgeFixture(); let p=0;
    g.transport.pledge.mockImplementation(async(_id,section)=>section==="installments" ? g.installments : ++p===1 ? g.applications : {...g.applications,pledge_payments:[]});
    await expect(finish(g.transport)).rejects.toThrow();
  });
  it("resumes from a saved checkpoint after a linked gift read fails",async()=>{
    const f=pledgeFixture(); let check={gift_id:"10",stage:"gift",draft:{}};
    for(let i=0;i<4;i++) check=await advanceCampaignPledge(check,f.transport);
    f.transport.gift.mockRejectedValueOnce(Object.assign(new Error("pause"),{httpStatus:429}));
    await expect(advanceCampaignPledge(check,f.transport)).rejects.toMatchObject({httpStatus:429});
    while(check.stage!=="complete") check=await advanceCampaignPledge(check,f.transport);
    expect(f.transport.gift.mock.calls.filter(([id])=>id==="20")).toHaveLength(1);
    expect(check.result.writeOffCents).toBe(45000000);
  });
  it("accepts JSONB key ordering but still verifies all persisted pledge and application values",async()=>{
    const f=pledgeFixture(); let check={gift_id:"10",stage:"gift",draft:{}};
    const persisted=value=>JSON.parse(JSON.stringify(value,(_,v)=>v && typeof v==="object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v));
    while(check.stage!=="complete") check=persisted(await advanceCampaignPledge(check,f.transport));
    expect(check.result).toMatchObject({writeOffCents:45000000,paidCents:30000000});
  });
});
