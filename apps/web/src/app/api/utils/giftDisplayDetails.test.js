import { describe, it, expect, vi } from "vitest";
import { getGiftDisplayDetails } from "./giftDisplayDetails";
import { calculateCurrentFiscalYearGiving } from "./currentFyGiving";
import { materializeAcknowledgmentGiftGroups, mergeAcknowledgmentGiftGroup } from "../../reports/portfolioAcknowledgmentGroups";
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn() }));
import { blackbaudApiFetch } from "./blackbaud";
import { addReportFundDescriptions } from "./reportFundDescriptions";

describe("report gift metadata", () => {
  it("keeps all split fund descriptions, never labels an ID as a description", () => {
    expect(getGiftDisplayDetails({ type: { description: "Pledge Payment" },
      gift_splits: [{ fund_id: "41", fund: { description: "Scholarships" } }, { fund_id: "42" }, { fund: { id: "43" } }] }))
      .toEqual({ giftType: "Pledge Payment", fundDescriptions: ["Scholarships"], fundIds: ["41", "42", "43"] });
  });
  it("carries metadata through direct credit, soft credit, and grouping without changing totals", () => {
    const gift = { id: "101", constituent_id: "100", type: "Donation", amount: { value: 20000 },
      date: "2026-08-01", fund: { description: "Scholarships" },
      soft_credits: [{ constituent_id: "200", amount: { value: 20000 } }, { constituent_id: "300", amount: { value: 20000 } }] };
    const result = calculateCurrentFiscalYearGiving({ gifts: [gift], constituentIds: ["100", "200", "300"], now: new Date("2026-09-04") });
    expect(result.byConstituentId["100"].hardReceived).toBe(20000);
    const direct = result.byConstituentId["100"].directGifts[0];
    expect(direct).toMatchObject({ giftType: "Donation", fundDescriptions: ["Scholarships"] });
    expect(result.acknowledgmentCredits).toHaveLength(2);
    const groups = new Map();
    mergeAcknowledgmentGiftGroup(groups, { ...direct, giftId: direct.id, hardCreditDonor: { constituentId: "100", name: "Fund" } });
    for (const credit of result.acknowledgmentCredits) {
      expect(credit.fundDescriptions).toEqual(["Scholarships"]);
      mergeAcknowledgmentGiftGroup(groups, { ...credit, receivedAmount: credit.hardCreditAmount,
        softCreditRecipient: { constituentId: credit.recipientConstituentId, name: "Recipient", amount: credit.amount } });
    }
    const [group] = materializeAcknowledgmentGiftGroups(groups);
    expect(group.receivedAmount).toBe(20000);
    expect(group.fundDescriptions).toEqual(["Scholarships"]);
    expect(group.softCreditRecipients).toHaveLength(2);
  });
  it("resolves unique fund IDs once and preserves amounts when optional metadata fails", async () => {
    blackbaudApiFetch.mockImplementation(async (path) => {
      if (path.endsWith("42")) throw new Error("Unavailable");
      return { description: "Science" };
    });
    const rows = [{ fundIds: ["41", "42"], receivedAmount: 123 }, { fundIds: ["41"], amount: 50 }];
    expect(await addReportFundDescriptions({ acknowledgmentCredits: rows }, { userId: 1, authUserId: 1 })).toBe(true);
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(2);
    expect(rows[0]).toMatchObject({ receivedAmount: 123, fundDescriptions: ["Science"] });
    expect(rows[1]).toMatchObject({ amount: 50, fundDescriptions: ["Science"] });
  });
});
