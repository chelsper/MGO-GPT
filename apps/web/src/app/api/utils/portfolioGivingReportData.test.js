import { describe, expect, it } from "vitest";
import {
  buildPortfolioGivingReport,
  getPortfolioPeople,
  getReportProfileIds,
} from "./portfolioGivingReportData";

const workspaceUser = {
  id: 7,
  name: "Example Fundraiser",
  blackbaud_constituent_id: "700",
};
const solicitors = [{ id: "700", name: "Example Fundraiser" }];
const profile = (name) => ({
  name,
  constituencyCodesVerified: true,
  constituencies: [],
});
const gift = (id, receivedAmount, committedAmount = 0) => ({
  id,
  receivedAmount,
  committedAmount,
  date: "2026-09-01",
  giftType: "Donation",
  fundDescriptions: ["Scholarships"],
  giftSolicitors: solicitors,
});
function fixture() {
  const credit = {
    giftId: "daf-gift",
    hardCreditConstituentId: "2",
    recipientConstituentId: "3",
    amount: 200,
    hardCreditAmount: 200,
    date: "2026-09-02",
    giftType: "Donation",
    fundDescriptions: ["Scholarships"],
    giftSolicitors: solicitors,
  };
  return {
    workspaceUser,
    people: ["1", "2", "3"].map((constituentId) => ({
      constituentId,
      name: "Cached name",
      assignmentTypes: ["Lead Solicitor"],
    })),
    givingPayload: {
      period: { yearLabel: "FY27" },
      byConstituentId: {
        1: {
          directGifts: [
            gift("cash", 100),
            { ...gift("pledge", 0, 500), giftType: "Pledge" },
            {
              ...gift("other", 999),
              giftSolicitors: [{ id: "900", name: "Other Person" }],
            },
          ],
        },
        2: { directGifts: [gift("daf-gift", 200)] },
        3: { directGifts: [] },
      },
      acknowledgmentCredits: [
        credit,
        { ...credit },
        { ...credit, recipientConstituentId: "4" },
      ],
    },
    profilesById: {
      1: profile("A Donor"),
      2: { ...profile("Example DAF"), constituencies: ["Donor Advised Fund"] },
      3: profile("B Recipient"),
      4: profile("C Recipient"),
    },
    closedGiftSummary: {
      currentFY: "FY27",
      closedThisFY: 800,
      closedPriorFY: 50,
    },
  };
}

describe("complete portfolio report calculation", () => {
  it("preserves distinct hard-credit, commitment and acknowledgment definitions", () => {
    const result = buildPortfolioGivingReport(fixture());
    expect(result.hardCreditTotals).toEqual({ received: 300, committed: 500 });
    expect(result.closedGiftSummary.closedThisFY).toBe(800);
    expect(result.reportRows.map((row) => row.constituentId)).toEqual([
      "1",
      "3",
      "4",
    ]);
    expect(
      result.reportRows.find((row) => row.constituentId === "3")
        .recognizedReceived,
    ).toBe(200);
    const group = result.acknowledgmentGiftGroups.find(
      (row) => row.giftId === "daf-gift",
    );
    expect(group.hardCreditDonor.name).toBe("Example DAF");
    expect(group.softCreditRecipients).toHaveLength(2);
    expect(group.receivedAmount).toBe(200);
    expect(group.fundDescriptions).toEqual(["Scholarships"]);
    expect(group.giftType).toBe("Donation");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it("loads each required profile once, including recipients outside the portfolio", () => {
    const data = fixture();
    expect(getReportProfileIds(data.givingPayload, workspaceUser)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });
  it.each([
    null,
    { name: "Unverified", constituencyCodesVerified: false },
    { constituencyCodesVerified: true },
  ])(
    "rejects incomplete identity data rather than silently omitting a donor: %s",
    (missing) => {
      const data = fixture();
      data.profilesById[3] = missing;
      expect(() => buildPortfolioGivingReport(data)).toThrow(/verified/);
    },
  );
  it("excludes DAF recipients without removing the attributed hard-credit total", () => {
    const data = fixture();
    data.profilesById[3].constituencies = ["Donor Advised Funds"];
    const result = buildPortfolioGivingReport(data);
    expect(result.hardCreditTotals.received).toBe(300);
    expect(result.reportRows.map((row) => row.constituentId)).not.toContain(
      "3",
    );
  });
  it("preserves verified zeros but rejects unavailable commitment totals", () => {
    const data = {
      people: [],
      givingPayload: {
        byConstituentId: {},
        acknowledgmentCredits: [],
        period: {},
      },
      profilesById: {},
      workspaceUser,
      closedGiftSummary: { closedThisFY: 0 },
    };
    expect(buildPortfolioGivingReport(data).hardCreditTotals.received).toBe(0);
    expect(() =>
      buildPortfolioGivingReport({ ...data, closedGiftSummary: null }),
    ).toThrow(/totals/);
  });
  it("deduplicates members appearing in both assignment groups", () => {
    expect(
      getPortfolioPeople({
        leadSolicitor: [{ constituentId: "1" }],
        supportingSolicitor: [{ constituentId: "1" }, { constituentId: "2" }],
      }),
    ).toHaveLength(2);
  });
});
