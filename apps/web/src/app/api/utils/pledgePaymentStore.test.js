import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("./sql", () => ({ default: mocks.sql }));
import { readPledgeCache } from "./pledgePaymentStore";

beforeEach(() => vi.clearAllMocks());
const saved = { pledge_id: "1", run_id: "old", status: "success", stage: "identity", payload: { id: "1", name: "Cached Donor" }, error: null };
describe("query-scoped pledge cache", () => {
  it("identifies legacy jobs without deleting or presenting their old values as current", async () => {
    mocks.sql.mockResolvedValueOnce([{ job: { id: "old", status: "completed", discoveryComplete: true } }]).mockResolvedValueOnce([saved]);
    const result = await readPledgeCache("scope");
    expect(result.requiresQueryRefresh).toBe(true);
    expect(result.source.queryId).toBe("12033");
    expect(result.records).toEqual([{ ...saved.payload, stale: true }]);
    expect(mocks.sql.mock.calls.every(([parts]) => !/UPDATE|DELETE|INSERT/.test(parts.join("")))).toBe(true);
  });
  it("retains prior cached values during query discovery and omits query credentials and raw output", async () => {
    mocks.sql.mockResolvedValueOnce([{ job: { id: "new", source: "saved_query", queryId: "12033", status: "discovering", discoveryComplete: false,
      queryJobId: "private-internal-job", sas_uri: "private-token", csv: "raw-csv", queryStage: "download" } }]).mockResolvedValueOnce([saved]);
    const result = await readPledgeCache("scope");
    expect(result.requiresQueryRefresh).toBe(false);
    expect(result.records[0].stale).toBe(true);
    expect(result.job.total).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/private-token|raw-csv|private-internal-job/);
    expect(mocks.sql.mock.calls[1].slice(1)).toEqual(["scope", true, "new"]);
  });
  it("restricts completed manifests to the new run and publishes row count separately from unique pledges", async () => {
    mocks.sql.mockResolvedValueOnce([{ job: { id: "new", source: "saved_query", queryId: "12033", status: "completed", discoveryComplete: true, queryRowCount: 6 } }])
      .mockResolvedValueOnce([{ ...saved, run_id: "new" }]);
    const result = await readPledgeCache("scope");
    expect(result.records[0].stale).toBe(false);
    expect(result.job).toMatchObject({ total: 1, success: 1, queryRowCount: 6 });
    expect(mocks.sql.mock.calls[1].slice(1)).toEqual(["scope", false, "new"]);
  });
});
