import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
import {
  requireDashboardUser,
  getActiveDashboardRefreshUser,
} from "./dashboardAuth";
import { getDueDashboardRefreshTargets } from "./dashboardScheduler";

describe("dashboard session and scheduler guards", () => {
  beforeEach(() => vi.clearAllMocks());
  it("requires an active authenticated user, without an admin fallback", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(requireDashboardUser()).rejects.toMatchObject({ status: 401 });
    const session = { user: { email: "member@example.test" } };
    mocks.auth.mockResolvedValue(session);
    mocks.user.mockResolvedValue({ id: 1, active: false });
    await expect(requireDashboardUser()).rejects.toMatchObject({ status: 403 });
    mocks.user.mockResolvedValue({ id: 1, active: true, role: "mgo" });
    await expect(requireDashboardUser()).resolves.toMatchObject({ id: 1 });
    expect(mocks.user).toHaveBeenLastCalledWith(session);
  });
  it("reloads active state for scheduled users", async () => {
    expect(await getActiveDashboardRefreshUser(null)).toBeNull();
    mocks.sql.mockResolvedValue([]);
    expect(await getActiveDashboardRefreshUser({ id: 2 })).toBeNull();
    expect(mocks.sql.mock.calls[0][0].join(" ")).toMatch(/active = TRUE/);
  });
  it("only schedules active dashboards with active allowlisted users, due or unfinished", async () => {
    mocks.sql.mockResolvedValue([{ report_key: "demo" }]);
    expect(await getDueDashboardRefreshTargets()).toEqual([
      { key: "demo", path: "/api/reports/dashboards/demo", method: "POST" },
    ]);
    const query = mocks.sql.mock.calls[0][0].join(" ");
    expect(query).toContain("rc.active = TRUE");
    expect(query).toContain("users.active = TRUE");
    expect(query).toContain("specific_user_ids @>");
    expect(query).toContain("'pending'");
    expect(query).toContain("INTERVAL '24 hours'");
  });
});
