import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  ensureAppSchemaMock,
  getOrCreateUserMock,
  getCustomFieldReportAccessForUserMock,
  getReportRefreshUserMock,
  isAuthorizedReportRefreshRequestMock,
  getCachedReportSnapshotMock,
  getReportCacheHeadersMock,
  saveReportSnapshotMock,
  shouldBypassReportCacheMock,
  createBlackbaudAdHocQueryJobMock,
  createBlackbaudQueryJobMock,
  downloadBlackbaudQueryResultMock,
  getBlackbaudConfigIssuesMock,
  getBlackbaudQueryJobMock,
  getDirectCustomFieldQueryDefinitionMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  ensureAppSchemaMock: vi.fn(),
  getOrCreateUserMock: vi.fn(),
  getCustomFieldReportAccessForUserMock: vi.fn(),
  getReportRefreshUserMock: vi.fn(),
  isAuthorizedReportRefreshRequestMock: vi.fn(),
  getCachedReportSnapshotMock: vi.fn(),
  getReportCacheHeadersMock: vi.fn(),
  saveReportSnapshotMock: vi.fn(),
  shouldBypassReportCacheMock: vi.fn(),
  createBlackbaudAdHocQueryJobMock: vi.fn(),
  createBlackbaudQueryJobMock: vi.fn(),
  downloadBlackbaudQueryResultMock: vi.fn(),
  getBlackbaudConfigIssuesMock: vi.fn(),
  getBlackbaudQueryJobMock: vi.fn(),
  getDirectCustomFieldQueryDefinitionMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: getOrCreateUserMock }));
vi.mock("@/app/api/utils/reportAccess", () => ({
  getCustomFieldReportAccessForUser: getCustomFieldReportAccessForUserMock,
}));
vi.mock("@/app/api/utils/reportRefresh", () => ({
  getReportRefreshUser: getReportRefreshUserMock,
  isAuthorizedReportRefreshRequest: isAuthorizedReportRefreshRequestMock,
}));
vi.mock("@/app/api/utils/reportCache", () => ({
  getCachedReportSnapshot: getCachedReportSnapshotMock,
  getReportCacheHeaders: getReportCacheHeadersMock,
  saveReportSnapshot: saveReportSnapshotMock,
  shouldBypassReportCache: shouldBypassReportCacheMock,
}));
vi.mock("@/app/api/utils/blackbaud", () => ({
  createBlackbaudAdHocQueryJob: createBlackbaudAdHocQueryJobMock,
  createBlackbaudQueryJob: createBlackbaudQueryJobMock,
  downloadBlackbaudQueryResult: downloadBlackbaudQueryResultMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  getBlackbaudQueryJob: getBlackbaudQueryJobMock,
}));
vi.mock("@/app/api/utils/customFieldReports", () => ({
  customFieldReportCacheKey: vi.fn((slug) => `report:custom-field:${slug}`),
  serializeCustomFieldReport: vi.fn((record) => ({
    slug: record.slug,
    title: record.title,
    fieldCategory: record.field_category,
    fieldDescription: record.field_description,
    sourceQueryId: record.source_query_id || "",
    sourceQueryName: record.source_query_name || "",
  })),
}));
vi.mock("@/app/api/utils/directCustomFieldQuery", () => ({
  getDirectCustomFieldQueryDefinition: getDirectCustomFieldQueryDefinitionMock,
}));

const directRecord = {
  slug: "innovation-center-prospects",
  title: "Innovation Center Prospects",
  field_category: "Prospect Research",
  field_description: "Innovation Center",
  source_query_id: null,
  source_query_name: null,
  active: true,
};

describe("custom field report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAppSchemaMock.mockResolvedValue();
    isAuthorizedReportRefreshRequestMock.mockReturnValue(false);
    authMock.mockResolvedValue({ user: { email: "admin@example.edu" } });
    getOrCreateUserMock.mockResolvedValue({ id: 8, role: "admin" });
    getReportCacheHeadersMock.mockReturnValue({});
    getCachedReportSnapshotMock.mockResolvedValue(null);
    shouldBypassReportCacheMock.mockReturnValue(false);
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    getDirectCustomFieldQueryDefinitionMock.mockResolvedValue({ type_id: 18 });
    getCustomFieldReportAccessForUserMock.mockResolvedValue({
      record: directRecord,
      canView: false,
    });
  });

  it("does not let an administrator bypass explicit user enablement with a direct URL", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(
      new Request("https://www.jumgogpt.app/api/reports/custom-field/innovation-center-prospects"),
      { params: { slug: "innovation-center-prospects" } },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "This Custom Field Report has not been enabled for you.",
    });
  });

  it("creates a direct count-only query without downloading or retaining NXT rows", async () => {
    shouldBypassReportCacheMock.mockReturnValue(true);
    getCustomFieldReportAccessForUserMock.mockResolvedValue({
      record: directRecord,
      canView: true,
    });
    createBlackbaudAdHocQueryJobMock.mockResolvedValue({ id: "direct-job" });
    getBlackbaudQueryJobMock.mockResolvedValue({
      id: "direct-job",
      status: "Completed",
      row_count: 7,
    });

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request(
        "https://www.jumgogpt.app/api/reports/custom-field/innovation-center-prospects?refresh=1",
      ),
      { params: { slug: "innovation-center-prospects" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "complete",
      resultMode: "count_only",
      totalRows: 7,
      columns: [],
      rows: [],
      query: {
        mode: "direct-custom-field",
        category: "Prospect Research",
        description: "Innovation Center",
      },
    });
    expect(createBlackbaudAdHocQueryJobMock).toHaveBeenCalledWith({
      userId: 8,
      authUserId: 8,
      origin: "https://www.jumgogpt.app",
      query: { type_id: 18 },
      resultsFileName: "custom-field-count-innovation-center-prospects.csv",
    });
    expect(createBlackbaudQueryJobMock).not.toHaveBeenCalled();
    expect(downloadBlackbaudQueryResultMock).not.toHaveBeenCalled();
    expect(saveReportSnapshotMock).toHaveBeenCalledWith(
      "report:custom-field:innovation-center-prospects",
      expect.objectContaining({ resultMode: "count_only", totalRows: 7, rows: [] }),
    );
  });

  it("returns a saved direct report snapshot without calling NXT", async () => {
    getCustomFieldReportAccessForUserMock.mockResolvedValue({
      record: directRecord,
      canView: true,
    });
    getCachedReportSnapshotMock.mockResolvedValue({
      status: "complete",
      resultMode: "count_only",
      totalRows: 12,
      rows: [],
      columns: [],
    });

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request("https://www.jumgogpt.app/api/reports/custom-field/innovation-center-prospects"),
      { params: { slug: "innovation-center-prospects" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "complete",
      resultMode: "count_only",
      totalRows: 12,
    });
    expect(createBlackbaudAdHocQueryJobMock).not.toHaveBeenCalled();
    expect(getBlackbaudQueryJobMock).not.toHaveBeenCalled();
  });
});
