import { describe, expect, it } from "vitest";
import {
  materializeAcknowledgmentGiftGroups,
  mergeAcknowledgmentGiftGroup,
} from "./portfolioAcknowledgmentGroups";

describe("portfolio acknowledgment gift groups", () => {
  it("groups one hard-credit donor with all soft-credit recipients", () => {
    const groups = new Map();
    const gift = {
      giftId: "gift-1",
      date: "2026-08-10T00:00:00Z",
      hardCreditDonor: { constituentId: "daf-1", name: "Example Charitable Fund" },
      hardCreditRecordSolicitor: "Not in selected MGO portfolio",
      receivedAmount: 20000,
      giftSolicitors: [{ id: "mgo-1", name: "Leslie M. Redd" }],
    };

    mergeAcknowledgmentGiftGroup(groups, {
      ...gift,
      softCreditRecipient: {
        constituentId: "soft-2",
        name: "Tim Cost",
        constituentRecordSolicitor: "Leslie M. Redd (Secondary Solicitor)",
        amount: 20000,
      },
    });
    mergeAcknowledgmentGiftGroup(groups, {
      ...gift,
      softCreditRecipient: {
        constituentId: "soft-1",
        name: "Stephanie D. Cost",
        constituentRecordSolicitor: "Leslie M. Redd (Lead Solicitor)",
        amount: 20000,
      },
    });

    expect(materializeAcknowledgmentGiftGroups(groups)).toEqual([
      expect.objectContaining({
        giftId: "gift-1",
        receivedAmount: 20000,
        hardCreditDonor: { constituentId: "daf-1", name: "Example Charitable Fund" },
        giftSolicitors: [{ id: "mgo-1", name: "Leslie M. Redd" }],
        softCreditRecipients: [
          expect.objectContaining({ constituentId: "soft-1", name: "Stephanie D. Cost" }),
          expect.objectContaining({ constituentId: "soft-2", name: "Tim Cost" }),
        ],
      }),
    ]);
  });

  it("deduplicates repeated gift and recipient data across portfolio batches", () => {
    const groups = new Map();
    const details = {
      giftId: "gift-1",
      date: "2026-08-10T00:00:00Z",
      hardCreditDonor: { constituentId: "donor-1", name: "Alex Donor" },
      receivedAmount: 500,
      giftSolicitors: [{ id: "mgo-1", name: "Gift Officer" }],
      softCreditRecipient: {
        constituentId: "recipient-1",
        name: "Pat Recipient",
        amount: 500,
      },
    };

    mergeAcknowledgmentGiftGroup(groups, details);
    mergeAcknowledgmentGiftGroup(groups, details);

    const [group] = materializeAcknowledgmentGiftGroups(groups);
    expect(groups.size).toBe(1);
    expect(group.receivedAmount).toBe(500);
    expect(group.softCreditRecipients).toHaveLength(1);
    expect(group.softCreditRecipients[0].amount).toBe(500);
  });
});
