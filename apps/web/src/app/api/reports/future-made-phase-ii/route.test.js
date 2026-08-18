import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  ensureAppSchemaMock,
  getOrCreateUserMock,
  sqlMock,
  getReportAccessForUserMock,
  getBlackbaudConfigIssuesMock,
  findBlackbaudQueryByNameMock,
  createBlackbaudQueryJobMock,
  getBlackbaudQueryJobMock,
  downloadBlackbaudQueryResultMock,
  getBlackbaudConstituentByIdMock,
  listBlackbaudConstituentCustomFieldsMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  ensureAppSchemaMock: vi.fn(),
  getOrCreateUserMock: vi.fn(),
  sqlMock: vi.fn(),
  getReportAccessForUserMock: vi.fn(),
  getBlackbaudConfigIssuesMock: vi.fn(),
  findBlackbaudQueryByNameMock: vi.fn(),
  createBlackbaudQueryJobMock: vi.fn(),
  getBlackbaudQueryJobMock: vi.fn(),
  downloadBlackbaudQueryResultMock: vi.fn(),
  getBlackbaudConstituentByIdMock: vi.fn(),
  listBlackbaudConstituentCustomFieldsMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: getOrCreateUserMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
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
  getBlackbaudConstituentById: getBlackbaudConstituentByIdMock,
  listBlackbaudConstituentCustomFields: listBlackbaudConstituentCustomFieldsMock,
}));

function createRequest(search = "") {
  return new Request(`https://www.jumgogpt.app/api/reports/future-made-phase-ii${search}`);
}

describe("Future. Made. Phase II report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BLACKBAUD_FUTURE_MADE_PHASE_TWO_QUERY_ID;
    delete process.env.BLACKBAUD_FUTURE_MADE_PHASE_TWO_QUERY_NAME;
    authMock.mockResolvedValue({ user: { email: "mgo@example.edu" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({ id: 7, role: "mgo" });
    getReportAccessForUserMock.mockResolvedValue({ canView: true });
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    sqlMock.mockResolvedValue([]);
    findBlackbaudQueryByNameMock.mockResolvedValue({
      id: "query-1",
      name: "Future. Made. Phase II",
    });
    createBlackbaudQueryJobMock.mockResolvedValue({ id: "job-1" });
    getBlackbaudQueryJobMock.mockResolvedValue({ status: "Running" });
    getBlackbaudConstituentByIdMock.mockResolvedValue(null);
    listBlackbaudConstituentCustomFieldsMock.mockResolvedValue([]);
  });

  it("creates a saved-query job and returns the job while NXT is still running", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({ status: "running", jobId: "job-1" });
    expect(findBlackbaudQueryByNameMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Future. Made. Phase II", versions: ["v1"] }),
    );
    expect(createBlackbaudQueryJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ queryId: "query-1" }),
    );
  });

  it("uses an explicit query ID override when configured", async () => {
    process.env.BLACKBAUD_FUTURE_MADE_PHASE_TWO_QUERY_ID = "query-override";
    process.env.BLACKBAUD_FUTURE_MADE_PHASE_TWO_QUERY_NAME = "Future. Made. Phase II (Pinned)";

    const { GET } = await import("./route.js");
    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      status: "running",
      jobId: "job-1",
    });
    expect(findBlackbaudQueryByNameMock).not.toHaveBeenCalled();
    expect(createBlackbaudQueryJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ queryId: "query-override" }),
    );
  });

  it("falls back to a custom-field scan when the query cannot be executed", async () => {
    const { GET } = await import("./route.js");
    createBlackbaudQueryJobMock.mockRejectedValue(
      new Error("Blackbaud 404 Resource Not Found: Resource not found"),
    );
    sqlMock
      .mockResolvedValueOnce([
        {
          blackbaud_constituent_id: "555321",
          name: "Jordan Prospect",
          email: "jordan@example.com",
          phone: "555-1234",
          source: "prospect_pool",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    listBlackbaudConstituentCustomFieldsMock.mockResolvedValue([
      {
        id: "cf-1",
        category: "Prospect Research",
        description: "Future.Made.Phase II",
        comment: "Reviewed by team",
        date: "2026-08-18",
      },
    ]);
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "555321",
      lookupId: "A123",
      name: "Jordan Prospect",
    });

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      mode: "custom-field-fallback",
      totalRows: 1,
      rows: [
        {
          name: "Jordan Prospect",
          constituentId: "555321",
          values: expect.objectContaining({
            "Constituent lookup ID": "A123",
            "Date added": "08/18/26",
            "Added by": "",
          }),
        },
      ],
    });
  });

  it("re-resolves the query by name when a configured query ID is stale", async () => {
    process.env.BLACKBAUD_FUTURE_MADE_PHASE_TWO_QUERY_ID = "30969";
    createBlackbaudQueryJobMock
      .mockRejectedValueOnce(new Error("Blackbaud 404 Resource Not Found: Resource not found"))
      .mockResolvedValueOnce({ id: "job-2" });
    getBlackbaudQueryJobMock.mockRejectedValueOnce(
      new Error("Blackbaud 404 Resource Not Found: Resource not found"),
    );
    findBlackbaudQueryByNameMock.mockResolvedValue({
      id: "query-v1-live",
      name: "Future. Made. Phase II",
    });

    const { GET } = await import("./route.js");
    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      status: "running",
      jobId: "job-2",
      jobStatus: "Starting (re-resolved query ID)",
    });
    expect(findBlackbaudQueryByNameMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Future. Made. Phase II", versions: ["v1"] }),
    );
    expect(createBlackbaudQueryJobMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ queryId: "30969" }),
    );
    expect(createBlackbaudQueryJobMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ queryId: "query-v1-live" }),
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

  it("falls back to a custom-field scan when an existing query job becomes unreadable", async () => {
    const { GET } = await import("./route.js");
    getBlackbaudQueryJobMock.mockRejectedValue(
      new Error("Blackbaud 404 Resource Not Found: Resource not found"),
    );
    sqlMock
      .mockResolvedValueOnce([
        {
          blackbaud_constituent_id: "555321",
          name: "Jordan Prospect",
          email: "jordan@example.com",
          phone: "555-1234",
          source: "prospect_pool",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    listBlackbaudConstituentCustomFieldsMock.mockResolvedValue([
      {
        id: "cf-1",
        category: "Prospect Research",
        description: "Future.Made.Phase II",
        comment: "Reviewed by team",
        date: "2026-08-18",
      },
    ]);
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "555321",
      lookupId: "A123",
      name: "Jordan Prospect",
    });

    const response = await GET(createRequest("?jobId=job-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      mode: "custom-field-fallback",
      totalRows: 1,
    });
  });

  it("returns every CSV row from a completed query without portfolio filtering", async () => {
    const { GET } = await import("./route.js");
    getBlackbaudQueryJobMock.mockResolvedValue({
      status: "Completed",
      sas_uri: "https://download.example.com/query.csv",
    });
    downloadBlackbaudQueryResultMock.mockResolvedValue(
      "Constituent name,Constituent lookup ID,Constituent system record ID,Status\nAda Lovelace,ADA1,123,Active\nGrace Hopper,GRACE2,456,Active\n",
    );
    listBlackbaudConstituentCustomFieldsMock
      .mockResolvedValueOnce([
        {
          id: "cf-1",
          category: "Prospect Research",
          description: "Future. Made. Phase II",
          comment: "Added from JUMGOGPT by Jordan Executive",
          date: "2026-08-18",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "cf-2",
          category: "Prospect Research",
          description: "Future. Made. Phase II",
          comment: "Added from JUMGOGPT by Pat Admin",
          date: "2026-08-17",
        },
      ]);
    getBlackbaudConstituentByIdMock
      .mockResolvedValueOnce({
        blackbaudConstituentId: "123",
        lookupId: "ADA1",
        name: "Ada Lovelace",
      })
      .mockResolvedValueOnce({
        blackbaudConstituentId: "456",
        lookupId: "GRACE2",
        name: "Grace Hopper",
      });

    const response = await GET(createRequest("?jobId=job-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      columns: [
        "Constituent name",
        "Constituent lookup ID",
        "Date added",
        "Added by",
      ],
      totalRows: 2,
      rows: [
        {
          name: "Ada Lovelace",
          constituentId: "123",
          values: expect.objectContaining({
            "Constituent lookup ID": "ADA1",
            "Date added": "08/18/26",
            "Added by": "Jordan Executive",
          }),
        },
        {
          name: "Grace Hopper",
          constituentId: "456",
          values: expect.objectContaining({
            "Constituent lookup ID": "GRACE2",
            "Date added": "08/17/26",
            "Added by": "Pat Admin",
          }),
        },
      ],
    });
    expect(createBlackbaudQueryJobMock).not.toHaveBeenCalled();
  });

  it("falls back to a custom-field scan when query results cannot be downloaded", async () => {
    const { GET } = await import("./route.js");
    getBlackbaudQueryJobMock.mockResolvedValue({
      status: "Completed",
      sas_uri: "https://download.example.com/query.csv",
    });
    downloadBlackbaudQueryResultMock.mockRejectedValue(
      new Error("Blackbaud 404 Resource Not Found: Resource not found"),
    );
    sqlMock
      .mockResolvedValueOnce([
        {
          blackbaud_constituent_id: "555321",
          name: "Jordan Prospect",
          email: "jordan@example.com",
          phone: "555-1234",
          source: "prospect_pool",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    listBlackbaudConstituentCustomFieldsMock.mockResolvedValue([
      {
        id: "cf-1",
        category: "Prospect Research",
        description: "Future.Made.Phase II",
      },
    ]);
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "555321",
      lookupId: "A123",
      name: "Jordan Prospect",
    });

    const response = await GET(createRequest("?jobId=job-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      mode: "custom-field-fallback",
      totalRows: 1,
    });
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
