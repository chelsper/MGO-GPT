import { expect, it } from "vitest";
import {
  completeLetterAppealMembers,
  relationshipOnlyReceipt,
} from "./societyLetterAppealMembers";
import { isLetterReadyToMail } from "./societyLetterHistory";
import { letterBatchSummary } from "./societyLetterBatchSummary";

const relationship = {
  id: "11",
  status: "not_applicable",
  reason: "relationship_only",
  checkedAt: "2026-10-07T12:00:00Z",
};
const full = { id: "10", status: "verified" };
it("keeps a joint letter ready without falsely counting a spouse-only appeal as assigned", () => {
  const item = {
    status: "prepared",
    channel: "post",
    members: ["10", "11"],
    letterAppeals: {
      status: "complete",
      appeal: { id: "100" },
      members: [full, relationship],
    },
  };
  expect(isLetterReadyToMail(item)).toBe(true);
  const summary = letterBatchSummary([item]);
  expect(summary.counts).toMatchObject({
    joint: 1,
    prepared: 1,
    attention: 0,
    constituents: 2,
  });
  expect(summary.appeals[0]).toMatchObject({ total: 1, confirmed: 1 });
});
it.each([
  { ...relationship, reason: "other" },
  { ...relationship, checkedAt: null },
  { ...relationship, attemptedAt: "2026-10-07T12:00:00Z" },
  { ...relationship, assignmentId: "123" },
  { ...relationship, status: "pending" },
  { ...relationship, status: "uncertain" },
])(
  "does not mistake an incomplete or previously submitted receipt for a safe non-applicable member %j",
  (member) => {
    expect(relationshipOnlyReceipt(member)).toBe(false);
    expect(completeLetterAppealMembers([full, member])).toBe(false);
  },
);
it("never completes an empty or relationship-only household", () => {
  expect(completeLetterAppealMembers([])).toBe(false);
  expect(completeLetterAppealMembers([relationship])).toBe(false);
});
