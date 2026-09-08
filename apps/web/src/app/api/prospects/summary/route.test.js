import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

const { auth, workspace, sql, readSnapshot, blackbaud, oldSummary } = vi.hoisted(() => ({
  auth: vi.fn(), workspace: vi.fn(), sql: vi.fn(), readSnapshot: vi.fn(), blackbaud: vi.fn(), oldSummary: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: workspace }));
vi.mock("@/app/api/utils/sql", () => ({ default: sql }));
vi.mock("@/app/api/utils/blackbaud", () => ({
  getBlackbaudConstituentById: blackbaud, getBlackbaudFundraiserById: blackbaud, listBlackbaudGifts: blackbaud,
}));
vi.mock("@/app/api/utils/closedFyGiftTotals", () => ({ getClosedFiscalYearSummary: oldSummary }));
vi.mock("@/app/api/utils/reportCache", async (importOriginal) => ({
  ...await importOriginal(), getCachedReportSnapshotWithMetadata: readSnapshot,
}));

const { GET } = await import("./route");
const request = (query = "") => new Request(`https://example.com/api/prospects/summary${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T21:00:00Z"));
  auth.mockResolvedValue({ user: { email: "mgo@example.com" } });
  workspace.mockResolvedValue({ workspaceUser: { id: 8, role: "mgo" }, sessionUser: { id: 8 }, isActing: false });
  sql.mockResolvedValue([{ active_count: "21", total_pipeline: "2548000" }]);
  const comparison = getStandingsPeriods(new Date("2026-09-07T22:00:00Z"));
  readSnapshot.mockResolvedValue({ updatedAt: "2026-09-07T22:01:04Z", payload: {
    fiscalYear: comparison.fiscalYear, comparison,
    standings: [
      { userId: 8, fundedThisFiscalYear: 4030000, priorYearToDate: { raised: 179900 } },
      { userId: 1, fundedThisFiscalYear: 500, name: "Private team member" },
    ],
  } });
  blackbaud.mockRejectedValue(new Error("Normal card must not call NXT"));
  oldSummary.mockResolvedValue({ closedThisFY: 4000000, closedPriorFY: 590593.12 });
});
afterEach(() => { vi.useRealTimers(); });

describe("My Prospects summary", () => {
  it("returns the leaderboard amounts without modifying local portfolio counts or running NXT", async () => {
    const response = await GET(request());
    expect(await response.json()).toMatchObject({
      activeCount: 21, totalAskPipeline: 2548000,
      currentFY: "FY27", closedThisFY: 4030000, priorFY: "FY26", closedPriorFY: 179900,
      raisedSnapshot: { source: "team_standings", asOf: "2026-09-07" },
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(blackbaud).not.toHaveBeenCalled();
    expect(oldSummary).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledTimes(1);
    expect(sql.mock.calls[0][1]).toBe(8);
  });

  it("returns only the authorized workspace's totals when viewing as another MGO", async () => {
    workspace.mockResolvedValue({ workspaceUser: { id: 8 }, sessionUser: { id: 1, role: "admin" }, isActing: true });
    const payload = await (await GET(request("?userId=1"))).json();
    expect(payload.closedThisFY).toBe(4030000);
    expect(JSON.stringify(payload)).not.toContain("Private team member");
    expect(payload).not.toHaveProperty("standings");
  });

  it("does not accept a different workspace through query parameters", async () => {
    expect((await (await GET(request("?userId=1&workspaceUserId=1"))).json()).closedThisFY).toBe(4030000);
  });

  it("lets the base counts load without reading the standings snapshot", async () => {
    const payload = await (await GET(request("?includeClosed=0"))).json();
    expect(payload).toMatchObject({ activeCount: 21, totalAskPipeline: 2548000, closedThisFY: null });
    expect(readSnapshot).not.toHaveBeenCalled();
    expect(blackbaud).not.toHaveBeenCalled();
  });

  it("does not fall back to an independent full-year total when no snapshot exists", async () => {
    readSnapshot.mockResolvedValue(null);
    const payload = await (await GET(request())).json();
    expect(payload).toMatchObject({ closedThisFY: null, closedPriorFY: null, raisedSnapshot: { reason: "missing_snapshot" } });
    expect(oldSummary).not.toHaveBeenCalled();
    expect(blackbaud).not.toHaveBeenCalled();
  });

  it("propagates a snapshot read error instead of returning a fabricated zero", async () => {
    readSnapshot.mockRejectedValue(new Error("Database unavailable"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty("closedThisFY");
    expect(blackbaud).not.toHaveBeenCalled();
  });

  it("requires authentication before reading totals", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(readSnapshot).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });
});
