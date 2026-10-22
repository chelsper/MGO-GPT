// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("./sql",()=>({default:vi.fn(()=>{throw new Error("Live SQL forbidden");})}));
import { inspectInvestmentQuery } from "./campaignInvestmentQuery";
import { readInvestmentQuery, campaignSourceKey } from "./campaignPriorityQuery";
import { validateCampaignInvestment } from "@/utils/campaignInvestment";
const config={queryId:"31071",queryName:"Comprehensive Investment",giftIdColumn:"System Record ID"};
const metadata={id:31071,type:"Gift",name:config.queryName,select_fields:["Name","Gift Amount","System Record ID"].map(name=>({query_field:{selected_field_name:name}}))};
const url="https://nsa-pusa01.app.blackbaud.net/fixture.csv";
const streamCsv=csv=>async(_url,options,create)=>{
  expect(options.redirect).toBe("error");expect(options.maxBytes).toBe(128*1024*1024);
  const consumer=create({contentType:"text/csv; charset=utf-8"}),bytes=new TextEncoder().encode(csv);
  for(let i=0;i<bytes.length;i+=1000)await consumer.write(bytes.subarray(i,i+1000));
  return {result:await consumer.finish()};
};
describe("Comprehensive Investment membership query",()=>{
  it("validates explicit subset confirmation and exact system ID metadata",()=>{
    expect(validateCampaignInvestment({...config,confirmed:true})).toEqual(config);
    expect(()=>validateCampaignInvestment(config)).toThrow(/Confirm/);
    expect(()=>validateCampaignInvestment({...config,confirmed:true,amount:"Gift Amount"})).toThrow();
    expect(inspectInvestmentQuery(metadata,config).queryId).toBe("31071");
    for(const change of [{id:5},{type:"Constituent"},{name:"Changed"},{has_ask_fields:true},{can_execute:false}])
      expect(()=>inspectInvestmentQuery({...metadata,...change},config)).toThrow();
    expect(()=>inspectInvestmentQuery(metadata,{...config,giftIdColumn:"Gift Amount"})).toThrow();
  });
  it("deduplicates by gift system ID and never consumes a second amount",async()=>{
    const result=await readInvestmentQuery(url,{},config,3,streamCsv("System Record ID,Gift Amount\n11,500000\n11,999999\n12,garbage"));
    expect(result).toEqual({rawRows:3,giftIds:["11","12"]});
  });
  it("accepts an explicit complete empty result",async()=>{
    expect(await readInvestmentQuery(url,{},config,0,streamCsv("System Record ID\n"))).toEqual({rawRows:0,giftIds:[]});
  });
  it.each([null,-1,300001,1.5])("rejects invalid count %s before reading",async count=>{
    const stream=vi.fn();await expect(readInvestmentQuery(url,{},config,count,stream)).rejects.toThrow();expect(stream).not.toHaveBeenCalled();
  });
  it.each(["Wrong ID\n11","System Record ID\nabc","System Record ID\n0","System Record ID,System Record ID\n1,2"])("rejects untrustworthy IDs and headers",async csv=>{
    await expect(readInvestmentQuery(url,{},config,1,streamCsv(csv))).rejects.toThrow();
  });
  it("rejects incomplete downloads and unsafe hosts",async()=>{
    await expect(readInvestmentQuery(url,{},config,2,streamCsv("System Record ID\n11"))).rejects.toThrow(/count/);
    const stream=vi.fn();await expect(readInvestmentQuery("https://unsafe.invalid/a",{},config,1,stream)).rejects.toThrow();expect(stream).not.toHaveBeenCalled();
  });
});
describe("Budget Relieving membership query",()=>{
  const budget={queryId:"31072",queryName:"Budget Relieving",giftIdColumn:"System Record ID"};
  it("requires an explicit subset confirmation and the correct Gift metadata, never amount inputs",()=>{
    expect(validateCampaignInvestment({...budget,confirmed:true},"budgetRelieving")).toEqual(budget);
    expect(()=>validateCampaignInvestment(budget,"budgetRelieving")).toThrow(/Budget Relieving/);
    expect(()=>validateCampaignInvestment({...budget,confirmed:true,amount:"Gift Amount"},"budgetRelieving")).toThrow();
    expect(inspectInvestmentQuery({...metadata,id:"31072",name:budget.queryName},budget,"budgetRelieving")).toMatchObject({queryId:"31072"});
    expect(()=>inspectInvestmentQuery(metadata,budget,"budgetRelieving")).toThrow();
    expect(()=>validateCampaignInvestment({...budget,confirmed:true},"untrusted")).toThrow(/Unknown/);
  });
  it("deduplicates Budget Relieving IDs, ignoring every amount supplied by the classification query",async()=>{
    expect(await readInvestmentQuery(url,{},budget,3,streamCsv("System Record ID,Amount\n11,999999\n11,-22\n12,invalid"),"budgetRelieving"))
      .toEqual({rawRows:3,giftIds:["11","12"]});
    expect(await readInvestmentQuery(url,{},budget,0,streamCsv("System Record ID\n"),"budgetRelieving")).toEqual({rawRows:0,giftIds:[]});
  });
  it.each(["Wrong ID\n11","System Record ID\nabc","System Record ID,System Record ID\n11,12","System Record ID\n"])("rejects incomplete or ambiguous Budget Relieving results",async csv=>{
    await expect(readInvestmentQuery(url,{},budget,1,streamCsv(csv),"budgetRelieving")).rejects.toThrow();
  });
  it("does not change the fund/exception source identity when either classification is added",()=>{
    const source={queryId:"27460",columns:{giftId:"Gift System Record ID",amount:"Amount",fundId:"Fund System Record ID"}};
    expect(campaignSourceKey({...source,investment:config,budgetRelieving:budget})).toBe(campaignSourceKey(source));
  });
});
