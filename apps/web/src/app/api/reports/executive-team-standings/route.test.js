import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  getClosedFiscalYearSummaryMock,
  getLifetimeGivingTotalsForWorkspaceUsersMock,
  getCachedReportSnapshotMock,
  getReportCacheHeadersMock,
  getReportRefreshUserMock,
  ensureAppSchemaMock,
  isAuthorizedReportRefreshRequestMock,
  getNxtActionSummaryByWorkspaceUserMock,
  getOrCreateUserMock,
  getReportAccessForUserMock,
  saveReportSnapshotMock,
  shouldBypassReportCacheMock,
  sqlMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getClosedFiscalYearSummaryMock: vi.fn(),
  getLifetimeGivingTotalsForWorkspaceUsersMock: vi.fn(),
  getCachedReportSnapshotMock: vi.fn(),
  getReportCacheHeadersMock: vi.fn((status) => ({ "X-MGOGPT-Report-Cache": status })),
  getReportRefreshUserMock: vi.fn(),
  ensureAppSchemaMock: vi.fn(),
  isAuthorizedReportRefreshRequestMock: vi.fn(),
  getNxtActionSummaryByWorkspaceUserMock: vi.fn(),
  getOrCreateUserMock: vi.fn(),
  getReportAccessForUserMock: vi.fn(),
  saveReportSnapshotMock: vi.fn(),
  shouldBypassReportCacheMock: vi.fn(
    (request) => new URL(request.url).searchParams.get("refresh") === "1",
  ),
  sqlMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/closedFyGiftTotals", () => ({
  getClosedFiscalYearSummary: getClosedFiscalYearSummaryMock,
  getLifetimeGivingTotalsForWorkspaceUsers: getLifetimeGivingTotalsForWorkspaceUsersMock,
}));
vi.mock("@/app/api/utils/nxtActionTotals", () => ({
  getNxtActionSummaryByWorkspaceUser: getNxtActionSummaryByWorkspaceUserMock,
}));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: getOrCreateUserMock }));
vi.mock("@/app/api/utils/reportAccess", () => ({
  EXECUTIVE_TEAM_STANDINGS_REPORT_KEY: "executive-team-standings",
  getReportAccessForUser: getReportAccessForUserMock,
}));
vi.mock("@/app/api/utils/reportCache", () => ({
  getCachedReportSnapshot: getCachedReportSnapshotMock,
  getReportCacheHeaders: getReportCacheHeadersMock,
  saveReportSnapshot: saveReportSnapshotMock,
  shouldBypassReportCache: shouldBypassReportCacheMock,
}));
vi.mock("@/app/api/utils/reportRefresh", () => ({
  getReportRefreshUser: getReportRefreshUserMock,
  isAuthorizedReportRefreshRequest: isAuthorizedReportRefreshRequestMock,
}));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));

describe("Executive Team Standings report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { email: "executive@example.edu" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({ id: 7, role: "executive" });
    getReportAccessForUserMock.mockResolvedValue({ canView: true });
    getReportRefreshUserMock.mockResolvedValue({ id: 99, role: "admin" });
    isAuthorizedReportRefreshRequestMock.mockReturnValue(false);
    getClosedFiscalYearSummaryMock.mockResolvedValue({ closedThisFY: 25000 });
    getLifetimeGivingTotalsForWorkspaceUsersMock.mockResolvedValue(new Map([[8, 380000]]));
    getNxtActionSummaryByWorkspaceUserMock.mockResolvedValue(
      new Map([
        [
          8,
          {
            actionsThisFY: 11,
            highValueActionsThisFY: 4,
            actions: [
              {
                actionId: "bb-action-1",
                date: "2026-08-14",
                category: "Cultivation",
                summary: "Discovery call with donor",
                blackbaudConstituentId: "bb-101",
                constituentName: "Ada Donor",
              },
            ],
          },
        ],
      ]),
    );
    getCachedReportSnapshotMock.mockResolvedValue(null);
    saveReportSnapshotMock.mockResolvedValue();
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

  it("returns team metrics with underlying drilldowns", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(
      new Request("https://jumgogpt.app/api/reports/executive-team-standings?refresh=1"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(saveReportSnapshotMock).toHaveBeenCalledTimes(1);
    expect(payload.standings).toEqual([
      expect.objectContaining({
        userId: 8,
        name: "Morgan Major",
        activeProspects: 12,
        openPipeline: 400000,
        fundedThisFiscalYear: 25000,
        lifetimeGiving: 380000,
        nxtActionsThisFiscalYear: 11,
        highValueActionsThisFiscalYear: 4,
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
          nxtActions: [
            expect.objectContaining({
              actionId: "bb-action-1",
              date: "2026-08-14",
              category: "Cultivation",
              summary: "Discovery call with donor",
              blackbaudConstituentId: "bb-101",
              constituentName: "Ada Donor",
            }),
          ],
        },
      }),
    ]);
  });

  it("saves a clearly marked partial snapshot when no prior snapshot exists", async () => {
    const { GET } = await import("./route.js");
    getLifetimeGivingTotalsForWorkspaceUsersMock.mockResolvedValue(new Map());

    const response = await GET(
      new Request("https://jumgogpt.app/api/reports/executive-team-standings?refresh=1"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.lifetimeCreditUnavailableUserIds).toEqual([8]);
    expect(payload.snapshotStatus).toBe("partial");
    expect(payload.refreshWarning).toContain("unavailable");
    expect(payload.standings[0].lifetimeGiving).toBeNull();
    expect(saveReportSnapshotMock).toHaveBeenCalledWith(
      "report:executive-team-standings:v4-lifetime-gift-feed",
      expect.objectContaining({ snapshotStatus: "partial" }),
    );
  });

  it("preserves a completed snapshot when lifetime solicitor credit is unavailable", async () => {
    const { GET } = await import("./route.js");
    getLifetimeGivingTotalsForWorkspaceUsersMock.mockResolvedValue(new Map());
    getCachedReportSnapshotMock.mockResolvedValueOnce({
      standings: [{ userId: 99, name: "Cached User" }],
      generatedAt: "2026-08-18T12:00:00.000Z",
    });

    const response = await GET(
      new Request("https://jumgogpt.app/api/reports/executive-team-standings?refresh=1"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.snapshotStatus).toBe("stale");
    expect(payload.standings).toEqual([{ userId: 99, name: "Cached User" }]);
    expect(saveReportSnapshotMock).not.toHaveBeenCalled();
  });

  it("returns the cached snapshot when one is available", async () => {
    const { GET } = await import("./route.js");
    getCachedReportSnapshotMock.mockResolvedValueOnce({
      standings: [{ userId: 99, name: "Cached User" }],
      generatedAt: "2026-08-18T12:00:00.000Z",
    });

    const response = await GET(
      new Request("https://jumgogpt.app/api/reports/executive-team-standings"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.standings).toEqual([{ userId: 99, name: "Cached User" }]);
    expect(sqlMock).not.toHaveBeenCalled();
    expect(getLifetimeGivingTotalsForWorkspaceUsersMock).not.toHaveBeenCalled();
    expect(saveReportSnapshotMock).not.toHaveBeenCalled();
  });

  it("does not rebuild standings without an explicit refresh when no snapshot exists", async () => {
    const { GET } = await import("./route.js");

    const response = await GET(
      new Request("https://jumgogpt.app/api/reports/executive-team-standings"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "refresh_required" });
    expect(sqlMock).not.toHaveBeenCalled();
    expect(getNxtActionSummaryByWorkspaceUserMock).not.toHaveBeenCalled();
    expect(saveReportSnapshotMock).not.toHaveBeenCalled();
  });

  it("refuses access when the report is not shared with the current user", async () => {
    const { GET } = await import("./route.js");
    getReportAccessForUserMock.mockResolvedValue({ canView: false });

    const response = await GET();
    expect(response.status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it.each(["actions", "giving"])("keeps the prior snapshot when %s cannot refresh", async (source) => {
    const { GET } = await import("./route.js");
    if (source === "actions") getNxtActionSummaryByWorkspaceUserMock.mockRejectedValue(new Error("429"));
    else getClosedFiscalYearSummaryMock.mockRejectedValue(new Error("Gift feed unavailable"));
    getCachedReportSnapshotMock.mockResolvedValue({ standings: [{ userId: 8, fundedThisFiscalYear: 25000, highValueActionsThisFiscalYear: 4 }] });
    const response = await GET(new Request("https://example.org/api/reports/executive-team-standings?refresh=1"));
    const payload = await response.json();
    expect(payload.snapshotStatus).toBe("stale");
    expect(payload.standings[0].highValueActionsThisFiscalYear).toBe(4);
    expect(saveReportSnapshotMock).not.toHaveBeenCalled();
  });

  it("stores unavailable scoring fields as null, not zero, without a prior snapshot", async () => {
    const { GET } = await import("./route.js");
    getNxtActionSummaryByWorkspaceUserMock.mockRejectedValue(new Error("NXT unavailable"));
    getClosedFiscalYearSummaryMock.mockRejectedValue(new Error("NXT unavailable"));
    const response = await GET(new Request("https://example.org/api/reports/executive-team-standings?refresh=1"));
    const payload = await response.json();
    expect(payload.scoringUnavailableUserIds).toEqual([8]);
    expect(payload.standings[0]).toMatchObject({ fundedThisFiscalYear: null, highValueActionsThisFiscalYear: null, nxtActionsThisFiscalYear: null });
    expect(payload.snapshotStatus).toBe("partial");
    expect(getClosedFiscalYearSummaryMock).toHaveBeenCalledWith(expect.objectContaining({ requireComplete: true }));
  });
});
