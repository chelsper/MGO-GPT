import { describe, it, expect } from "vitest";
import {
  outreachCounts,
  outreachPeople,
  outreachPledgeContext,
  outreachPledgeColumns,
  validateOutreachOutcome,
  validateOutreachSettings,
} from "./projectOutreach";
import {
  report,
  snapshot,
  settings,
  result,
  saved,
} from "../../test/fixtures/projectOutreach";
describe("project outreach rules", () => {
  it("deduplicates only explicit system IDs and retains all contact warnings", () => {
    expect(
      outreachPeople(snapshot, report.dataConfiguration, settings),
    ).toEqual([
      {
        constituentId: "123",
        name: "Fictional Avery",
        phones: ["555-0100", "555-0101"],
        restrictions: ["Do not call"],
      },
      {
        constituentId: "456",
        name: "Fictional Blake",
        phones: [],
        restrictions: [],
      },
    ]);
    expect(
      outreachPeople(snapshot, { systemIdColumn: "Lookup ID" }, settings),
    ).toEqual([]);
  });
  it("requires explicit, unambiguous contact mapping and valid settings", () => {
    expect(validateOutreachSettings(settings, snapshot.headers)).toBeNull();
    expect(
      validateOutreachSettings(settings, [...snapshot.headers, "Name"]),
    ).toMatch(/name/);
    for (const patch of [
      { deadline: "2026-02-30" },
      { interactionType: "Invented" },
      { phoneColumn: "Missing" },
      { instructions: "x".repeat(2001) },
      { unknown: true },
    ])
      expect(
        validateOutreachSettings({ ...settings, ...patch }, snapshot.headers),
      ).toBeTruthy();
  });
  it("validates outcomes, actual dates, follow-up dates and contact acknowledgment", () => {
    expect(validateOutreachOutcome(result, "2026-11-20")).toBeNull();
    for (const patch of [
      { eventId: "bad" },
      { version: -1 },
      { notes: " " },
      { notes: "x".repeat(4001) },
      { actionDate: "2026-11-21" },
      { stage: "follow_up", nextDate: "" },
      { nextDate: "2026-12-01" },
      { contactReviewed: false },
      { outcome: "__proto__" },
      { unexpected: true },
    ])
      expect(
        validateOutreachOutcome({ ...result, ...patch }, "2026-11-20"),
      ).toBeTruthy();
    expect(
      validateOutreachOutcome(
        { ...result, stage: "follow_up", nextDate: "2026-11-21" },
        "2026-11-20",
      ),
    ).toBeNull();
  });
  it("keeps local completion separate from NXT and does not imply a follow-up was reached", () => {
    const tasks = [
      {
        ...saved.tasks[0],
        stage: "complete",
        events: [{ result: { outcome: "follow_up" }, state: "review" }],
      },
    ];
    expect(outreachCounts(tasks)).toEqual({
      assigned: 1,
      attempted: 1,
      reached: 0,
      followUp: 0,
      complete: 1,
      pendingNxt: 1,
    });
  });
});

describe("optional saved pledge reminders", () => {
  const slot = "Gifts 1 1 Installments 1 1";
  const headers = ["System ID", `${slot} Installment Balance`, `${slot} Installment Date Due`];
  const enabled = { ...settings, showPledgeContext: true };
  const context = (rows, options = enabled) => outreachPledgeContext(
    { headers, tableRows: rows }, report.dataConfiguration, options, "2026-11-22",
  );
  it("is optional and preserves existing settings", () => {
    expect(context([["123", "100", "11/1/2026"]], settings).size).toBe(0);
    expect(validateOutreachSettings(settings, snapshot.headers)).toBeNull();
    expect(validateOutreachSettings({ ...settings, showPledgeContext: "yes" }, snapshot.headers)).toMatch(/reminders/);
    expect(validateOutreachSettings(enabled, snapshot.headers)).toMatch(/matching/);
    expect(validateOutreachSettings(enabled, [...snapshot.headers, ...headers.slice(1)])).toBeNull();
  });
  it("shows overdue, today and upcoming unpaid balances, not original installment amounts", () => {
    const result = context([
      ["123", "$1,250.50", "11/1/2026"],
      ["456", "25", "2026-12-31"],
      ["789", "10.5", "11/22/2026"],
    ]);
    expect(result.get("123").installments).toEqual([{ slot, cents: 125050, date: "2026-11-01", status: "Past due" }]);
    expect(result.get("456").installments[0]).toMatchObject({ status: "Upcoming", cents: 2500 });
    expect(result.get("789").installments[0]).toMatchObject({ status: "Due today", cents: 1050 });
  });
  it("hides paid, empty and later installments instead of displaying empty columns", () => {
    expect(context([
      ["123", "0.00", "11/1/2026"],
      ["456", "", ""],
      ["789", "100.00", "1/1/2027"],
    ]).size).toBe(0);
  });
  it("does not guess invalid or incomplete amounts and dates", () => {
    for (const [amount, date] of [["", "11/1/2026"], ["100", ""], ["1,2", "11/1/2026"], ["-100", "11/1/2026"], ["100", "2/30/2026"], ["1e3", "11/1/2026"]]) {
      expect(context([["123", amount, date]]).get("123")).toEqual({ installments: [], needsReview: true });
    }
  });
  it("does not pair separate rows or add repeated query values together", () => {
    expect(context([["123", "100", ""], ["123", "", "11/1/2026"]]).get("123"))
      .toEqual({ installments: [], needsReview: true });
    expect(context([["123", "100", "11/1/2026"], ["123", "$100.00", "2026-11-01"]]).get("123").installments).toHaveLength(1);
    expect(context([["123", "100", "11/1/2026"], ["123", "200", "11/1/2026"]]).get("123"))
      .toEqual({ installments: [], needsReview: true });
  });
  it("pairs only exact unique gift/installment slots and never pledge-level balance", () => {
    expect(outreachPledgeColumns([headers[1], "Gifts 1 2 Installments 1 1 Installment Date Due"])).toEqual([]);
    expect(outreachPledgeColumns([...headers, headers[2]])).toEqual([]);
    expect(outreachPledgeColumns(["Gifts 1 1 Pledge Balance", headers[2]])).toEqual([]);
    expect(context([["bad", "100", "11/1/2026"]]).size).toBe(0);
  });
});
