import { describe, expect, it, vi } from "vitest";
import sql from "./sql";
import requeueFixedPortfolioFailures from "./requeueFixedPortfolioFailures";

vi.mock("./sql", () => ({ default: vi.fn() }));

describe("recovery of the repaired portfolio proposal query", () => {
  it("limits recovery to one job and the exact legacy failure without clearing error evidence", async () => {
    sql.mockResolvedValueOnce([{ id: 123 }]);
    expect(await requeueFixedPortfolioFailures("36")).toEqual([{ id: 123 }]);
    const [strings, jobId] = sql.mock.calls.at(-1);
    const query = strings.join("?");
    expect(jobId).toBe("36");
    expect(query).toContain("WHERE job_id = ? AND status = 'failed'");
    expect(query).toContain("stage = 'blackbaud_retrieval' AND http_status = 200");
    expect(query).toContain("error_message = 'column po.opportunity_title does not exist'");
    expect(query).toContain("stage = 'fixed_proposal_query_retry'");
    expect(query.split("WHERE")[0]).not.toMatch(/error_message\s*=|retry_count\s*=|http_status\s*=/);
  });
});
