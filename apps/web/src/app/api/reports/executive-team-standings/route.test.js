import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  getClosedFiscalYearSummaryMock,
  ensureAppSchemaMock,
  getOrCreateUserMock,
  getReportAccessForUserMock,
  sqlMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getClosedFiscalYearSummaryMock: vi.fn(),
  ensureAppSchemaMock: vi.fn(),
  getOrCreateUserMock: vi.fn(),
  getReportAccessForUserMock: vi.fn(),
  sqlMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/closedFyGiftTotals", () => ({
  getClosedFiscalYearSummary: getClosedFiscalYearSummaryMock,
}));
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
    getClosedFiscalYearSummaryMock.mockResolvedValue({ closedThisFY: 25000 });
    sqlMock
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce([
        {
          user_id: "8",
          prospect_id: "101",
          prospect_name: "Ada Donor",
          blackbaud_constituent_id: "bb-101",
          next_action_text: "Schedule visit",
          next_action_due_date: "2026-08-12",
          next_action_completed_at: null,
          updated_at: "2026-08-10T12:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          user_id: "8",
          opportunity_id: "501",
          prospect_id: "101",
          prospect_name: "Ada Donor",
          blackbaud_constituent_id: "bb-101",
          title: "Leadership Gift",
          current_stage: "Cultivation",
          estimated_amount: "125000",
          expected_date: "2026-11-15",
          close_date: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          user_id: "8",
          prospects_touched: "4",
          updates_logged: "3",
          opportunity_changes: "2",
          recently_closed_value: "50000",
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
    const response = await GET(new Request("https://jumgogpt.app/api/reports/executive-team-standings"));
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
        trend: {
          windowDays: 7,
          prospectsTouched: 4,
          updatesLogged: 3,
          opportunityChanges: 2,
          recentlyClosedValue: 50000,
        },
        drilldown: {
          activeProspects: [
            expect.objectContaining({
              prospectId: 101,
              prospectName: "Ada Donor",
              blackbaudConstituentId: "bb-101",
              nextActionText: "Schedule visit",
              hasOpenNextStep: true,
              isOverdue: true,
            }),
          ],
          openOpportunities: [
            expect.objectContaining({
              opportunityId: 501,
              prospectId: 101,
              prospectName: "Ada Donor",
              title: "Leadership Gift",
              currentStage: "Cultivation",
              estimatedAmount: 125000,
            }),
          ],
        },
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
