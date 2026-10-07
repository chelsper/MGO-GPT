import { describe, expect, it } from "vitest";
import { campaignMappingIssues, suggestCampaignColumns } from "./campaignSourceMapping";

export const returnedFields = ["Gift ID", "Gift Amount", "Gift Date", "Gift Type", "Fund Description", "Fund ID", "Fund System Record ID", "Fund Type", "Fund Category", "Gift Pledge Balance"];
const complete = { mode: "split", columns: { giftId: "Gift System Record ID", splitId: "Gift Split System Record ID", fundId: "Fund System Record ID", fundName: "Fund Description", amount: "Split Gift Amount" } };
describe("campaign source mapping guidance", () => {
  it("suggests only clear matches in the ten returned fields, never lookup IDs or whole amounts", () => {
    expect(suggestCampaignColumns(returnedFields, "split").columns).toEqual({ fundId: "Fund System Record ID", fundName: "Fund Description", giftDate: "Gift Date", giftType: "Gift Type" });
    const source = { mode: "split", ...suggestCampaignColumns(returnedFields, "split") };
    expect(campaignMappingIssues(source, returnedFields, true).map(issue => issue.key)).toEqual(["giftId", "splitId", "amount"]);
  });
  it("preserves choices and refuses ambiguous suggestions or reusing a column", () => {
    expect(suggestCampaignColumns(["Fund Name", "Fund Description"], "split").columns).toEqual({});
    expect(suggestCampaignColumns(returnedFields, "split", { fundName: "Custom Label" }).columns.fundName).toBe("Custom Label");
    expect(suggestCampaignColumns(returnedFields, "split", { donorName: "Fund Description" }).columns.fundName).toBeUndefined();
  });
  it("accepts explicit split mappings and normalizes harmless capitalization and underscores", () => {
    expect(campaignMappingIssues(complete, Object.values(complete.columns), true)).toEqual([]);
    expect(suggestCampaignColumns(["FUND_SYSTEM_RECORD_ID"], "split").columns.fundId).toBe("FUND_SYSTEM_RECORD_ID");
  });
  it.each([["giftId", "Gift ID"], ["fundId", "Fund ID"], ["splitId", "Fund System Record ID"], ["amount", "Gift Amount"], ["amount", "Gift Pledge Balance"]])("blocks known incompatible %s labels", (key, field) => {
    const source = { ...complete, columns: { ...complete.columns, [key]: field } };
    expect(campaignMappingIssues(source, Object.values(source.columns), true).some(issue => issue.key === key)).toBe(true);
  });
  it("permits whole-gift amounts only in explicit gift mode", () => {
    const source = { mode: "gift", columns: { ...complete.columns, splitId: "", amount: "Gift Amount" } };
    expect(campaignMappingIssues(source, Object.values(source.columns), true)).toEqual([]);
    expect(suggestCampaignColumns(returnedFields, "gift").columns.amount).toBe("Gift Amount");
  });
  it("flags removed optional mappings and duplicates without deleting them", () => {
    const source = { ...complete, columns: { ...complete.columns, donorName: "Missing Name", giftType: "Fund Description" } };
    const issues = campaignMappingIssues(source, Object.values(complete.columns), true);
    expect(issues.some(issue => issue.key === "donorName" && issue.message.includes("no longer"))).toBe(true);
    expect(issues.some(issue => issue.key === "giftType" && issue.message.includes("more than once"))).toBe(true);
    expect(source.columns.donorName).toBe("Missing Name");
  });
});
