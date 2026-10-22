import { describe, expect, it } from "vitest";
import { parseCampaignWriteOffCsv as parse, mergeCampaignWriteOffCsv as merge, campaignWriteOffSummary } from "./campaignWriteOffCsv";
import { campaignRow, validateCampaignSource } from "./campaignPriorities";
const header = "Gift Amount,Gift Type,Pledge Balance,Gf_System_ID,Write off\r\n";
const csv = header+'"$1,000.00",Pledge,$100.00,11,$250.00\r\n$75.50,MG Pledge,$0.00,12,$0.36\r\n';
const input = {asOf:"2026-10-14",complete:true,confirmed:true};
const upload = () => parse(csv);
const saved = () => merge(null,upload(),input,"2026-10-14");
describe("campaign write-off CSV",()=>{
  it("reads exact cents and matching pledges, without importing stale CSV balances",()=>{
    expect(upload()).toMatchObject({count:2,matching:1,writeOffCents:25036});
    expect(upload().entries[1]).toEqual({giftId:"12",type:"matching",grossCents:7550,writeOffCents:36});
    expect(parse('\uFEFF'+csv)).toEqual(upload());
  });
  it.each([
    header+'100,Pledge,0,11,10\n100,Pledge,0,11,10',
    header+'100,Pledge,0,0011,10',header+'100,Donation,0,11,10',
    header+'100,Pledge,0,11,',header+'100,Pledge,0,11,-1',header+'100,Pledge,60,11,50',
    header+'100,Pledge,,11,10',header+'100,Pledge,0,11,0.123',
    header+'100,Pledge,0,11,10,extra',header+'"100,Pledge,0,11,10',
    'Gift Amount,Gift Type,Pledge Balance,Gf_System_ID,Gf_System_ID\n100,Pledge,0,11,11',header,
  ])("rejects ambiguous or invalid inputs without guessing",text=>expect(()=>parse(text)).toThrow());
  it("bounds file bytes and row count",()=>{
    expect(()=>parse('x'.repeat(1024*1024+1))).toThrow(/1 MB/);
    expect(()=>parse(header+Array.from({length:2001},(_,i)=>`100,Pledge,0,${i+1},10`).join('\r\n'))).toThrow(/2,000/);
  });
  it("replaces totals idempotently and preserves unmentioned gifts",()=>{
    expect(merge(saved(),upload(),input,"2026-10-14")).toEqual(saved());
    const next=merge(saved(),parse(header+'1000,Pledge,100,11,300'),{...input,complete:false},"2026-10-14");
    expect(campaignWriteOffSummary(next)).toMatchObject({count:2,writeOffCents:30036,completeAsOf:"2026-10-14"});
    expect(next.entries[0].writeOffCents).toBe(30000);
    expect(campaignWriteOffSummary(next).entries).toBeUndefined();
  });
  it("requires the initial complete baseline and does not silently clear omitted entries",()=>{
    expect(()=>merge(null,upload(),{...input,complete:false},"2026-10-14")).toThrow(/first upload/);
    expect(()=>merge(saved(),parse(header+'1000,Pledge,100,11,300'),input,"2026-10-14")).toThrow(/missing previously saved/);
    const reversed=merge(saved(),parse(header+'75.50,MG Pledge,0,12,0'),{...input,complete:false},"2026-10-14");
    expect(reversed.entries[1].writeOffCents).toBe(0);
  });
  it("labels incremental updates without advancing the complete-list date",()=>{
    const next=merge(saved(),upload(),{...input,asOf:"2026-10-15",complete:false},"2026-10-15");
    expect(next).toMatchObject({completeAsOf:"2026-10-14",latestAsOf:"2026-10-15"});
    expect(()=>merge(next,upload(),input,"2026-10-15")).toThrow(/predates/);
  });
  it.each(["2026-02-30","2026-10-15","",null])("rejects invalid/future dates %s",asOf=>{
    expect(()=>merge(null,upload(),{...input,asOf},"2026-10-14")).toThrow(/valid date/);
  });
  it("requires confirmation",()=>expect(()=>merge(null,upload(),{...input,confirmed:false},"2026-10-14")).toThrow());
  it("keeps current query balances separate and requires explicit pledge balances",()=>{
    const source=validateCampaignSource({queryId:"1",queryName:"Campaign",mode:"gift",confirmed:true,financialSource:"csv",columns:{giftId:"ID",fundId:"Fund ID",fundName:"Fund",amount:"Amount",giftType:"Type",pledgeBalance:"Balance",writeOff:"Ignored"}});
    const fields=["ID","Fund ID","Fund","Amount","Type","Balance"];
    expect(source.columns.writeOff).toBe("");
    expect(campaignRow(["11","22","Fund","1000","MG Pledge","50"],fields,source)).toMatchObject({writeOffCents:null,pledgeBalanceCents:5000});
    expect(()=>campaignRow(["11","22","Fund","1000","Pledge",""],fields,source)).toThrow(/explicit zero/);
    expect(campaignRow(["11","22","Fund","1000","One-Time Gift",""],fields,source).pledgeBalanceCents).toBe(0);
  });
});
