// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), create: vi.fn(), job: vi.fn(), download: vi.fn(), config: vi.fn(),
  sql: vi.fn(), snapshot: vi.fn(), cache: vi.fn(),
}));
vi.mock("@/app/api/utils/dashboardAuth", () => ({ requireDashboardUser: mocks.user }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/reportCache", () => ({
  getCachedReportSnapshot: mocks.cache,
  saveReportSnapshot: mocks.snapshot,
  shouldBypassReportCache: vi.fn(),
  getReportCacheHeaders: () => ({ "Cache-Control": "private, no-store" }),
}));
vi.mock("@/app/api/utils/blackbaud", async (importOriginal) => ({
  ...await importOriginal(),
  createBlackbaudQueryJob: mocks.create,
  getBlackbaudQueryJob: mocks.job,
  downloadBlackbaudQueryResultWithMetadata: mocks.download,
  getBlackbaudConfigIssues: mocks.config,
}));
import * as route from "./route";
import { QUERY_RESULTS_LIMITS } from "@/app/api/utils/dashboardConfiguration";
import { BlackbaudQueryResultTooLargeError } from "@/app/api/utils/blackbaud";

const request = (body = { queryId: "30971" }) => new Request(
  "https://example.test/api/reports/dashboards/test-query-results",
  { method: "POST", body: JSON.stringify(body) },
);

describe("manager-only query result tests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: 7, active: true, role: "advancement_services" });
    mocks.config.mockReturnValue([]);
    mocks.create.mockResolvedValue({ id: "job" });
    mocks.job.mockResolvedValue({ status: "Completed", row_count: 9999, sas_uri: "https://private.example/signed.csv?token=secret" });
    mocks.download.mockResolvedValue({
      contentType: "text/csv; charset=utf-8",
      body: new TextEncoder().encode('ID,Amount,Description\n0001,$0.00,"Quoted, value"\n'),
      resultUrl: "https://private.example/signed.csv?token=secret",
    });
    for (const method of ["error", "warn", "log"]) vi.spyOn(console, method).mockImplementation(() => {});
  });
  afterEach(() => {
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it.each(["admin", "advancement_services"])("lets %s explicitly test 30971 without writing a cache or returning URLs", async (role) => {
    mocks.user.mockResolvedValue({ id: 7, active: true, role });
    const response = await route.POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const payload = await response.json();
    expect(payload).toEqual({
      queryId: "30971",
      headers: ["ID", "Amount", "Description"],
      rows: [["0001", "$0.00", "Quoted, value"]],
      dataSource: "query-results-csv-v1",
      queryJobRowCount: 9999,
      testedAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(payload.testedAt))).toBe(false);
    expect(JSON.stringify(payload)).not.toMatch(/https:|token|secret|signed/);
    expect(mocks.create).toHaveBeenCalledWith({ userId: 7, authUserId: 7, origin: "https://example.test", queryId: "30971" });
    expect(mocks.download).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxBytes: QUERY_RESULTS_LIMITS.bytes }));
  });

  it("accepts numeric query IDs and returns their string representation", async () => {
    expect(await (await route.POST(request({ queryId: 30971 }))).json()).toMatchObject({ queryId: "30971" });
  });

  it("does not expose a GET executor or infer query IDs from URL parameters", async () => {
    expect(route.GET).toBeUndefined();
    const response = await route.POST(new Request("https://example.test/api/reports/dashboards/test-query-results?queryId=30971", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([null, {}, [], { queryId: null }, { queryId: "" }, { queryId: "0" }, { queryId: "1.5" }, { queryId: {} }, { queryId: [] }, { queryId: true }, { queryId: "https://private.example" }])
    ("requires an explicit valid queryId in the JSON POST body: %s", async (body) => {
      const response = await route.POST(request(body));
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(mocks.create).not.toHaveBeenCalled();
    });

  it("rejects malformed JSON before execution", async () => {
    const response = await route.POST(new Request("https://example.test/api/reports/dashboards/test-query-results", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["mgo", "executive", "donor", "", undefined])("rejects a non-manager role before reading the body: %s", async (role) => {
    mocks.user.mockResolvedValue({ id: 7, active: true, role });
    const json = vi.fn();
    expect((await route.POST({ json })).status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([401, 403, 500])("sanitizes auth errors and preserves auth status %s", async (status) => {
    mocks.user.mockRejectedValue(Object.assign(new Error("donor token https://private.example"), { status }));
    const response = await route.POST(request());
    expect(response.status).toBe(status === 500 ? 502 : status);
    expect(JSON.stringify(await response.json())).not.toMatch(/donor|token|https:|private/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns a header-only table without manufacturing values", async () => {
    mocks.download.mockResolvedValue({ contentType: "text/csv", body: new TextEncoder().encode("ID,Amount\n") });
    expect(await (await route.POST(request())).json()).toMatchObject({ headers: ["ID", "Amount"], rows: [] });
  });

  it("returns actionable byte-limit errors without a partial table", async () => {
    mocks.download.mockRejectedValue(new BlackbaudQueryResultTooLargeError(QUERY_RESULTS_LIMITS.bytes));
    const response = await route.POST(request());
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: expect.stringMatching(/524288 bytes.*Narrow.*No results were truncated/) });
  });

  it("returns actionable row-limit errors without a partial table", async () => {
    mocks.download.mockResolvedValue({ contentType: "text/csv", body: new TextEncoder().encode("ID\n" + "0\n".repeat(1001)) });
    const response = await route.POST(request());
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: expect.stringMatching(/1000 rows.*Narrow/) });
  });

  it("sanitizes provider errors, ignoring a provider-supplied auth status", async () => {
    mocks.create.mockRejectedValue(Object.assign(new Error("donor token https://private.example"), { status: 401 }));
    const response = await route.POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Could not retrieve the saved query results. No report snapshot was changed." });
  });

  it("never returns malformed CSV content in parse errors", async () => {
    mocks.download.mockResolvedValue({ contentType: "text/csv", body: new TextEncoder().encode('ID,Name\n1,"donor token https://private.example') });
    const response = await route.POST(request());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toMatch(/donor|token|https:|private/);
  });
});
