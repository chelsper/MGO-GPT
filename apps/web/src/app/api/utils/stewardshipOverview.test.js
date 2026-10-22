import { describe, expect, it, vi } from "vitest";
import {
  stewardshipOverview,
  readStewardshipOverview,
} from "./stewardshipOverview";
const now = new Date("2026-09-28T14:00:00Z");
const period = {
  key: "2026-01-01/2026-12-31",
  start: "2026-01-01",
  end: "2026-12-31",
};
const row = (id, extras = {}) => ({
  householdId: id,
  members: [id],
  period,
  societyKey: "ood",
  rank: 1,
  ...extras,
});
const saved = (extras = {}) => ({
  settings: { periodBasis: "calendar_year" },
  period,
  rows: [row("10")],
  history: [],
  exclusions: [],
  drafts: 0,
  ...extras,
});
describe("lightweight stewardship overview", () => {
  it("uses existing household and hierarchy rules without counting excluded, covered or reserved letters", () => {
    const result = stewardshipOverview(
      saved({
        rows: [
          row("10"),
          row("10"),
          row("20"),
          row("30"),
          row("40"),
          row("50"),
        ],
        exclusions: [{ ...row("20"), restoredAt: null }],
        history: [
          row("30", { status: "mailed", coveredKeys: ["ood"] }),
          row("40", {
            status: "prepared",
            channel: "post",
            coveredKeys: ["ood"],
            batchId: "batch",
          }),
          row("other", {
            members: ["50"],
            status: "mailed",
            rank: 0,
            coveredKeys: ["presidents", "ood"],
          }),
        ],
      }),
      now,
    );
    expect(result.holding).toBe(1);
    expect(result.readyToMail).toBe(1);
  });
  it("counts batches once, singles and couples once per letter, and requires every receipt", () => {
    const complete = {
      status: "complete",
      members: [{ status: "verified" }, { status: "verified" }],
    };
    const item = (id, status, receipt) =>
      row(id, {
        status,
        channel: "post",
        batchId: "same",
        letterAppeals: receipt,
      });
    const result = stewardshipOverview(
      saved({
        drafts: 1,
        history: [
          item("10", "prepared", complete),
          item("20", "prepared", {
            ...complete,
            members: [{ status: "uncertain" }],
          }),
          item("30", "prepared", {
            status: "pending",
            members: [{ status: "pending" }],
          }),
          item("40", "mailed", complete),
          item("50", "cancelled", complete),
          item("60", "prepared", { status: "complete", members: [] }),
        ],
      }),
      now,
    );
    expect(result).toMatchObject({
      inProgress: 2,
      hasDraft: true,
      readyToMail: 1,
    });
  });
  it.each([null, { key: "2025-01-01/2025-12-31" }])(
    "does not label missing or prior-period membership as zero",
    (oldPeriod) => {
      expect(
        stewardshipOverview(saved({ period: oldPeriod }), now).holding,
      ).toBeNull();
    },
  );
  it("keeps actionable batches from prior years and uses the organization's date", () => {
    const result = stewardshipOverview(
      saved({
        time_zone: "America/Los_Angeles",
        history: [
          row("20", {
            period: { key: "2025" },
            batchId: "old",
            status: "needs_review",
          }),
        ],
        request_open: "2",
        request_in_progress: "3",
        request_overdue: "1",
      }),
      new Date("2027-01-01T02:00:00Z"),
    );
    expect(result).toMatchObject({
      holding: 1,
      inProgress: 1,
      requests: { open: 2, inProgress: 3, overdue: 1 },
    });
  });
  it("makes one projected saved-data query without documents, notes, or writes", async () => {
    const db = vi.fn().mockResolvedValue([saved()]);
    const result = await readStewardshipOverview(db);
    expect(db).toHaveBeenCalledOnce();
    const query = db.mock.calls[0][0].join("?");
    expect(query).toContain("source_pending_action_id IS NOT NULL");
    expect(query).not.toMatch(
      /\b(INSERT|UPDATE|DELETE)\b|templates|postal_documents|reviewer_notes|request_note|recipient_reviews/i,
    );
    expect(Object.keys(result)).toEqual([
      "holding",
      "membershipSavedAt",
      "inProgress",
      "hasDraft",
      "readyToMail",
      "requests",
    ]);
  });
});
