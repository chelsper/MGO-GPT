import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  ensureAppSchemaMock,
  getOrCreateUserMock,
  getReportAccessForUserMock,
  getBlackbaudConfigIssuesMock,
  findBlackbaudQueryByNameMock,
  createBlackbaudQueryJobMock,
  getBlackbaudQueryJobMock,
  downloadBlackbaudQueryResultMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  ensureAppSchemaMock: vi.fn(),
  getOrCreateUserMock: vi.fn(),
  getReportAccessForUserMock: vi.fn(),
  getBlackbaudConfigIssuesMock: vi.fn(),
  findBlackbaudQueryByNameMock: vi.fn(),
  createBlackbaudQueryJobMock: vi.fn(),
  getBlackbaudQueryJobMock: vi.fn(),
  downloadBlackbaudQueryResultMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: getOrCreateUserMock }));
vi.mock("@/app/api/utils/reportAccess", () => ({
  FUTURE_MADE_PHASE_TWO_REPORT_KEY: "future-made-phase-ii",
  getReportAccessForUser: getReportAccessForUserMock,
}));
vi.mock("@/app/api/utils/blackbaud", () => ({
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  findBlackbaudQueryByName: findBlackbaudQueryByNameMock,
  createBlackbaudQueryJob: createBlackbaudQueryJobMock,
  getBlackbaudQueryJob: getBlackbaudQueryJobMock,
  downloadBlackbaudQueryResult: downloadBlackbaudQueryResultMock,
}));

function createRequest(search = "") {
  return new Request(`https://www.jumgogpt.app/api/reports/future-made-phase-ii${search}`);
}

describe("Future. Made. Phase II report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { email: "mgo@example.edu" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({ id: 7, role: "mgo" });
    getReportAccessForUserMock.mockResolvedValue({ canView: true });
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    findBlackbaudQueryByNameMock.mockResolvedValue({
      id: "query-1",
      name: "Future. Made. Phase II",
    });
    createBlackbaudQueryJobMock.mockResolvedValue({ id: "job-1" });
    getBlackbaudQueryJobMock.mockResolvedValue({ status: "Running" });
  });

  it("creates a saved-query job and returns the job while NXT is still running", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({ status: "running", jobId: "job-1" });
    expect(findBlackbaudQueryByNameMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Future. Made. Phase II" }),
    );
    expect(createBlackbaudQueryJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ queryId: "query-1" }),
    );
  });

  it("allows Blackbaud to materialize a newly created query job before polling again", async () => {
    const { GET } = await import("./route.js");
    getBlackbaudQueryJobMock.mockRejectedValue(
      new Error("Blackbaud 404 Resource Not Found: Resource not found"),
    );

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      status: "running",
      jobId: "job-1",
      jobStatus: "Starting",
    });
  });

  it("keeps a missing existing query job visible as an error", async () => {
    const { GET } = await import("./route.js");
    getBlackbaudQueryJobMock.mockRejectedValue(
      new Error("Blackbaud 404 Resource Not Found: Resource not found"),
    );

    const response = await GET(createRequest("?jobId=job-1"));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toMatch(/resource not found/i);
  });

  it("returns every CSV row from a completed query without portfolio filtering", async () => {
    const { GET } = await import("./route.js");
    getBlackbaudQueryJobMock.mockResolvedValue({
      status: "Completed",
      sas_uri: "https://download.example.com/query.csv",
    });
    downloadBlackbaudQueryResultMock.mockResolvedValue(
      "Constituent name,Constituent lookup ID,Status\nAda Lovelace,123,Active\nGrace Hopper,456,Active\n",
    );

    const response = await GET(createRequest("?jobId=job-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      totalRows: 2,
      rows: [
        { name: "Ada Lovelace", constituentId: "123" },
        { name: "Grace Hopper", constituentId: "456" },
      ],
    });
    expect(createBlackbaudQueryJobMock).not.toHaveBeenCalled();
  });

  it("refuses the report when it is not shared with the current user", async () => {
    const { GET } = await import("./route.js");
    getReportAccessForUserMock.mockResolvedValue({ canView: false });

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/not shared/i);
    expect(findBlackbaudQueryByNameMock).not.toHaveBeenCalled();
  });
});
