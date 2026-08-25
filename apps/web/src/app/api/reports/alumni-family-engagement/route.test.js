import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  ensureAppSchemaMock,
  getCachedReportSnapshotMock,
  getReportCacheHeadersMock,
  getOrCreateUserMock,
  getReportAccessForUserMock,
  saveReportSnapshotMock,
  shouldBypassReportCacheMock,
  getBlackbaudConfigIssuesMock,
  createBlackbaudQueryJobMock,
  getBlackbaudQueryJobMock,
  downloadBlackbaudQueryResultMock,
  findBlackbaudQueryByNameMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  ensureAppSchemaMock: vi.fn(),
  getCachedReportSnapshotMock: vi.fn(),
  getReportCacheHeadersMock: vi.fn((status) => ({ "X-MGOGPT-Report-Cache": status })),
  getOrCreateUserMock: vi.fn(),
  getReportAccessForUserMock: vi.fn(),
  saveReportSnapshotMock: vi.fn(),
  shouldBypassReportCacheMock: vi.fn(
    (request) => new URL(request.url).searchParams.get("refresh") === "1",
  ),
  getBlackbaudConfigIssuesMock: vi.fn(),
  createBlackbaudQueryJobMock: vi.fn(),
  getBlackbaudQueryJobMock: vi.fn(),
  downloadBlackbaudQueryResultMock: vi.fn(),
  findBlackbaudQueryByNameMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: getOrCreateUserMock }));
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
  findBlackbaudQueryByName: findBlackbaudQueryByNameMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  getBlackbaudQueryJob: getBlackbaudQueryJobMock,
}));

function createRequest(search = "") {
  return new Request(`https://www.jumgogpt.app/api/reports/alumni-family-engagement${search}`);
}

describe("Alumni & Family Engagement report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { email: "mgo@example.edu" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({ id: 7, role: "mgo" });
    getReportAccessForUserMock.mockResolvedValue({ canView: true });
    getCachedReportSnapshotMock.mockResolvedValue(null);
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    saveReportSnapshotMock.mockResolvedValue();
    createBlackbaudQueryJobMock.mockImplementation(({ queryId }) =>
      Promise.resolve({ id: queryId === "30976" ? "job-fy27" : "job-fy26" }),
    );
    getBlackbaudQueryJobMock.mockResolvedValue({ status: "Running" });
  });

  it("starts both fixed alumni donor total queries together", async () => {
    getBlackbaudQueryJobMock.mockRejectedValueOnce(
      new Error("Blackbaud 404 Resource Not Found: Resource not found"),
    );
    const { GET } = await import("./route.js");

    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      status: "running",
      poll: {
        fy27JobId: "job-fy27",
        fy26JobId: "job-fy26",
      },
    });
    expect(createBlackbaudQueryJobMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ queryId: "30976" }),
    );
    expect(createBlackbaudQueryJobMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ queryId: "30679" }),
    );
  });

  it("resolves an NXT system record ID through the exact saved query name after a 404", async () => {
    createBlackbaudQueryJobMock.mockImplementation(async ({ queryId }) => {
      if (queryId === "30976") {
        throw new Error("Blackbaud 404 Resource Not Found: Resource not found");
      }
      return { id: queryId === "query-api-fy27" ? "job-fy27" : "job-fy26" };
    });
    findBlackbaudQueryByNameMock.mockResolvedValue({
      id: "query-api-fy27",
      name: "Alumni Donors FY27",
    });
    const { GET } = await import("./route.js");

    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.poll).toMatchObject({ fy27JobId: "job-fy27", fy26JobId: "job-fy26" });
    expect(findBlackbaudQueryByNameMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Alumni Donors FY27", versions: ["v1"] }),
    );
    expect(createBlackbaudQueryJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ queryId: "query-api-fy27" }),
    );
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

  it("does not start a Blackbaud query without a snapshot unless explicitly refreshed", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "refresh_required" });
    expect(createBlackbaudQueryJobMock).not.toHaveBeenCalled();
  });

  it("counts the rows returned by each saved query and saves one snapshot", async () => {
    getBlackbaudQueryJobMock.mockImplementation(({ jobId }) =>
      Promise.resolve({
        status: "Completed",
        sas_uri: `https://results.example/${jobId}.csv`,
      }),
    );
    downloadBlackbaudQueryResultMock
      .mockResolvedValueOnce("Constituent\nAlex\nJamie\nTaylor")
      .mockResolvedValueOnce("Constituent\nMorgan\nRiley");
    const { GET } = await import("./route.js");

    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      totalRows: 5,
      totals: [
        { key: "fy27", label: "FY27 Alumni Donor Total", queryId: "30976", total: 3 },
        { key: "fy26", label: "FY26 Alumni Donor Total", queryId: "30679", total: 2 },
      ],
    });
    expect(saveReportSnapshotMock).toHaveBeenCalledWith(
      "report:alumni-family-engagement",
      expect.objectContaining({ status: "complete", totalRows: 5 }),
    );
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
