import { describe, expect, it, vi } from "vitest";

import {
  normalizeInterruptedPortfolioItems,
  runPortfolioRefreshBatch,
  selectPortfolioRefreshItems,
} from "./portfolioRefreshPipeline";

function items(count) {
  return Array.from({ length: count }, (_, position) => ({
    constituentId: String(position + 1),
    position,
    status: "pending",
  }));
}

describe("resumable portfolio refresh pipeline", () => {
  it("claims only ten records from a 301-member portfolio", () => {
    const batch = selectPortfolioRefreshItems(items(301), { batchSize: 10 });
    expect(batch).toHaveLength(10);
    expect(batch.map((item) => item.constituentId)).toEqual(
      Array.from({ length: 10 }, (_, index) => String(index + 1)),
    );
  });

  it("isolates a failure on item 24 and continues through item 25", async () => {
    const batch = items(10).map((item, index) => ({
      ...item,
      constituentId: String(index + 21),
      position: index + 20,
    }));
    const processed = [];
    const result = await runPortfolioRefreshBatch({
      items: batch,
      concurrency: 2,
      processItem: async (item) => {
        processed.push(item.constituentId);
        return item.constituentId === "24"
          ? { status: "failed", stage: "blackbaud_retrieval" }
          : { status: "success" };
      },
    });

    expect(result.paused).toBe(false);
    expect(processed).toContain("24");
    expect(processed).toContain("25");
    expect(result.results[3]).toMatchObject({ status: "failed" });
    expect(result.results[4]).toMatchObject({ status: "success" });
  });

  it("resumes an interrupted pass at the first unfinished item", () => {
    const interrupted = items(30).map((item) => ({
      ...item,
      status:
        item.position < 23
          ? "success"
          : item.position === 23
            ? "processing"
            : "pending",
    }));
    const resumed = selectPortfolioRefreshItems(
      normalizeInterruptedPortfolioItems(interrupted),
      { batchSize: 10 },
    );
    expect(resumed[0].constituentId).toBe("24");
    expect(resumed[1].constituentId).toBe("25");
  });

  it.each([
    ["HTTP 429", { status: "paused", httpStatus: 429, retryAfterMs: 30_000 }],
    ["quota 403", { status: "paused", httpStatus: 403, retryAfterMs: 600_000 }],
  ])("pauses and releases unstarted work for %s", async (_label, pauseResult) => {
    const releaseItem = vi.fn();
    const result = await runPortfolioRefreshBatch({
      items: items(10),
      concurrency: 1,
      processItem: vi.fn(async (item) =>
        item.position === 2 ? pauseResult : { status: "success" },
      ),
      releaseItem,
    });
    expect(result.paused).toBe(true);
    expect(releaseItem).toHaveBeenCalledTimes(7);
    expect(result.results[2]).toMatchObject(pauseResult);
  });

  it("continues after one malformed constituent", async () => {
    const result = await runPortfolioRefreshBatch({
      items: items(4),
      concurrency: 1,
      processItem: async (item) =>
        item.position === 1
          ? { status: "failed", stage: "normalization" }
          : { status: "success" },
    });
    expect(result.results.map((entry) => entry.status)).toEqual([
      "success",
      "failed",
      "success",
      "success",
    ]);
  });

  it("records summary failure after normalized data was saved", async () => {
    const result = await runPortfolioRefreshBatch({
      items: items(1),
      processItem: async () => ({
        status: "failed",
        stage: "summary_generation",
        normalizedSaved: true,
      }),
    });
    expect(result.results[0]).toMatchObject({
      status: "failed",
      stage: "summary_generation",
      normalizedSaved: true,
    });
  });

  it("does not select successful records and can retry failed records only", () => {
    const candidates = items(5).map((item, index) => ({
      ...item,
      status: ["success", "failed", "pending", "success", "failed"][index],
    }));
    expect(
      selectPortfolioRefreshItems(candidates, { batchSize: 10 }).map(
        (item) => item.constituentId,
      ),
    ).toEqual(["3"]);
    expect(
      selectPortfolioRefreshItems(candidates, {
        batchSize: 10,
        failedOnly: true,
      }).map((item) => item.constituentId),
    ).toEqual(["2", "5"]);
  });
});
