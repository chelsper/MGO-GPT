import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ALUMNI_DONOR_CONFIGURATION,
  getAlumniDonorConfigurationFingerprint,
} from "@/app/api/utils/alumniDonorConfiguration";

const {
  authMock,
  createBlackbaudAdHocQueryJobMock,
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
  createBlackbaudAdHocQueryJobMock: vi.fn(),
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
  createBlackbaudAdHocQueryJob: createBlackbaudAdHocQueryJobMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  getBlackbaudQueryJob: getBlackbaudQueryJobMock,
}));

function createRequest(search = "") {
  return new Request(`https://www.jumgogpt.app/api/reports/alumni-family-engagement${search}`);
}

function createCachedSnapshot(overrides = {}) {
  return {
    status: "complete",
    generatedAt: "2026-08-25T18:00:00.000Z",
    configurationFingerprint: getAlumniDonorConfigurationFingerprint(
      DEFAULT_ALUMNI_DONOR_CONFIGURATION,
    ),
    totalRows: 5,
    totals: [
      { key: "fy27-alumni-giving", total: 3 },
      { key: "fy26-alumni-giving", total: 2 },
    ],
    ...overrides,
  };
}

function mockCompletedDefaultCountJobs() {
  createBlackbaudAdHocQueryJobMock.mockImplementation(async ({ query }) => {
    const dateFilter = query.filter_fields.find((field) => field.query_field_id === 8471);
    const startDate = dateFilter?.filter_values?.[0];
    return { id: startDate === "7/1/2026" ? "fy27-job" : "fy26-job", status: "Queued" };
  });
  getBlackbaudQueryJobMock.mockImplementation(async ({ jobId }) => ({
    id: jobId,
    status: "Completed",
    row_count: jobId === "fy27-job" ? 3 : 2,
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

  it("returns the matching snapshot without another NXT request", async () => {
    getCachedReportSnapshotMock.mockResolvedValueOnce(createCachedSnapshot());
    const { GET } = await import("./route.js");

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      totalRows: 5,
      totals: [
        { key: "fy27-alumni-giving", label: "FY27 Alumni Giving", total: 3 },
        { key: "fy26-alumni-giving", label: "FY26 Alumni Giving", total: 2 },
      ],
    });
    expect(createBlackbaudAdHocQueryJobMock).not.toHaveBeenCalled();
    expect(getBlackbaudQueryJobMock).not.toHaveBeenCalled();
  });

  it("requires an explicit refresh when no matching snapshot exists", async () => {
    const { GET } = await import("./route.js");

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "refresh_required" });
    expect(createBlackbaudAdHocQueryJobMock).not.toHaveBeenCalled();
  });

  it("refreshes totals from compact NXT Query API jobs", async () => {
    const { GET } = await import("./route.js");

    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      totalRows: 5,
      totals: [
        { key: "fy27-alumni-giving", label: "FY27 Alumni Giving", total: 3 },
        { key: "fy26-alumni-giving", label: "FY26 Alumni Giving", total: 2 },
      ],
      refreshMetrics: {
        source: "blackbaud-query-api",
        queryJobs: 2,
        queryJobPolls: 2,
      },
    });
    expect(createBlackbaudAdHocQueryJobMock).toHaveBeenCalledTimes(2);
    expect(getBlackbaudQueryJobMock).toHaveBeenCalledTimes(2);
    expect(createBlackbaudAdHocQueryJobMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        query: expect.objectContaining({
          type_id: 18,
          suppress_duplicates: true,
          select_fields: [],
          gift_processing_options: expect.objectContaining({
            soft_credit_option: "Both",
            matching_gift_credit_option: "Both",
          }),
          filter_fields: [
            expect.objectContaining({
              query_field_id: 2217,
              filter_values: ["13", "12366", "9799", "14061", "9721", "10296", "8818", "8897", "9384"],
            }),
            expect.objectContaining({
              query_field_id: 8471,
              filter_values: ["7/1/2026", "6/30/2027"],
            }),
          ],
        }),
      }),
    );
    expect(saveReportSnapshotMock).toHaveBeenCalledWith(
      "report:alumni-family-engagement",
      expect.objectContaining({
        status: "complete",
        totalRows: 5,
        refreshMetrics: expect.objectContaining({ source: "blackbaud-query-api" }),
      }),
    );
  });

  it("uses a custom selected constituency code in the generated query", async () => {
    getReportAccessForUserMock.mockResolvedValue({
      canView: true,
      dataConfiguration: {
        constituencies: ["8818 | Alumni Bachelor's Degree"],
        includeSoftCreditedDonors: false,
        includeMatchingGiftCredits: false,
        rows: [
          {
            key: "fy25-alumni-giving",
            label: "FY25 Alumni Giving",
            fiscalYearStart: "2024-07-01",
            fiscalYearEnd: "2025-06-30",
          },
        ],
      },
    });
    createBlackbaudAdHocQueryJobMock.mockResolvedValue({ id: "fy25-job" });
    getBlackbaudQueryJobMock.mockResolvedValue({ id: "fy25-job", status: "Completed", row_count: 8 });
    const { GET } = await import("./route.js");

    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      totals: [{ key: "fy25-alumni-giving", label: "FY25 Alumni Giving", total: 8 }],
      donorDefinition: {
        constituencies: ["Alumni Bachelor's Degree"],
        includeSoftCreditedDonors: false,
        includeMatchingGiftCredits: false,
      },
    });
    expect(createBlackbaudAdHocQueryJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          gift_processing_options: expect.objectContaining({
            soft_credit_option: "Donor",
            matching_gift_credit_option: "Donor",
          }),
          filter_fields: [
            expect.objectContaining({ filter_values: ["8818"] }),
            expect.objectContaining({ filter_values: ["7/1/2024", "6/30/2025"] }),
          ],
        }),
      }),
    );
  });

  it("preserves the last successful snapshot when a manual refresh fails", async () => {
    getCachedReportSnapshotMock.mockResolvedValueOnce(createCachedSnapshot());
    getBlackbaudQueryJobMock.mockResolvedValue({ id: "fy27-job", status: "Failed" });
    const { GET } = await import("./route.js");

    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      totalRows: 5,
    });
    expect(payload.refreshWarning).toContain("Showing the last successful snapshot instead");
    expect(saveReportSnapshotMock).not.toHaveBeenCalled();
  });

  it("does not present a snapshot created with a different donor definition", async () => {
    getReportAccessForUserMock.mockResolvedValue({
      canView: true,
      dataConfiguration: { includeSoftCreditedDonors: false },
    });
    getCachedReportSnapshotMock.mockResolvedValueOnce(createCachedSnapshot());
    const { GET } = await import("./route.js");

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "refresh_required" });
    expect(createBlackbaudAdHocQueryJobMock).not.toHaveBeenCalled();
  });
});
