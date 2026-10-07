// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Live SQL forbidden"); }) }));
import { verifiedCampaignSplits } from "./campaignPrioritySplits";

const rows = () => ["4", "5"].map(fund => ({ item_key: `10:fund:${fund}`, gift_id: "10", split_id: null,
  fund_id: fund, fund_name: `Fund ${fund}`, amount_cents: "10000", gift_date: "2026-10-07", gift_type: "One-Time Gift", donor_name: "", conflict: false }));
const gift = () => ({ id: "10", amount: { value: 100 }, gift_splits: [
  { id: "71", fund_id: "4", amount: { value: 50 } }, { id: "72", fund_id: "5", amount: { value: 50 } },
] });
describe("verified campaign allocation expansion", () => {
  it("uses real split IDs and amounts while retaining the original gift ID", () => {
    const result = verifiedCampaignSplits(rows(), gift());
    expect(result).toMatchObject([
      { itemKey: "10:71", giftId: "10", splitId: "71", fundId: "4", amountCents: 5000 },
      { itemKey: "10:72", giftId: "10", splitId: "72", fundId: "5", amountCents: 5000 },
    ]);
    expect(result.every(row => /^[a-f0-9]{64}$/.test(row.baseHash) && /^[a-f0-9]{64}$/.test(row.rowHash))).toBe(true);
  });
  it("preserves exact cents and never assumes equal allocations", () => {
    const source = rows().map(row => ({ ...row, amount_cents: "5300" }));
    const detail = gift(); detail.amount.value = 53;
    detail.gift_splits.forEach(split => { split.amount.value = 26.5; });
    expect(verifiedCampaignSplits(source, detail).map(row => row.amountCents)).toEqual([2650,2650]);
    detail.gift_splits[0].amount.value = 40; detail.gift_splits[1].amount.value = 13;
    expect(verifiedCampaignSplits(source, detail).map(row => row.amountCents)).toEqual([4000,1300]);
  });
  it.each([
    ["wrong gift", detail => { detail.id = "99"; }],
    ["missing split ID", detail => { delete detail.gift_splits[0].id; }],
    ["duplicate split ID", detail => { detail.gift_splits[1].id = "71"; }],
    ["missing fund", detail => { delete detail.gift_splits[0].fund_id; }],
    ["fund outside query", detail => { detail.gift_splits[0].fund_id = "99"; }],
    ["repeated fund", detail => { detail.gift_splits[0].fund_id = "5"; }],
    ["incomplete response", detail => { detail.gift_splits.pop(); }],
    ["extra allocation", detail => { detail.gift_splits.push({ id: "73",fund_id: "6",amount: { value: 0 } }); }],
    ["mismatched sum", detail => { detail.gift_splits[0].amount.value = 49; }],
    ["negative allocation", detail => { detail.gift_splits[0].amount.value = -50; detail.gift_splits[1].amount.value = 150; }],
    ["changed gift total", detail => { detail.amount.value = 99; }],
    ["missing amount", detail => { delete detail.gift_splits[0].amount; }],
    ["fractional cent", detail => { detail.gift_splits[0].amount.value = 49.999; }],
  ])("rejects %s rather than inferring an allocation", (_name, change) => {
    const detail = gift(); change(detail);
    expect(() => verifiedCampaignSplits(rows(), detail)).toThrow();
  });
  it.each([
    ["conflicting duplicate", row => { row.conflict = true; }],
    ["different whole amount", row => { row.amount_cents = "9999"; }],
    ["different date", row => { row.gift_date = "2025-10-07"; }],
    ["different type", row => { row.gift_type = "Pledge"; }],
    ["different donor", row => { row.donor_name = "Another donor"; }],
    ["different gift", row => { row.gift_id = "11"; }],
  ])("rejects query rows with %s", (_name, change) => {
    const source = rows(); change(source[0]);
    expect(() => verifiedCampaignSplits(source, gift())).toThrow(/reconciled/);
  });
});
