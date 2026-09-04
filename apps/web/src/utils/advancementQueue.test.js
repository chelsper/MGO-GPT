import { describe, expect, it } from "vitest";
import { buildQueueItems, buildQueueMutation, filterQueueItems, formatQueueDate, formatQueueValue, getQueueActions, getQueueGroup, isQueueOverdue } from "./advancementQueue";

const item = (source, record) => buildQueueItems({ [source]: [{ id: 1, ...record }] })[0];

describe("shared Advancement Services queue", () => {
  it("keeps new and in-progress work open without waiting for an aging threshold", () => {
    for (const status of ["Open", "In Progress"]) expect(getQueueGroup("data", { status })).toBe("active");
    for (const status of ["Pending", "Ready for CRM"]) expect(getQueueGroup("submissions", { status })).toBe("active");
    expect(getQueueGroup("lists", { status: "Needs Clarification" })).toBe("waiting");
    for (const status of ["Completed", "Complete", "Approved"]) expect(getQueueGroup("lists", { status })).toBe("history");
  });

  it("separates successful direct NXT activity from actionable failures, regardless of review status", () => {
    expect(getQueueGroup("submissions", { status: "Pending", blackbaud_sync_status: "synced" })).toBe("history");
    expect(getQueueGroup("submissions", { status: "Pending", blackbaud_sync_status: "success" })).toBe("history");
    expect(getQueueGroup("submissions", { status: "Approved", blackbaud_sync_status: "failed" })).toBe("active");
    expect(getQueueGroup("submissions", { status: "Approved", blackbaud_sync_status: "synced", blackbaud_sync_error: "Still failed" })).toBe("active");
    expect(getQueueActions(item("submissions", { blackbaud_sync_status: "failed" }))).toEqual([]);
  });

  it("counts import batches with ready, review, conflict, or failed rows as open", () => {
    for (const key of ["readyCount", "needsReviewCount", "conflictCount", "failedCount"]) expect(getQueueGroup("imports", { [key]: 1 })).toBe("active");
    expect(getQueueGroup("imports", { appliedCount: 301 })).toBe("history");
  });

  it("filters by category and searches across constituent, requester, and ID", () => {
    const records = buildQueueItems({ data: [{ id: 71, constituent_name: "Example Donor", requester_name: "Case Worker", request_type: "Research request", status: "Open" }], lists: [{ id: 72, status: "Complete" }] });
    expect(filterQueueItems(records, { category: "research", search: "case worker" })).toHaveLength(1);
    expect(filterQueueItems(records, { search: "71" })).toHaveLength(1);
    expect(filterQueueItems(records, { category: "data" })).toHaveLength(0);
    expect(filterQueueItems(records, { view: "history" })).toHaveLength(1);
  });

  it("sorts urgent work first, then oldest requests", () => {
    const records = buildQueueItems({ lists: [{ id: 1, queue_priority: 2, created_at: "2026-01-01" }, { id: 2, queue_priority: 1, created_at: "2026-08-01" }, { id: 3, queue_priority: 2, created_at: "2026-03-01" }] });
    expect(filterQueueItems(records).map((r) => r.record.id)).toEqual([2, 1, 3]);
    expect(filterQueueItems(records, { sort: "newest" }).map((r) => r.record.id)).toEqual([2, 3, 1]);
  });

  it("formats stored calendar dates without timezone shifts and rejects invalid dates", () => {
    expect(formatQueueDate("2026-03-31T00:00:00.000Z")).toBe("Mar 31, 2026");
    expect(formatQueueDate("2026-02-31")).toBe("Not set");
    expect(formatQueueDate("bad-date")).toBe("Not set");
    expect(formatQueueValue("nxt_only")).toBe("Deliver in NXT");
    expect(isQueueOverdue({ group: "active", due: "2026-09-03" }, new Date("2026-09-04T14:00Z"))).toBe(true);
    expect(isQueueOverdue({ group: "history", due: "2026-09-03" }, new Date("2026-09-04T14:00Z"))).toBe(false);
  });

  it("preserves an in-progress data status on note-only saves", () => {
    expect(buildQueueMutation(item("data", { status: "In Progress" }), { reviewerNotes: "Call tomorrow" })).toEqual({
      url: "/api/data-requests/1?view=reviewer", method: "PATCH", body: { status: "In Progress", reviewerNotes: "Call tomorrow" },
    });
  });

  it("requires a clarification question and never invents unsupported statuses", () => {
    const list = item("lists", { status: "Pending" });
    expect(() => buildQueueMutation(list, { status: "Needs Clarification", reviewerNotes: " " })).toThrow("clarification question");
    expect(() => buildQueueMutation(list, { status: "In Progress" })).toThrow("not available");
    expect(buildQueueMutation(list, { status: "Needs Clarification", reviewerNotes: "Which date?", queuePriority: 1 }).body).toEqual({ id: 1, status: "Needs Clarification", reviewerNotes: "Which date?", queuePriority: 1 });
    expect(() => buildQueueMutation(item("data", { status: "Open" }), { status: "Needs Clarification" })).toThrow("not available");
  });

  it("supports reopening and keeps import and NXT writes outside generic review controls", () => {
    expect(buildQueueMutation(item("data", { status: "Completed" }), { status: "Open" }).body.status).toBe("Open");
    expect(() => buildQueueMutation(item("imports", {}), {})).toThrow("import workspace");
    expect(() => buildQueueMutation(item("submissions", { blackbaud_sync_status: "synced" }), { status: "Pending" })).toThrow("not available");
    expect(buildQueueMutation(item("submissions", { blackbaud_sync_status: "failed" }), { reviewerNotes: "Investigating" }).body).toEqual({ id: 1, reviewerNotes: "Investigating" });
  });
});
