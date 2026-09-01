import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const createBlackbaudQueryJobMock = vi.fn();
const getBlackbaudQueryJobMock = vi.fn();
const downloadBlackbaudQueryResultWithMetadataMock = vi.fn();
const getBlackbaudConfigIssuesMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));
vi.mock("@/app/api/utils/blackbaud", () => ({
  createBlackbaudQueryJob: createBlackbaudQueryJobMock,
  downloadBlackbaudQueryResultWithMetadata:
    downloadBlackbaudQueryResultWithMetadataMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  getBlackbaudQueryJob: getBlackbaudQueryJobMock,
}));
vi.mock("@/utils/workspaceRoles", () => ({
  isAdminRole: (role) => role === "admin",
}));

const { POST } = await import("./route");

describe("POST /api/admin/alumni-query-diagnostic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAppSchemaMock.mockResolvedValue(undefined);
    authMock.mockResolvedValue({ user: { email: "admin@example.edu" } });
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 7, role: "admin" },
    });
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
  });

  it("runs only query 30976 and returns a redacted, non-cached lifecycle summary", async () => {
    const sasUri = "https://secret.example/result?signature=unsafe";
    createBlackbaudQueryJobMock.mockResolvedValue({
      httpStatus: 202,
      payload: {
        id: "job-30976",
        status: "queued",
        sas_uri: sasUri,
      },
    });
    getBlackbaudQueryJobMock.mockResolvedValue({
      httpStatus: 200,
      payload: {
        id: "job-30976",
        status: "completed",
        row_count: 2,
        sas_uri: sasUri,
        result_uri: "https://secret.example/result-uri",
        download_url: "https://secret.example/download-url",
      },
    });
    downloadBlackbaudQueryResultWithMetadataMock.mockResolvedValue({
      httpStatus: 200,
      contentType: "text/csv; charset=utf-8",
      contentLength: "28",
      body: new TextEncoder().encode("Id,Name\n1,Ada\n2,Bo\n"),
    });

    const response = await POST(
      new Request("https://app.example.edu/api/admin/alumni-query-diagnostic", {
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(createBlackbaudQueryJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ queryId: "30976", includeResponseMetadata: true }),
    );
    expect(getBlackbaudQueryJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-30976", includeResponseMetadata: true }),
    );
    expect(downloadBlackbaudQueryResultWithMetadataMock).toHaveBeenCalledWith(
      sasUri,
      expect.objectContaining({ userId: 7, authUserId: 7 }),
    );
    expect(payload.executionScope).toEqual({
      queryId: "30976",
      reportSnapshotsRead: false,
      reportSnapshotsWritten: false,
      reportCachesRead: false,
      reportCachesWritten: false,
      dashboardUiChanged: false,
      reportConfigurationChanged: false,
    });
    expect(payload.reconciliation).toMatchObject({
      jobRowCount: 2,
      parsedDataRowCount: 2,
      countsAgree: true,
      parsedCountEndpoint: "sas_uri",
    });
    expect(JSON.stringify(payload)).not.toContain("secret.example");
    expect(JSON.stringify(payload)).not.toContain("Ada");
  });

  it("rejects non-administrators before executing Blackbaud work", async () => {
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 8, role: "mgo" },
    });

    const response = await POST(
      new Request("https://app.example.edu/api/admin/alumni-query-diagnostic", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    expect(createBlackbaudQueryJobMock).not.toHaveBeenCalled();
  });

  it("does not expose provider error text or execute a result download after a create failure", async () => {
    const error = new Error("https://secret.example/internal-provider-error");
    error.httpStatus = 429;
    error.topLevelFieldNames = ["message", "status"];
    createBlackbaudQueryJobMock.mockRejectedValue(error);

    const response = await POST(
      new Request("https://app.example.edu/api/admin/alumni-query-diagnostic", {
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.failure).toMatchObject({
      stage: "create_job",
      httpStatus: 429,
      topLevelFieldNames: ["message", "status"],
    });
    expect(JSON.stringify(payload)).not.toContain("secret.example");
    expect(downloadBlackbaudQueryResultWithMetadataMock).not.toHaveBeenCalled();
  });
});
