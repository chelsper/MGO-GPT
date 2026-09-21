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

const planned = { ...expected, actionIntent: "planned", createPayload: { ...expected.createPayload, completed: false }, metadata: { ...expected.metadata, completed: false } };
it("verifies the submitted planned intent, not merely an otherwise matching completed action", () => {
  expect(verifiedNextStepAction({ ...record, completed: false }, planned)).toBe(true);
  expect(verifiedNextStepAction(record, planned)).toBe(false);
  expect(verifiedNextStepAction({ ...record, completed: false }, expected)).toBe(false);
});
it.each([{ completed: undefined }, { completed: "false" }, { completed_date: "2026-09-16" }, { computed_status: "Completed" }])("rejects inconsistent planned completion state %j", change => {
  expect(verifiedNextStepAction({ ...record, completed: false, ...change }, planned)).toBe(false);
});
it("keeps legacy receipts completed and exposes only safe intent/date fields for planned receipts", () => {
  expect(publicActionReceipt({ state: "saved" }).actionIntent).toBe("completed");
  const receipt = publicActionReceipt({ state: "saved", request_payload: { ...planned, actionDate: "2026-09-18" } });
  expect(receipt).toMatchObject({ actionIntent: "planned", actionDate: "2026-09-18" });
  expect(receipt).not.toHaveProperty("createPayload");
});
it("distinguishes NXT saved from confirmed local finalization without exposing notes", () => {
  const row = { state: "saved", blackbaud_action_id: "500", request_payload: { notes: "private" } };
  expect(publicActionReceipt(row)).toMatchObject({ state: "saved", needsLocalRecovery: true, message: expect.stringContaining("local save") });
  expect(publicActionReceipt({ ...row, local_finalized_at: "2026-09-21T12:00:00Z" }).needsLocalRecovery).toBe(false);
  expect(JSON.stringify(publicActionReceipt(row))).not.toContain("private");
});
it("offers verification for an old processing receipt only when a remote ID was saved", () => {
  const row = { state: "processing", updated_at: "2026-01-01T00:00:00Z", blackbaud_action_id: "500" };
  expect(publicActionReceipt(row).canVerify).toBe(true);
  expect(publicActionReceipt({ ...row, blackbaud_action_id: null }).canVerify).toBe(false);
  expect(publicActionReceipt({ ...row, updated_at: new Date().toISOString() }).canVerify).toBe(false);
});
