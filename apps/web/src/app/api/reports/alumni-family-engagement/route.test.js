import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD,
  getAlumniDonorCountRowFingerprint,
  getAlumniDonorCountRows,
  getAlumniFamilyEngagementDashboardFingerprint,
} from "@/app/api/utils/alumniDonorConfiguration";

const {
  authMock,
  createBlackbaudQueryJobMock,
  ensureAppSchemaMock,
  getBlackbaudConfigIssuesMock,
  getBlackbaudQueryJobMock,
  getCachedReportSnapshotMock,
  getOrCreateUserMock,
  getReportAccessForUserMock,
  getReportCacheHeadersMock,
  getReportRefreshUserMock,
  isAuthorizedReportRefreshRequestMock,
  saveReportSnapshotMock,
  shouldBypassReportCacheMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  createBlackbaudQueryJobMock: vi.fn(),
  ensureAppSchemaMock: vi.fn(),
  getBlackbaudConfigIssuesMock: vi.fn(),
  getBlackbaudQueryJobMock: vi.fn(),
  getCachedReportSnapshotMock: vi.fn(),
  getOrCreateUserMock: vi.fn(),
  getReportAccessForUserMock: vi.fn(),
  getReportCacheHeadersMock: vi.fn((status) => ({ "X-MGOGPT-Report-Cache": status })),
  getReportRefreshUserMock: vi.fn(),
  isAuthorizedReportRefreshRequestMock: vi.fn(),
  saveReportSnapshotMock: vi.fn(),
  shouldBypassReportCacheMock: vi.fn(
    (request) => new URL(request.url).searchParams.get("refresh") === "1",
  ),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: getOrCreateUserMock }));
vi.mock("@/app/api/utils/reportRefresh", () => ({
  getReportRefreshUser: getReportRefreshUserMock,
  isAuthorizedReportRefreshRequest: isAuthorizedReportRefreshRequestMock,
}));
vi.mock("@/app/api/utils/reportAccess", () => ({
  ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY: "alumni-family-engagement",
  getReportAccessForUser: getReportAccessForUserMock,
}));
vi.mock("@/app/api/utils/reportCache", () => ({
  getCachedReportSnapshot: getCachedReportSnapshotMock,
  getReportCacheHeaders: getReportCacheHeadersMock,
  saveReportSnapshot: saveReportSnapshotMock,
  shouldBypassReportCache: shouldBypassReportCacheMock,
}));
vi.mock("@/app/api/utils/blackbaud", () => ({
  createBlackbaudQueryJob: createBlackbaudQueryJobMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  getBlackbaudQueryJob: getBlackbaudQueryJobMock,
}));

function createRequest(search = "") {
  return new Request(`https://www.jumgogpt.app/api/reports/alumni-family-engagement${search}`);
}

function createCachedSnapshot(dashboard = DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD) {
  const generatedAt = "2026-08-31T18:00:00.000Z";
  const totals = getAlumniDonorCountRows(dashboard).map((row, index) => ({
    ...row,
    total: index === 0 ? 3 : 2,
    definitionFingerprint: getAlumniDonorCountRowFingerprint(dashboard, row),
    frozenAt: row.refreshPolicy === "frozen" ? generatedAt : null,
  }));

  return {
    status: "complete",
    generatedAt,
    configurationFingerprint: getAlumniFamilyEngagementDashboardFingerprint(dashboard),
    totalRows: totals.reduce((sum, total) => sum + total.total, 0),
    totals,
  };
}

function mockCompletedDefaultCountJobs() {
  createBlackbaudQueryJobMock.mockImplementation(async ({ queryId }) => ({
    id: `query-${queryId}`,
    status: "Queued",
  }));
  getBlackbaudQueryJobMock.mockImplementation(async ({ jobId }) => ({
    id: jobId,
    status: "Completed",
    row_count: jobId === "query-30976" ? 3 : 2,
  }));
}

describe("Alumni & Family Engagement report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { email: "mgo@example.edu" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({ id: 7, role: "mgo" });
    getReportAccessForUserMock.mockResolvedValue({ canView: true });
    isAuthorizedReportRefreshRequestMock.mockReturnValue(false);
    getCachedReportSnapshotMock.mockResolvedValue(null);
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    saveReportSnapshotMock.mockResolvedValue();
    mockCompletedDefaultCountJobs();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a compatible snapshot without another NXT request", async () => {
    getCachedReportSnapshotMock.mockResolvedValueOnce(createCachedSnapshot());
    const { GET } = await import("./route.js");
    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      dashboard: {
        panels: [
          {
            title: "Alumni Donor Count by Fiscal Year",
            totals: [
              { key: "fy27-alumni-giving", queryId: "30976", total: 3 },
              { key: "fy26-alumni-giving", queryId: "30679", total: 2 },
            ],
          },
        ],
      },
    });
    expect(createBlackbaudQueryJobMock).not.toHaveBeenCalled();
  });

  it("requires an explicit refresh when no matching snapshot exists", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "refresh_required" });
    expect(createBlackbaudQueryJobMock).not.toHaveBeenCalled();
  });

  it("runs each saved-query row and saves a dashboard snapshot", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      dashboard: {
        panels: [
          {
            totals: [
              { key: "fy27-alumni-giving", total: 3 },
              { key: "fy26-alumni-giving", total: 2 },
            ],
          },
        ],
      },
      refreshMetrics: {
        source: "blackbaud-saved-query-api",
        queryJobs: 2,
        queryJobPolls: 2,
      },
    });
    expect(createBlackbaudQueryJobMock).toHaveBeenCalledTimes(2);
    expect(createBlackbaudQueryJobMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ queryId: "30976" }),
    );
    expect(createBlackbaudQueryJobMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ queryId: "30679" }),
    );
    expect(saveReportSnapshotMock).toHaveBeenCalledWith(
      "report:alumni-family-engagement",
      expect.objectContaining({
        status: "complete",
        refreshMetrics: expect.objectContaining({ source: "blackbaud-saved-query-api" }),
      }),
    );
  });

  it("reuses a frozen row during a manual refresh", async () => {
    getCachedReportSnapshotMock.mockResolvedValueOnce(createCachedSnapshot());
    const { GET } = await import("./route.js");
    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      refreshMetrics: {
        queryJobs: 1,
        queryJobPolls: 1,
        frozenSnapshotsReused: 1,
      },
    });
    expect(createBlackbaudQueryJobMock).toHaveBeenCalledTimes(1);
    expect(createBlackbaudQueryJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ queryId: "30976" }),
    );
  });

  it("returns all frozen rows without another NXT request", async () => {
    const frozenDashboard = {
      ...DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD,
      panels: DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD.panels.map((panel) => ({
        ...panel,
        rows: panel.rows.map((row) => ({ ...row, refreshPolicy: "frozen" })),
      })),
    };
    getReportAccessForUserMock.mockResolvedValue({
      canView: true,
      dataConfiguration: frozenDashboard,
    });
    getCachedReportSnapshotMock.mockResolvedValueOnce(createCachedSnapshot(frozenDashboard));
    const { GET } = await import("./route.js");
    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-MGOGPT-Report-Cache")).toBe("frozen");
    expect(payload).toMatchObject({
      status: "complete",
      refreshMetrics: {
        queryJobs: 0,
        queryJobPolls: 0,
        frozenSnapshotsReused: 2,
      },
    });
    expect(createBlackbaudQueryJobMock).not.toHaveBeenCalled();
    expect(saveReportSnapshotMock).not.toHaveBeenCalled();
  });

  it("preserves the compatible snapshot if a refreshed query job fails", async () => {
    getCachedReportSnapshotMock.mockResolvedValueOnce(createCachedSnapshot());
    getBlackbaudQueryJobMock.mockResolvedValue({ id: "query-30976", status: "Failed" });
    const { GET } = await import("./route.js");
    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "complete" });
    expect(payload.refreshWarning).toContain("Showing the last successful snapshot instead");
    expect(saveReportSnapshotMock).not.toHaveBeenCalled();
  });
});
