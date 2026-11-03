import { describe, expect, it } from "vitest";
import {
  fulfillmentCommand,
  matchesFulfillmentAction,
} from "./stewardshipFulfillment";

export const command = {
  requestId: "12",
  viewerKey: "2",
  version: 1,
  token: "91512c41-89cd-41be-946e-10a056cae491",
  stage: "received",
  date: "2026-10-01",
  note: "Handed to donor",
  confirmed: true,
  stockQuantity: 0,
  itemId: "4",
  actionId: null,
  followUp: null,
};
describe("fulfillment validation", () => {
  it("normalizes a bounded command without accepting donor identity from the browser", () => {
    expect(
      fulfillmentCommand(
        { ...command, note: "  Handed to donor  " },
        "2026-11-03",
      ),
    ).toMatchObject({ note: "Handed to donor" });
  });
  it.each([
    { constituentId: "900" },
    { stage: "mailed" },
    { date: "2026-02-30" },
    { date: "2201-01-01" },
    { note: " " },
    { confirmed: false },
    { stockQuantity: 1.5 },
    { stockQuantity: -1 },
    { stockQuantity: 1, stage: "sent" },
    { actionId: "lookup" },
    { actionId: "5", stage: "prepared" },
    { token: "not-a-uuid" },
    { followUp: { title: "Call", date: "2026-01-01" } },
    { followUp: { title: "Call", date: "2026-11-03", ownerId: "9" } },
  ])("rejects invalid or unsafe fields %o", (change) => {
    expect(() =>
      fulfillmentCommand({ ...command, ...change }, "2026-11-03"),
    ).toThrow();
  });
  const action = {
    id: "501",
    constituent_id: "100",
    completed: true,
    completed_date: "2026-10-01T00:00:00Z",
  };
  const expected = {
    actionId: "501",
    constituentId: "100",
    date: "2026-10-01",
  };
  it("accepts only a matching completed action and actual date", () => {
    expect(matchesFulfillmentAction(action, expected)).toBe(true);
    for (const delta of [
      { id: "502" },
      { constituent_id: "101" },
      { completed: false },
      { completed_date: "2026-10-02" },
    ])
      expect(matchesFulfillmentAction({ ...action, ...delta }, expected)).toBe(
        false,
      );
  });
});
