import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  ensureAppSchemaMock,
  sqlMock,
  getReportRefreshUserMock,
  isAuthorizedReportRefreshRequestMock,
} = vi.hoisted(() => ({
  ensureAppSchemaMock: vi.fn(),
  sqlMock: vi.fn(),
  getReportRefreshUserMock: vi.fn(),
  isAuthorizedReportRefreshRequestMock: vi.fn(),
}));

vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/app/api/utils/reportRefresh", () => ({
  getReportRefreshUser: getReportRefreshUserMock,
  isAuthorizedReportRefreshRequest: isAuthorizedReportRefreshRequestMock,
}));

function createRequest(search = "") {
  return new Request(
    `https://www.jumgogpt.app/api/internal/custom-field-report-cache-refresh${search}`,
    {
      headers: {
        authorization: "Bearer test-refresh-secret",
        "x-mgogpt-report-refresh": "scheduled",
      },
    },
  );
}

describe("custom field report snapshot refresh cron", () => {
  let fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VERCEL_ENV", "test");
    vi.stubEnv("PORTFOLIO_MAINTENANCE_ORIGIN", "");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T14:00:00.000Z"));
    ensureAppSchemaMock.mockResolvedValue();
    sqlMock.mockResolvedValue([{ slug: "alumni-donors", title: "Alumni Donors" }]);
    getReportRefreshUserMock.mockResolvedValue({
      id: 7,
      name: "Refresh User",
      email: "refresh@example.edu",
    });
    isAuthorizedReportRefreshRequestMock.mockReturnValue(true);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not call NXT outside the staggered evening refresh window", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "skipped" });
    expect(payload.reason).toMatch(/staggered custom-report/i);
    expect(sqlMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes only one enabled configured report when explicitly forced", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "complete",
          generatedAt: "2026-08-25T14:00:00.000Z",
          totalRows: 42,
          report: { title: "Alumni Donors" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const { GET } = await import("./route.js");
    const response = await GET(createRequest("?force=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "refreshed",
      refreshed: { slug: "alumni-donors", totalRows: 42 },
      forced: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe(
      "/api/reports/custom-field/alumni-donors",
    );
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer test-refresh-secret",
      "x-mgogpt-report-refresh": "scheduled",
    });
    const selectionQuery = sqlMock.mock.calls[0][0].join(" ");
    expect(selectionQuery).toContain("s.updated_at <");
    expect(selectionQuery).toContain("INTERVAL '18 hours'");
  });

  it("uses the main production domain for custom-report callbacks and polling", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("AUTH_URL", "https://jumgogpt.app");
    vi.stubEnv("PORTFOLIO_MAINTENANCE_ORIGIN", "https://www.jumgogpt.app");
    fetchMock.mockResolvedValueOnce(Response.json({ jobId: "fixture-job" }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ status: "complete", totalRows: 1 }));
    const { GET } = await import("./route.js");
    const pending = GET(new Request("https://deployment.vercel.app/api/internal/custom-field-report-cache-refresh?force=1", {
      headers: { authorization: "Bearer test-refresh-secret" },
    }));
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(new URL(url).origin).toBe("https://www.jumgogpt.app");
      expect(options.redirect).toBe("error");
      expect(options.headers.Authorization).toBe("Bearer test-refresh-secret");
    }
  });
});
