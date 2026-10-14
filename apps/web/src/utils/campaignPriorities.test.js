import { describe, expect, it } from "vitest";
import { campaignCents, campaignRow, validateCampaignSource, validateCampaignOverride, campaignFinancialKind } from "./campaignPriorities";

const source = { queryId: "27460", queryName: "FM Campaign Gifts - Same as Dashboard", mode: "split", confirmed: true,
  columns: { giftId: "Gift ID", splitId: "Split ID", fundId: "Fund ID", fundName: "Fund", amount: "Amount" } };
describe("campaign accounting input", () => {
  it.each([["$1,234.56", 123456], ["0", 0], ["(25.30)", -2530], ["-0.01", -1], ["1.1", 110]])("parses exact cents %s", (input, cents) => expect(campaignCents(input)).toBe(cents));
  it.each(["", null, "1,00", "1e3", "1.001", "Infinity", "(-1)", "9007199254740993", "1abc"])("rejects ambiguous amount %s", input => expect(() => campaignCents(input)).toThrow());
  it("requires distinct system ID and split amount mappings", () => {
    expect(validateCampaignSource(source).columns.splitId).toBe("Split ID");
    expect(() => validateCampaignSource({ ...source, confirmed: false })).toThrow();
    expect(() => validateCampaignSource({ ...source, columns: { ...source.columns, splitId: "" } })).toThrow();
    expect(() => validateCampaignSource({ ...source, columns: { ...source.columns, amount: "Gift ID" } })).toThrow();
    expect(() => validateCampaignSource({ ...source, extra: true })).toThrow();
  });
  it("supports explicit single-fund mode, not a silent split fallback", () => {
    expect(() => validateCampaignSource({ ...source, mode: "gift" })).toThrow();
    expect(validateCampaignSource({ ...source, mode: "gift", columns: { ...source.columns, splitId: "" } }).mode).toBe("gift");
  });
  it("keys allocations by gift and split, not donor or fund name", () => {
    const headers = Object.values(source.columns);
    expect(campaignRow(["10", "3", "4", "Scholarships", "60"], headers, source)).toMatchObject({ itemKey: "10:3", amountCents: 6000 });
    expect(() => campaignRow(["10", "", "4", "Scholarships", "60"], headers, source)).toThrow(/No IDs are inferred/);
    expect(() => campaignRow(["10", "3", "FUND-CODE", "Scholarships", "60"], headers, source)).toThrow();
  });
  it("distinguishes inherit, zero, replacement and revert; requires a reason", () => {
    const input = { itemKey: "10:3", priority: null, amount: null, reason: "Reviewed" };
    expect(validateCampaignOverride(input)).toMatchObject({ amountCents: null, priority: null });
    expect(validateCampaignOverride({ ...input, amount: "0" }).amountCents).toBe(0);
    expect(validateCampaignOverride({ ...input, revert: true }).revert).toBe(true);
    expect(() => validateCampaignOverride({ ...input, amount: "" })).toThrow();
    expect(() => validateCampaignOverride({ ...input, reason: "" })).toThrow();
    expect(() => validateCampaignOverride({ ...input, priority: "invented" })).toThrow();
  });
  it("imports separate write-offs and pledge balances without modifying the original amount", () => {
    const config = { ...source, columns: { ...source.columns, writeOff: "Write-off Amount", pledgeBalance: "Pledge Balance" } };
    const headers = Object.values(config.columns);
    expect(campaignRow(["10", "3", "4", "Fund", "10000", "1000", "2500"], headers, config))
      .toMatchObject({ amountCents: 1000000, writeOffCents: 100000, pledgeBalanceCents: 250000 });
    expect(campaignRow(["10", "3", "4", "Fund", "10000", "", ""], headers, config))
      .toMatchObject({ writeOffCents: 0, pledgeBalanceCents: 0 });
    expect(campaignRow(["10", "3", "4", "Fund", "10000"], Object.values(source.columns), source))
      .toMatchObject({ writeOffCents: null, pledgeBalanceCents: null });
    for (const [writeOff, balance] of [["oops","0"],["-1","0"],["0","-1"],["0","1.001"],["10001","0"]])
      expect(() => campaignRow(["10", "3", "4", "Fund", "10000", writeOff, balance], headers, config)).toThrow();
  });
  it("requires gift type for direct checks and never trusts missing or stale financial query fields", () => {
    expect(() => validateCampaignSource({...source,financialSource:"nxt"})).toThrow(/Gift type/);
    expect(() => validateCampaignSource({...source,financialSource:"unknown"})).toThrow();
    const config=validateCampaignSource({...source,financialSource:"nxt",columns:{...source.columns,giftType:"Gift Type",writeOff:"Old writeoff",pledgeBalance:"Old balance"}});
    expect(config).toMatchObject({financialSource:"nxt",columns:{writeOff:"",pledgeBalance:""}});
    const headers=[...Object.values(source.columns),"Gift Type"];
    expect(campaignRow(["10","3","4","Fund","750000","Pledge"],headers,config))
      .toMatchObject({amountCents:75000000,writeOffCents:null,pledgeBalanceCents:null});
  });
  it.each(["Pledge","Matching Gift Pledge","MatchingGiftPledge"])("includes every %s regardless of balance", type=>{
    expect(campaignFinancialKind(type)).toBe("pledge");
  });
  it.each(["One-Time Gift","Stock/Property","Gift-in-Kind","Recurring Gift Payment","Planned Gift"])("recognizes the campaign gift type %s", type=>{
    expect(campaignFinancialKind(type)).toBe("other");
  });
  it.each(["","Unknown","Pledge Payment","Matching Gift Payment","PledgeWriteOff"])("does not silently count unsupported or duplicate commitment type %s", type=>{
    expect(()=>campaignFinancialKind(type)).toThrow(/cannot be reconciled/);
  });
});
