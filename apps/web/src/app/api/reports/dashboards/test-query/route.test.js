import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  create: vi.fn(),
  job: vi.fn(),
  download: vi.fn(),
  config: vi.fn(),
  sql: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock("@/app/api/utils/dashboardAuth", () => ({
  requireDashboardUser: mocks.user,
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/reportCache", () => ({
  getCachedReportSnapshot: vi.fn(),
  saveReportSnapshot: mocks.snapshot,
  shouldBypassReportCache: vi.fn(),
  getReportCacheHeaders: () => ({ "Cache-Control": "private, no-store" }),
}));
vi.mock("@/app/api/utils/blackbaud", () => ({
  createBlackbaudQueryJob: mocks.create,
  getBlackbaudQueryJob: mocks.job,
  downloadBlackbaudQueryResult: mocks.download,
  getBlackbaudConfigIssues: mocks.config,
}));
import { POST } from "./route";
const request = (queryId = "123") =>
  new Request("https://example.test/api/reports/dashboards/test-query", {
    method: "POST",
    body: JSON.stringify({ queryId }),
  });

describe("manager saved query test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({
      id: 1,
      active: true,
      role: "advancement_services",
    });
    mocks.config.mockReturnValue([]);
    mocks.create.mockResolvedValue({ id: "job" });
    mocks.job.mockResolvedValue({
      status: "Completed",
      row_count: 9999,
      sas_uri: "https://secret.example/signed.csv",
    });
    mocks.download.mockResolvedValue(
      'ID,Name\n1,"Quoted, Name"\n1,"Another\nName"\n',
    );
  });
  it("reuses saved-query CSV row counts, not metadata, and never writes a snapshot", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      count: 2,
      value: 2,
      queryId: "123",
      queryJobRowCount: 9999,
    });
    expect(payload.testedAt).toBeTruthy();
    expect(mocks.create).toHaveBeenCalledWith({
      userId: 1,
      authUserId: 1,
      origin: "https://example.test",
      queryId: "123",
    });
    expect(JSON.stringify(payload)).not.toMatch(/secret|Quoted|signed|Another/);
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("accepts a header-only CSV as zero", async () => {
    mocks.download.mockResolvedValue("ID,Name\n");
    expect(await (await POST(request())).json()).toMatchObject({ count: 0 });
  });
  it.each([
    "",
    '{"row_count":999}',
    "<html>URL</html>",
    'ID,Name\n1,"unterminated',
    "ID,Name\n1,Name,Unexpected",
  ])(
    "rejects failed parse without persisting or exposing content: %s",
    async (csv) => {
      mocks.download.mockResolvedValue(csv);
      const response = await POST(request());
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error:
          "Could not count the saved query. No report snapshot was changed.",
      });
      expect(mocks.snapshot).not.toHaveBeenCalled();
    },
  );
  it("sanitizes provider failures containing signed URLs", async () => {
    mocks.create.mockRejectedValue(
      new Error("https://secret.example/token donor"),
    );
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toMatch(
      /secret|token|donor/,
    );
  });
  it.each([null, "", "0", "1.5", "abc", [], {}, true])(
    "rejects invalid IDs before execution: %s",
    async (id) => {
      expect((await POST(request(id))).status).toBe(400);
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
  it("rejects viewers and unauthenticated users before execution", async () => {
    mocks.user.mockResolvedValue({ id: 1, active: true, role: "mgo" });
    expect((await POST(request())).status).toBe(403);
    mocks.user.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );
    expect((await POST(request())).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
