import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ensureAppSchemaMock, getReportRefreshUserMock, sqlMock } = vi.hoisted(() => ({
  ensureAppSchemaMock: vi.fn(),
  getReportRefreshUserMock: vi.fn(),
  sqlMock: vi.fn(),
}));

vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/reportRefresh", () => ({
  getReportRefreshUser: getReportRefreshUserMock,
}));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));

function request(search = "?force=1", secret = "test-secret") {
  return new Request(`https://jumgogpt.app/api/internal/portfolio-refresh${search}`, {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe("scheduled portfolio refresh worker", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    ensureAppSchemaMock.mockReset().mockResolvedValue();
    getReportRefreshUserMock.mockReset().mockResolvedValue({ id: 99, role: "admin" });
    sqlMock.mockReset().mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    vi.unstubAllGlobals();
  });

  it("rejects requests without the cron secret", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(request("?force=1", "wrong"));
    expect(response.status).toBe(401);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("processes exactly one batch for the oldest queued job", async () => {
    const { GET } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 44,
        workspace_user_id: 7,
        status: "queued",
        paused_until: null,
        updated_at: new Date(0).toISOString(),
      },
    ]);
    fetch.mockResolvedValueOnce(
      Response.json({
        job: {
          jobId: "44",
          status: "queued",
          batchSize: 10,
          processedCount: 10,
          totalCount: 301,
        },
      }),
    );

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "queued", workspaceUserId: 7, batchSize: 10 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, options] = fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ action: "process", jobId: 44 });
  });

  it("refreshes overdue membership then starts a lightweight nightly manifest", async () => {
    const { GET } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([{ workspace_user_id: 7 }]);
    fetch.mockResolvedValueOnce(Response.json({ leadSolicitor: [] }))
      .mockResolvedValueOnce(Response.json({ job: { jobId: "45" } }))
      .mockResolvedValueOnce(Response.json({ job: { jobId: "45", status: "queued", batchSize: 10 } }));
    expect((await GET(request())).status).toBe(200);
    expect(String(fetch.mock.calls[0][0])).toContain("refreshAssignments=1");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ action: "start", mode: "nightly" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("starts giving maintenance without reloading current assignments", async () => {
    const { GET } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ workspace_user_id: 7, stale_count: 301 }]);
    fetch.mockResolvedValueOnce(Response.json({ job: { jobId: "45" } }))
      .mockResolvedValueOnce(Response.json({ job: { jobId: "45", status: "queued" } }));
    expect((await GET(request())).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[0][1].body).mode).toBe("nightly");
    const query = sqlMock.mock.calls[2][0].join(" ");
    expect(query).toContain("portfolio_giving_snapshots");
    expect(query).toContain("attempted.mode = 'nightly'");
  });
});
