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
  downloadBlackbaudQueryResultMock,
  downloadBlackbaudQueryResultWithMetadataMock,
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
  downloadBlackbaudQueryResultMock: vi.fn(),
  downloadBlackbaudQueryResultWithMetadataMock: vi.fn(),
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
  BlackbaudQueryResultTooLargeError: class BlackbaudQueryResultTooLargeError extends Error {},
  createBlackbaudQueryJob: createBlackbaudQueryJobMock,
  downloadBlackbaudQueryResult: downloadBlackbaudQueryResultMock,
  downloadBlackbaudQueryResultWithMetadata: downloadBlackbaudQueryResultWithMetadataMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  getBlackbaudQueryJob: getBlackbaudQueryJobMock,
}));

const SAVED_QUERY_COUNTS = {
  "30976": 133,
  "30679": 1412,
  "30369": 1714,
};

function createRequest(search = "") {
  return new Request(`https://www.jumgogpt.app/api/reports/alumni-family-engagement${search}`);
}

function createCachedSnapshot(dashboard = DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD) {
  const generatedAt = "2026-08-31T18:00:00.000Z";
  const totals = getAlumniDonorCountRows(dashboard).map((row) => ({
    ...row,
    total: SAVED_QUERY_COUNTS[row.queryId] ?? 0,
    countSource: "query-result-csv-row-count-v3",
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
    // This field is deliberately not trusted as the result count.
    row_count: 1,
    sas_uri: `https://query-results.example/${String(jobId).replace("query-", "")}.csv`,
  }));
  downloadBlackbaudQueryResultMock.mockImplementation(async (resultUrl) => {
    const queryId = String(resultUrl).match(/\/(\d+)\.csv$/)?.[1];
    const rowCount = SAVED_QUERY_COUNTS[queryId] ?? 0;
    return [
      "Constituent system record ID",
      ...Array.from({ length: rowCount }, (_, index) => String(index + 1)),
    ].join("\n");
  });
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
    getReportAccessForUserMock.mockResolvedValueOnce({ canView: true, canArrange: true });
    getCachedReportSnapshotMock.mockResolvedValueOnce(createCachedSnapshot());
    const { GET } = await import("./route.js");
    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      report: { canArrange: true },
      dashboardConfiguration: {
        panels: [expect.objectContaining({ width: "half" })],
      },
      dashboard: {
        panels: [
          {
            title: "Alumni Donor Count by Fiscal Year",
            totals: [
              { key: "fy27-alumni-giving", queryId: "30976", total: 133 },
              { key: "fy26-alumni-giving", queryId: "30679", total: 1412 },
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
              { key: "fy27-alumni-giving", total: 133 },
              { key: "fy26-alumni-giving", total: 1412 },
            ],
          },
        ],
      },
      refreshMetrics: {
        source: "blackbaud-query-result-csv",
        queryJobs: 2,
        queryJobPolls: 2,
      },
    });
    expect(createBlackbaudQueryJobMock).toHaveBeenCalledTimes(2);
    expect(getBlackbaudQueryJobMock).toHaveBeenCalledTimes(2);
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
        refreshMetrics: expect.objectContaining({ source: "blackbaud-query-result-csv" }),
      }),
    );
  });

  it("does not serve a legacy snapshot that used saved-query metadata", async () => {
    const snapshot = createCachedSnapshot();
    snapshot.totals.forEach((total) => {
      total.countSource = "saved-query-record-count-v1";
    });
    getCachedReportSnapshotMock.mockResolvedValueOnce(snapshot);
    const { GET } = await import("./route.js");
    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "refresh_required" });
    expect(createBlackbaudQueryJobMock).not.toHaveBeenCalled();
  });

  it("uses downloaded query-result rows instead of query-job metadata", async () => {
    getBlackbaudQueryJobMock.mockImplementation(async ({ jobId }) => ({
      id: jobId,
      status: "Completed",
      // Job metadata can say 1 even when the downloaded result has hundreds
      // or thousands of rows.
      row_count: 1,
      sas_uri: `https://query-results.example/${String(jobId).replace("query-", "")}.csv`,
    }));
    const { GET } = await import("./route.js");
    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.dashboard.panels[0].totals[0]).toMatchObject({
      key: "fy27-alumni-giving",
      total: 133,
      countSource: "query-result-csv-row-count-v3",
    });
    expect(downloadBlackbaudQueryResultMock).toHaveBeenCalledTimes(2);
  });

  it("does not save query-job metadata as a CSV result", async () => {
    downloadBlackbaudQueryResultMock.mockResolvedValueOnce(
      JSON.stringify({ id: "query-30976", status: "Completed" }),
    );
    const { GET } = await import("./route.js");
    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toMatch(
      /metadata instead of the completed CSV result/i,
    );
    expect(saveReportSnapshotMock).not.toHaveBeenCalled();
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

  it("refreshes an Output Query panel beside the existing donor-count panel", async () => {
    const dashboard = {
      ...DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD,
      panels: [
        ...DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD.panels,
        {
          key: "ppc-output",
          title: "PPC 2026-27",
          layout: "query_results",
          width: "full",
          queryId: "30971",
          refreshPolicy: "refreshable",
          columnSettings: [],
          rows: [],
          columns: [],
          values: [],
        },
      ],
    };
    getReportAccessForUserMock.mockResolvedValue({
      canView: true,
      dataConfiguration: dashboard,
    });
    downloadBlackbaudQueryResultWithMetadataMock.mockResolvedValue({
      body: Uint8Array.from(Buffer.from(
        "PPC Member Name,Total Giving FY27\nAnna Arribas,$0.00\nAmie Barry,$50.00",
      )),
      contentType: "text/csv; charset=utf-8",
    });
    const { GET } = await import("./route.js");
    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.genericConfiguration.panels[0]).toMatchObject({
      key: "ppc-output",
      queryId: "30971",
    });
    expect(downloadBlackbaudQueryResultWithMetadataMock).toHaveBeenCalledTimes(1);
    expect(saveReportSnapshotMock.mock.calls[0][1].genericSnapshot.tables[0]).toMatchObject({
      key: "ppc-output",
      headers: ["PPC Member Name", "Total Giving FY27"],
      rows: [["Anna Arribas", "$0.00"], ["Amie Barry", "$50.00"]],
      status: "ready",
    });
    expect(payload.genericSnapshot.tables[0]).toMatchObject({
      key: "ppc-output",
      headers: ["PPC Member Name", "Total Giving FY27"],
      rows: [["Anna Arribas", "$0.00"], ["Amie Barry", "$50.00"]],
      status: "ready",
    });
    expect(saveReportSnapshotMock).toHaveBeenCalledWith(
      "report:alumni-family-engagement",
      expect.objectContaining({
        genericSnapshot: expect.objectContaining({
          tables: [expect.objectContaining({ key: "ppc-output" })],
        }),
      }),
    );
  });
});
