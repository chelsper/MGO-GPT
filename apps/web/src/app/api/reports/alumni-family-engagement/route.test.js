import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  ensureAppSchemaMock,
  getCachedReportSnapshotMock,
  getReportCacheHeadersMock,
  getOrCreateUserMock,
  sqlMock,
  getReportAccessForUserMock,
  saveReportSnapshotMock,
  shouldBypassReportCacheMock,
  getBlackbaudConfigIssuesMock,
  createBlackbaudQueryJobMock,
  getBlackbaudQueryJobMock,
  downloadBlackbaudQueryResultMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  ensureAppSchemaMock: vi.fn(),
  getCachedReportSnapshotMock: vi.fn(),
  getReportCacheHeadersMock: vi.fn((status) => ({ "X-MGOGPT-Report-Cache": status })),
  getOrCreateUserMock: vi.fn(),
  sqlMock: vi.fn(),
  getReportAccessForUserMock: vi.fn(),
  saveReportSnapshotMock: vi.fn(),
  shouldBypassReportCacheMock: vi.fn(() => false),
  getBlackbaudConfigIssuesMock: vi.fn(),
  createBlackbaudQueryJobMock: vi.fn(),
  getBlackbaudQueryJobMock: vi.fn(),
  downloadBlackbaudQueryResultMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: getOrCreateUserMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
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
  downloadBlackbaudQueryResult: downloadBlackbaudQueryResultMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  getBlackbaudQueryJob: getBlackbaudQueryJobMock,
}));

function createRequest(search = "") {
  return new Request(`https://www.jumgogpt.app/api/reports/alumni-family-engagement${search}`);
}

describe("Alumni & Family Engagement report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BLACKBAUD_ALUMNI_FAMILY_ENGAGEMENT_QUERY_ID;
    delete process.env.BLACKBAUD_ALUMNI_FAMILY_ENGAGEMENT_QUERY_NAME;
    authMock.mockResolvedValue({ user: { email: "mgo@example.edu" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({ id: 7, role: "mgo" });
    getReportAccessForUserMock.mockResolvedValue({ canView: true });
    getCachedReportSnapshotMock.mockResolvedValue(null);
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    saveReportSnapshotMock.mockResolvedValue();
    sqlMock.mockResolvedValue([
      {
        source_query_id: "query-1",
        source_query_name: "FY27 Alumni Donors",
      },
    ]);
    createBlackbaudQueryJobMock.mockResolvedValue({ id: "job-1" });
    getBlackbaudQueryJobMock.mockResolvedValue({ status: "Running" });
  });

  it("requires an administrator to configure the saved source query before it runs", async () => {
    sqlMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route.js");

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "setup_required" });
    expect(createBlackbaudQueryJobMock).not.toHaveBeenCalled();
  });

  it("returns the cached report without making another NXT request", async () => {
    getCachedReportSnapshotMock.mockResolvedValueOnce({
      status: "complete",
      metrics: { alumniDonors: 2 },
      donors: [{ id: "alumni-donor-101" }],
    });
    const { GET } = await import("./route.js");

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      metrics: { alumniDonors: 2 },
    });
    expect(createBlackbaudQueryJobMock).not.toHaveBeenCalled();
  });

  it("returns a pollable response while Blackbaud materializes a newly created query job", async () => {
    getBlackbaudQueryJobMock.mockRejectedValueOnce(
      new Error("Blackbaud 404 Resource Not Found: Resource not found"),
    );
    const { GET } = await import("./route.js");

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({ status: "running", jobId: "job-1", jobStatus: "Starting" });
  });

  it("counts unique credited alumni, including two soft-credit spouses for one gift", async () => {
    const { buildAlumniDonorReport } = await import("./route.js");
    const report = buildAlumniDonorReport(
      [
        "Constituent System Record ID,Constituent Name,Constituency Code,Gift Type,Credit Type,Gift Date",
        "101,Alex Alum,Alumni Bachelor's Degree,Cash Received,Soft Credit,2026-08-01",
        "102,Jamie Alum,Alumni Bachelor's Degree,Donation,Soft Credit,2026-08-01",
        "101,Alex Alum,Alumni Bachelor's Degree,Cash Received,Direct Credit,2026-08-10",
        "103,Pat Parent,Parent,Cash Received,Direct Credit,2026-08-01",
      ].join("\n"),
      {
        fiscalYear: {
          startDate: "2026-07-01",
          endDate: "2027-06-30",
          fiscalYear: 2027,
          yearLabel: "FY27",
        },
      },
    );

    expect(report.metrics).toMatchObject({
      alumniDonors: 2,
      directCreditDonors: 1,
      softCreditDonors: 2,
      qualifyingCreditRows: 3,
      duplicateCreditsCollapsed: 1,
      excludedNonAlumniRows: 1,
    });
    expect(report.donors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ constituentId: "101", hasSoftCredit: true, hasDirectCredit: true }),
        expect.objectContaining({ constituentId: "102", hasSoftCredit: true, hasDirectCredit: false }),
      ]),
    );
  });
});
