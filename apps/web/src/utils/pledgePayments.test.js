import { describe, expect, it } from "vitest";
import { finishPledge, moneyCents, normalizeApplications, normalizeInstallments, normalizePaymentGift, normalizePledge, pledgeWorklist } from "./pledgePayments";

export const pledgeFixture = () => ({ gift: { id: "1", constituentId: "10", lookupId: "P1", totalCents: 100000, balanceCents: 65000 },
  name: "Test Donor", installments: [
    { id: "1", date: "2026-08-01", amountCents: 25000, balanceCents: 10000 },
    { id: "2", date: "2026-09-09", amountCents: 25000, balanceCents: 15000 },
    { id: "3", date: "2026-10-01", amountCents: 25000, balanceCents: 20000 },
    { id: "4", date: "2026-11-01", amountCents: 25000, balanceCents: 20000 }],
  applications: [{ installmentId: "1", giftId: "20", amountCents: 15000 }, { installmentId: "2", giftId: "20", amountCents: 5000 }],
  paymentGifts: { "20": { id: "20", date: "2026-08-01" } } });

describe("pledge payment amounts and dates", () => {
  it("includes arrears and due today, but only the next future date in Upcoming", () => {
    const saved = finishPledge(pledgeFixture());
    const list = pledgeWorklist([saved], "2026-09-09");
    expect(list.pastDue).toHaveLength(1);
    expect(list.upcoming).toHaveLength(1);
    expect(list.pastDue[0]).toMatchObject({ pastDueCount: 1, dueTodayCount: 1, currentlyDueCents: 25000, amountDueCents: 25000, dueDate: "2026-08-01" });
    expect(list.upcoming[0]).toMatchObject({ amountDueCents: 20000, dueDate: "2026-10-01" });
  });
  it("does not call write-off balance reductions payments or double-count a payment applied to two installments", () => {
    const list = pledgeWorklist([finishPledge(pledgeFixture())], "2026-09-09");
    expect(list.pastDue[0].paidToDateCents).toBe(20000);
    expect(list.pastDue[0].paidToDateCents).not.toBe(100000 - 65000);
  });
  it("keeps multiple pledges for a constituent separate and sorts by next due date", () => {
    const one = finishPledge(pledgeFixture());
    const two = { ...one, id: "2", installments: [{ id: "5", date: "2026-09-20", amountCents: 10000, balanceCents: 10000 }] };
    expect(pledgeWorklist([one, two], "2026-09-09").upcoming.map((r) => r.id)).toEqual(["2", "1"]);
  });
  it("does not hide arrears from older fiscal years and excludes settled installments", () => {
    const saved = finishPledge(pledgeFixture());
    saved.installments = [{ id: "5", date: "2020-01-01", balanceCents: 500 }, { id: "6", date: "2020-02-01", balanceCents: 0 }];
    expect(pledgeWorklist([saved], "2026-09-09").pastDue[0]).toMatchObject({ pastDueCount: 1, amountDueCents: 500 });
  });
  it("moves dates between tabs without retrieving NXT again and sums installments on the same future date", () => {
    const saved = finishPledge(pledgeFixture());
    saved.installments = saved.installments.map((r) => ({ ...r, date: "2026-09-10" }));
    expect(pledgeWorklist([saved], "2026-09-09").upcoming[0].amountDueCents).toBe(65000);
    expect(pledgeWorklist([saved], "2026-09-10").pastDue[0].dueTodayCount).toBe(4);
    expect(pledgeWorklist([saved], "2026-09-11").pastDue[0].pastDueCount).toBe(4);
  });
  it("does not include future-dated payments in paid to date", () => {
    const draft = pledgeFixture();
    draft.paymentGifts["20"].date = "2026-10-01";
    expect(pledgeWorklist([finishPledge(draft)], "2026-09-09").pastDue[0].paidToDateCents).toBe(0);
  });
  it.each([null, undefined, "", "100", NaN, Infinity, -1, Number.MAX_VALUE])("rejects invalid monetary data: %s", (value) => {
    expect(() => moneyCents(value)).toThrow();
  });
  it("validates installment balances, unique IDs, dates, and total balance", () => {
    const gift = normalizePledge({ id: "1", type: "Pledge", constituent_id: "10", amount: { value: 100 }, balance: { value: 50 } }, "1");
    const entry = { id: "1", date: "2026-09-09T00:00:00Z", amount: { value: 100 }, balance: 50 };
    expect(normalizeInstallments({ installments: [entry] }, gift)[0].date).toBe("2026-09-09");
    for (const entries of [[entry, entry], [{ ...entry, date: "2026-02-30" }], [{ ...entry, balance: undefined }], []]) {
      expect(() => normalizeInstallments({ installments: entries }, gift)).toThrow();
    }
  });
  it("rejects unexpected JSON/HTML and conflicting payment applications", () => {
    expect(() => normalizeInstallments("<html>Error</html>", {})).toThrow();
    expect(() => normalizeApplications({}, "1", [])).toThrow();
    const entry = { installment_id: "1", payment_gift_id: "2", amount_applied: { value: 10 } };
    expect(() => normalizeApplications({ pledge_payments: [entry, entry] }, "1", [{ id: "1" }])).toThrow();
    expect(() => normalizeApplications({ pledge_id: "99", pledge_payments: [] }, "1", [])).toThrow();
  });
  it("never guesses unknown/write-off gift types as paid or accepts incomplete identity", () => {
    for (const type of [undefined, "WriteOff", "Pledge", "PlannedGift"]) expect(() => normalizePaymentGift({ id: "20", date: "2026-09-09", type }, "20")).toThrow();
    expect(() => finishPledge({ ...pledgeFixture(), name: "" })).toThrow();
  });
});
