// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("./sql",()=>({default:vi.fn(()=>{throw new Error("Live SQL forbidden");})}));
import { campaignCsvAllocations } from "./campaignWriteOffImport";
const rows=[{item_key:"10:1",gift_id:"10",split_id:"1",fund_id:"4",gift_type:"Pledge",amount_cents:6000,pledge_balance_cents:1800},
  {item_key:"10:2",gift_id:"10",split_id:"2",fund_id:"5",gift_type:"Pledge",amount_cents:4000,pledge_balance_cents:1200}];
const entry={giftId:"10",type:"pledge",grossCents:10000,writeOffCents:2501};
it("distributes whole-gift write-offs with exact cent reconciliation",()=>{
  const result=campaignCsvAllocations(entry,rows,"gift");
  expect(result.map(row=>row.writeOffCents)).toEqual([1501,1000]);
  expect(result.reduce((sum,row)=>sum+row.pledgeBalanceCents,0)).toBe(3000);
  expect(result.every(row=>row.baseHash && row.rowHash)).toBe(true);
});
it("does not redistribute explicitly supplied split balances",()=>{
  const result=campaignCsvAllocations(entry,[{...rows[0],pledge_balance_cents:2500},{...rows[1],pledge_balance_cents:500}],"split");
  expect(result.map(row=>row.pledgeBalanceCents)).toEqual([2500,500]);
});
it("blocks partial allocations, missing balances and overallocated balances",()=>{
  expect(()=>campaignCsvAllocations(entry,[rows[0]],"gift")).toThrow(/does not match/);
  expect(()=>campaignCsvAllocations(entry,[{...rows[0],pledge_balance_cents:null},rows[1]],"gift")).toThrow(/missing/);
  expect(()=>campaignCsvAllocations(entry,[{...rows[0],pledge_balance_cents:7000},rows[1]],"gift")).toThrow(/exceeds/);
});
