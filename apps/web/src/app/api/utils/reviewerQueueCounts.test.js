import { beforeEach, describe, expect, it, vi } from "vitest";
import getReviewerQueueCounts from "./reviewerQueueCounts";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: sql }));

const zeroCounts = {
  submissions: "0", data_requests: "0", list_requests: "0",
  constituency_imports: "0", family_imports: "0", prospect_pool: "0", discussions: "0",
};

beforeEach(() => { sql.mockReset(); });

describe("reviewer queue counts", () => {
  it("returns full database totals rather than the six-item preview lengths", async () => {
    sql.mockResolvedValue([{ ...zeroCounts, submissions: "2", data_requests: "24", list_requests: "3", constituency_imports: "14", family_imports: "2", prospect_pool: "31", discussions: "20" }]);
    expect(await getReviewerQueueCounts()).toEqual({
      submissions: 2, dataRequests: 24, listRequests: 3, constituencyImports: 14,
      familyImports: 2, prospectPool: 31, discussions: 20, workQueue: 43,
    });
    const query = sql.mock.calls[0][0].join(" ");
    expect(query).not.toMatch(/\bLIMIT\b/i);
    expect(query).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
  });

  it("returns zero for genuinely empty queues", async () => {
    sql.mockResolvedValue([zeroCounts]);
    expect(Object.values(await getReviewerQueueCounts()).every((count) => count === 0)).toBe(true);
  });

  it.each([undefined, null, "", true, "invalid", -1])(
    "rejects invalid counts instead of claiming there is no work: %j",
    async (value) => {
      sql.mockResolvedValue([{ ...zeroCounts, data_requests: value }]);
      await expect(getReviewerQueueCounts()).rejects.toThrow();
    },
  );

  it("rejects a missing query result", async () => {
    sql.mockResolvedValue([]);
    await expect(getReviewerQueueCounts()).rejects.toThrow("not returned");
  });

  it("propagates DB failures so the page can label last-known counts as stale", async () => {
    sql.mockRejectedValue(new Error("DB unavailable"));
    await expect(getReviewerQueueCounts()).rejects.toThrow("DB unavailable");
  });
});
