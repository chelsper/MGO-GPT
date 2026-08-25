import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ensureAppSchemaMock, getReportRefreshUserMock } = vi.hoisted(() => ({
  ensureAppSchemaMock: vi.fn(),
  getReportRefreshUserMock: vi.fn(),
}));

vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/reportRefresh", () => ({
  getReportRefreshUser: getReportRefreshUserMock,
}));

function createRequest(search = "") {
  return new Request(`https://www.jumgogpt.app/api/internal/report-cache-refresh${search}`, {
    headers: { authorization: "Bearer test-refresh-secret" },
  });
}

describe("report snapshot refresh cron", () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalReportRefreshSecret = process.env.REPORT_REFRESH_CRON_SECRET;
  let fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T14:00:00.000Z"));
    process.env.CRON_SECRET = "test-refresh-secret";
    delete process.env.REPORT_REFRESH_CRON_SECRET;
    ensureAppSchemaMock.mockResolvedValue();
    getReportRefreshUserMock.mockResolvedValue({
      id: 7,
      name: "Refresh User",
      email: "refresh@example.edu",
    });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
    if (originalReportRefreshSecret === undefined) delete process.env.REPORT_REFRESH_CRON_SECRET;
    else process.env.REPORT_REFRESH_CRON_SECRET = originalReportRefreshSecret;
  });

  it("does not replace report snapshots outside the 6 PM Eastern refresh window", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "skipped" });
    expect(payload.reason).toMatch(/6 PM New York/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes all reports sequentially when explicitly forced", async () => {
    fetchMock.mockImplementation(async () =>
      new Response(
        JSON.stringify({
          status: "complete",
          generatedAt: "2026-08-25T14:00:00.000Z",
          totalRows: 3,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const { GET } = await import("./route.js");
    const response = await GET(createRequest("?force=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "refreshed", forced: true });
    expect(payload.refreshed).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/api/reports/executive-team-standings",
      "/api/reports/future-made-phase-ii",
      "/api/reports/alumni-family-engagement",
    ]);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.headers).toMatchObject({
        Authorization: "Bearer test-refresh-secret",
        "x-mgogpt-report-refresh": "scheduled",
      });
    }
  });
});
