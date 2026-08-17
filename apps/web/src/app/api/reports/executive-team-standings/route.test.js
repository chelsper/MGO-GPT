import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  ensureAppSchemaMock,
  getOrCreateUserMock,
  getReportAccessForUserMock,
  sqlMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  ensureAppSchemaMock: vi.fn(),
  getOrCreateUserMock: vi.fn(),
  getReportAccessForUserMock: vi.fn(),
  sqlMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: getOrCreateUserMock }));
vi.mock("@/app/api/utils/reportAccess", () => ({
  EXECUTIVE_TEAM_STANDINGS_REPORT_KEY: "executive-team-standings",
  getReportAccessForUser: getReportAccessForUserMock,
}));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));

describe("Executive Team Standings report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { email: "executive@example.edu" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({ id: 7, role: "executive" });
    getReportAccessForUserMock.mockResolvedValue({ canView: true });
    sqlMock.mockResolvedValue([
      {
        user_id: "8",
        name: "Morgan Major",
        email: "morgan@example.edu",
        active_prospects: "12",
        prospects_with_next_steps: "8",
        overdue_next_steps: "2",
        open_pipeline: "400000",
        funded_this_fiscal_year: "25000",
      },
    ]);
  });

  it("uses the July to June fiscal-year window", async () => {
    const { getFiscalYearWindow } = await import("./route.js");
    expect(getFiscalYearWindow(new Date("2026-08-17T12:00:00Z"))).toEqual({
      label: "FY27",
      startsOn: "2026-07-01",
      endsOn: "2027-06-30",
    });
  });

  it("returns local team metrics without a Blackbaud request", async () => {
    const { GET } = await import("./route.js");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.standings).toEqual([
      expect.objectContaining({
        userId: 8,
        name: "Morgan Major",
        activeProspects: 12,
        openPipeline: 400000,
        fundedThisFiscalYear: 25000,
        prospectsWithNextSteps: 8,
        overdueNextSteps: 2,
      }),
    ]);
  });

  it("refuses access when the report is not shared with the current user", async () => {
    const { GET } = await import("./route.js");
    getReportAccessForUserMock.mockResolvedValue({ canView: false });

    const response = await GET();
    expect(response.status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
