import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sql from "@/app/api/utils/sql";
import { POST } from "./route";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { email: "test@example.com" } })) }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: vi.fn(async () => ({ workspaceUser: { id: 7 }, sessionUser: { id: 7, role: "admin" }, isActing: false })) }));
vi.mock("@/app/api/utils/reportRefresh", () => ({ isAuthorizedReportRefreshRequest: () => false, getReportRefreshUser: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const mapped = { lifetimeGiving: { totalGiving: 100 }, proposalSummary: [] };
let job, snapshot, giving;
const request = () => new Request("https://jumgogpt.app/api/blackbaud/portfolio-refresh", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "process", jobId: "1" }),
});

beforeEach(() => {
  job = { id: 1, workspace_user_id: 7, mode: "nightly", status: "queued", batch_size: 10, concurrency: 2 };
  snapshot = { summary_payload: { mapped: { ...mapped, constituent: { id: "123", name: "Test" }, prospectSummaryNarrative: "Good snapshot" } }, data_complete: true, stale_after: new Date(Date.now() + 6 * 86400000).toISOString() };
  giving = null;
  sql.mockReset().mockImplementation(async (strings) => {
    const query = strings.join(" ");
    if (query.includes("SELECT * FROM portfolio_refresh_jobs")) return [job];
    if (query.includes("SELECT summary_payload")) return [snapshot];
    if (query.includes("FROM portfolio_giving_snapshots")) return giving ? [giving] : [];
    if (query.includes("WITH next_items")) return [{ id: 24, constituent_id: "123", position: 23 }];
    if (query.includes("WITH counts")) return [{ ...job, status: "completed" }];
    return [];
  });
  vi.stubGlobal("fetch", vi.fn(async (url) => String(url).includes("giving_only=1")
    ? Response.json({ constituentId: "123", mapped, currentFyGiving: { recognizedReceived: 100 } })
    : Response.json(snapshot.summary_payload)));
});
afterEach(() => vi.unstubAllGlobals());

describe("nightly portfolio batches", () => {
  it("updates giving without rebuilding a current unchanged summary", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain("giving_only=1");
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("summary_payload ="))).toBe(false);
  });

  it("rebuilds an expired summary after persisting nightly giving", async () => {
    snapshot.stale_after = "2026-01-01";
    await POST(request());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][0])).not.toContain("giving_only");
    expect(String(fetch.mock.calls[1][0])).toContain("reuse_giving=1");
  });

  it("refreshes a summary sooner when giving changed", async () => {
    snapshot.summary_payload.mapped.lifetimeGiving = { totalGiving: 90 };
    await POST(request());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("resumes after giving was saved without repeating giving retrieval", async () => {
    giving = { constituent_id: "123", payload: { mapped, currentFyGiving: {} }, stale_after: new Date(Date.now() + 86400000).toISOString() };
    snapshot.stale_after = "2026-01-01";
    await POST(request());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).not.toContain("giving_only");
  });

  it.each([429, 503])("pauses on HTTP %i without changing the last good summary", async (status) => {
    fetch.mockResolvedValue(Response.json({ error: "Throttled", quotaPaused: status === 503, retryAfterMs: 60000 }, { status }));
    await POST(request());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("SET status = 'paused'"))).toBe(true);
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("UPDATE portfolio_constituent_snapshots"))).toBe(false);
  });

  it("does not invalidate a current summary when only giving retrieval fails", async () => {
    fetch.mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 500 }));
    await POST(request());
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("UPDATE portfolio_constituent_snapshots"))).toBe(false);
    expect(sql.mock.calls.some((call) => call.includes("failed"))).toBe(true);
  });

  it("honors a persisted cooldown even when Process is clicked", async () => {
    job.status = "paused";
    job.paused_until = new Date(Date.now() + 60000).toISOString();
    const result = await (await POST(request())).json();
    expect(result.paused).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the prior narrative and marks partial enrichment for retry", async () => {
    snapshot.stale_after = "2026-01-01";
    snapshot.last_refreshed_at = "2026-08-01T06:00:00Z";
    fetch.mockImplementation(async (url) => String(url).includes("giving_only=1")
      ? Response.json({ mapped, currentFyGiving: { recognizedReceived: 100 } })
      : Response.json({ mapped: { ...snapshot.summary_payload.mapped, prospectSummaryNarrative: "Incomplete replacement" }, warnings: { education: "Unavailable" } }));
    await POST(request());
    const write = sql.mock.calls.find(([s]) => s.join(" ").includes("summary_payload ="));
    const safeSummary = JSON.parse(write[1]);
    expect(safeSummary.mapped.prospectSummaryNarrative).toBe("Good snapshot");
    expect(safeSummary.summaryRefreshedAt).toBe("2026-08-01T06:00:00Z");
    expect(sql.mock.calls.some((call) => call.includes("IncompleteEnrichment"))).toBe(true);
  });
});
