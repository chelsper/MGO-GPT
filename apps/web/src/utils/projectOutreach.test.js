import { describe, it, expect } from "vitest";
import {
  outreachCounts,
  outreachPeople,
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
