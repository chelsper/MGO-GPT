import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  activeRefreshUser: vi.fn(),
  record: vi.fn(),
  snapshot: vi.fn(),
  save: vi.fn(),
  refresh: vi.fn(),
  refreshUser: vi.fn(),
  scheduled: vi.fn(),
}));
vi.mock("@/app/api/utils/dashboardAuth", () => ({
  requireDashboardUser: mocks.user,
  getActiveDashboardRefreshUser: mocks.activeRefreshUser,
}));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/dashboardConfigurations", async (original) => ({
  ...(await original()),
  getDashboardConfiguration: mocks.record,
}));
vi.mock("@/app/api/utils/reportCache", () => ({
  getCachedReportSnapshot: mocks.snapshot,
  getReportCacheHeaders: () => ({ "Cache-Control": "private, no-store" }),
}));
vi.mock("@/app/api/utils/dashboardSnapshots", async (original) => ({
  ...(await original()),
  refreshDashboardSnapshot: mocks.refresh,
  saveDashboardSnapshot: mocks.save,
}));
vi.mock("@/app/api/utils/dashboardQueryCount", () => ({
  DASHBOARD_COUNT_SOURCE: "strict-csv-row-count-v1",
  runDashboardQueryCount: vi.fn(),
}));
vi.mock("@/app/api/utils/reportRefresh", () => ({
  getReportRefreshUser: mocks.refreshUser,
  isAuthorizedReportRefreshRequest: mocks.scheduled,
}));
import { GET, POST } from "./route";

const record = {
  report_key: "demo",
  title: "Demo",
  active: true,
  specific_user_ids: [1],
  data_configuration: { version: 1, panels: [] },
  revision: "1",
};
const request = (search = "") =>
  new Request(`https://example.test/api/reports/dashboards/demo${search}`);
const context = { params: { reportKey: "demo" } };
describe("generic dashboard routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: 1, active: true, role: "mgo" });
    mocks.record.mockResolvedValue(record);
    mocks.snapshot.mockResolvedValue(null);
    mocks.scheduled.mockReturnValue(false);
    mocks.save.mockResolvedValue(true);
    mocks.refresh.mockResolvedValue({
      status: "complete",
      values: [],
      refreshStatus: "pending",
      remainingQueryCount: 1,
      refreshState: { private: true },
    });
  });
  it("GET stays snapshot-only even with refresh=1 or scheduled headers", async () => {
    mocks.scheduled.mockReturnValue(true);
    const response = await GET(request("?refresh=1"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.user).toHaveBeenCalled();
  });
  it("blocks disabled and non-allowlisted public reports including managers", async () => {
    mocks.user.mockResolvedValue({ id: 1, active: true, role: "admin" });
    mocks.record.mockResolvedValue({ ...record, active: false });
    expect((await GET(request(), context)).status).toBe(403);
    expect((await POST(request(), context)).status).toBe(403);
    mocks.record.mockResolvedValue({ ...record, specific_user_ids: [2] });
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it("allows only managers to preview disabled snapshots, never refreshes through preview", async () => {
    mocks.record.mockResolvedValue({ ...record, active: false });
    expect((await GET(request("?preview=1"), context)).status).toBe(403);
    mocks.user.mockResolvedValue({
      id: 1,
      active: true,
      role: "advancement_services",
    });
    const response = await GET(request("?preview=1"), context);
    expect(response.status).toBe(200);
    expect((await response.json()).configuration.canPreview).toBe(true);
    expect((await POST(request("?preview=1"), context)).status).toBe(403);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("POST saves a batch, exposes continuation, and strips internal state", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      refreshStatus: "pending",
      remainingQueryCount: 1,
    });
    expect(payload.snapshot).not.toHaveProperty("refreshState");
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it("does not write after a mid-refresh configuration change or concurrent checkpoint", async () => {
    mocks.record
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, revision: "2" });
    expect((await POST(request(), context)).status).toBe(409);
    expect(mocks.save).not.toHaveBeenCalled();
    mocks.save.mockResolvedValue(false);
    expect((await POST(request(), context)).status).toBe(409);
  });
  it("scheduled refresh requires an active manager and still rejects disabled reports", async () => {
    mocks.scheduled.mockReturnValue(true);
    mocks.refreshUser.mockResolvedValue({ id: 9 });
    mocks.activeRefreshUser.mockResolvedValue({
      id: 9,
      active: true,
      role: "mgo",
    });
    expect((await POST(request(), context)).status).toBe(403);
    mocks.activeRefreshUser.mockResolvedValue({
      id: 9,
      active: true,
      role: "admin",
    });
    expect((await POST(request(), context)).status).toBe(200);
    mocks.record.mockResolvedValue({ ...record, active: false });
    expect((await POST(request(), context)).status).toBe(403);
  });
  it("returns auth failure without reading configurations", async () => {
    mocks.user.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );
    expect((await GET(request(), context)).status).toBe(401);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
