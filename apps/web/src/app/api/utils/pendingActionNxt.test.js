import { expect, it, vi } from "vitest";
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
import { verifiedNextStepAction, publicActionReceipt } from "./pendingActionNxt";

const expected = { actionId: "247955", constituentId: "161554",
  createPayload: { summary: "Call donor", description: "Notes: Call donor\n\nDiscuss event", category: "Phone Call", date: "2026-09-16T00:00:00.000Z" },
  metadata: { type: "Cultivation", fundraisers: ["186057"], opportunity_id: "88" } };
const record = { id: "247955", constituent_id: "161554", summary: "Call donor", description: "Notes: Call donor\r\n\r\nDiscuss event",
  category: "Phone call", date: "2026-09-16T00:00:00", type: "Cultivation", fundraisers: ["186057"], opportunity_id: "88", completed: true };

it("accepts NXT category capitalization and CRLF notes without changing their content", () => {
  expect(verifiedNextStepAction(record, expected)).toBe(true);
  expect(verifiedNextStepAction({ value: { ...record, fundraisers: [{ id: "186057" }] } }, expected)).toBe(true);
});
it.each([
  { id: "other" }, { constituent_id: "other" }, { completed: false }, { summary: "call donor" },
  { description: "Notes: Call donor\nDiscuss event" }, { description: "Notes: Call  donor\n\nDiscuss event" },
  { description: "Notes: Call donor\n\nDifferent event" }, { description: undefined }, { category: "Email" },
  { category: " Phone call " }, { type: "Solicitation" }, { date: "2026-09-17T00:00:00" },
  { fundraisers: [] }, { fundraisers: ["other"] }, { opportunity_id: "other" },
])("still rejects meaningful changes: %j", change => {
  expect(verifiedNextStepAction({ ...record, ...change }, expected)).toBe(false);
});
it.each([{}, { createPayload: {} }, { metadata: {} }, { metadata: { type: "Cultivation", fundraisers: [] } },
  { metadata: { type: "Cultivation", fundraisers: [""] } }])("fails closed on incomplete stored expectations: %j", change => {
  expect(verifiedNextStepAction(record, Object.keys(change).length ? { ...expected, ...change } : {})).toBe(false);
});
it("reports the current reminder separately and never exposes the stored action payload", () => {
  const receipt = publicActionReceipt({ state: "review", blackbaud_action_id: "247955", constituent_id: "161554",
    reminder_completed: false, message: "The next step was not completed.", request_payload: expected }, "Done");
  expect(receipt).toMatchObject({ reminderStatus: "Done", reminderCompleted: false });
  expect(receipt.message).not.toContain("was not completed");
  expect(receipt).not.toHaveProperty("request_payload");
});
