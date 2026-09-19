import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  portfolio: vi.fn(),
  giving: vi.fn(),
  profile: vi.fn(),
  totals: vi.fn(),
  opportunities: vi.fn(),
}));
vi.mock("@/app/api/blackbaud/portfolio/route", () => ({
  GET: mocks.portfolio,
}));
vi.mock("@/app/api/blackbaud/current-fy-giving/route", () => ({
  GET: mocks.giving,
}));
vi.mock(
  "@/app/api/blackbaud/constituents/[constituentId]/summary/route",
  () => ({ GET: mocks.profile }),
);
vi.mock("@/app/api/utils/closedFyGiftTotals", () => ({
  getClosedFiscalYearSummary: mocks.totals,
}));
vi.mock("@/app/api/utils/reportGiftOpportunities", () => ({
  getReportGiftOpportunities: mocks.opportunities,
}));
import {
  advancePortfolioReportJob,
  newPortfolioReportJob,
  pausePortfolioReportJob,
} from "./portfolioGivingReportRefresh";
const period = {
  yearLabel: "FY27",
  startDate: "2026-07-01",
  endDate: "2026-09-19",
};
const workspaceUser = {
  id: 7,
  name: "Example Fundraiser",
  blackbaud_constituent_id: "700",
};
const request = new Request(
  "https://example.test/api/reports/portfolio-giving",
  { headers: { cookie: "session=synthetic" } },
);
const context = (job) => ({ job, request, workspaceUser, authUserId: 8 });
const giving = (ids) => ({
  period,
  byConstituentId: Object.fromEntries(
    ids.map((id) => [id, { directGifts: [] }]),
  ),
  acknowledgmentCredits: [],
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.portfolio.mockResolvedValue(
    Response.json({
      leadSolicitor: [{ constituentId: "1" }],
      supportingSolicitor: [],
      portfolioMeta: { assignmentDataStatus: "live" },
    }),
  );
  mocks.giving.mockImplementation(async (req) =>
    Response.json(
      giving(new URL(req.url).searchParams.get("constituentIds").split(",")),
    ),
  );
  mocks.totals.mockResolvedValue({
    currentFY: "FY27",
    closedThisFY: 0,
    closedPriorFY: 0,
  });
  mocks.opportunities.mockResolvedValue({});
  mocks.profile.mockImplementation(async (_, { params }) =>
    Response.json({
      constituentId: params.constituentId,
      mapped: {
        constituent: {
          name: `Person ${params.constituentId}`,
          constituencyCodesVerified: true,
          constituencies: [],
        },
      },
    }),
  );
});
describe("bounded portfolio report refresh", () => {
  it("publishes only after assignment, giving, and strict total checks complete", async () => {
    let job = newPortfolioReportJob(period);
    let result = await advancePortfolioReportJob(context(job));
    expect(result.snapshot).toBeNull();
    expect(job.stage).toBe("giving");
    result = await advancePortfolioReportJob(context(job));
    expect(result.snapshot).toBeNull();
    expect(job.stage).toBe("totals");
    result = await advancePortfolioReportJob(context(job));
    expect(result.job.status).toBe("complete");
    expect(result.snapshot.hardCreditTotals.received).toBe(0);
    expect(mocks.totals).toHaveBeenCalledWith(
      expect.objectContaining({ requireComplete: true, authUserId: 8 }),
    );
  });
  it("checks at most five constituents in a request and checkpoints its offset", async () => {
    const job = {
      ...newPortfolioReportJob(period),
      stage: "giving",
      people: Array.from({ length: 11 }, (_, n) => ({
        constituentId: String(n + 1),
      })),
    };
    await advancePortfolioReportJob(context(job));
    expect(job.givingOffset).toBe(5);
    expect(mocks.giving).toHaveBeenCalledTimes(1);
    const req = mocks.giving.mock.calls[0][0];
    expect(new URL(req.url).searchParams.get("portfolio_refresh")).toBe("1");
    expect(req.headers.get("cookie")).toBe("session=synthetic");
    await advancePortfolioReportJob(context(job));
    expect(job.givingOffset).toBe(10);
    expect(
      new URL(mocks.giving.mock.calls[1][0].url).searchParams.get(
        "constituentIds",
      ),
    ).toBe("6,7,8,9,10");
  });
  it("checks at most four donor identities, never using a full summary", async () => {
    const job = {
      ...newPortfolioReportJob(period),
      stage: "profiles",
      profileIds: ["1", "2", "3", "4", "5"],
    };
    await advancePortfolioReportJob(context(job));
    expect(job.profileOffset).toBe(4);
    expect(mocks.profile).toHaveBeenCalledTimes(4);
    expect(
      new URL(mocks.profile.mock.calls[0][0].url).searchParams.get("refresh"),
    ).toBe("1");
    expect(
      new URL(mocks.profile.mock.calls[0][0].url).searchParams.get(
        "report_profile",
      ),
    ).toBe("true");
  });
  it.each([undefined, "partial", "unavailable"])(
    "does not treat unverified portfolio assignments as an empty report: %s",
    (status) => {
      mocks.portfolio.mockResolvedValue(
        Response.json({
          leadSolicitor: [],
          portfolioMeta: { assignmentDataStatus: status },
        }),
      );
      return expect(
        advancePortfolioReportJob(context(newPortfolioReportJob(period))),
      ).rejects.toThrow(/verified NXT assignment/);
    },
  );
  it.each([
    { ...giving(["1"]), byConstituentId: {} },
    { ...giving(["1"]), acknowledgmentCredits: null },
    { ...giving(["1"]), warnings: { 1: "Gift response failed" } },
    { ...giving(["1"]), period: { ...period, endDate: "2026-09-20" } },
  ])("rejects incomplete or mixed-date giving payloads", async (payload) => {
    mocks.giving.mockResolvedValue(Response.json(payload));
    await expect(
      advancePortfolioReportJob(
        context({
          ...newPortfolioReportJob(period),
          stage: "giving",
          people: [{ constituentId: "1" }],
        }),
      ),
    ).rejects.toThrow();
  });
  it("retains a missing-fund label warning without discarding verified financial data", async () => {
    mocks.giving.mockResolvedValue(
      Response.json({
        ...giving(["1"]),
        warnings: {
          funds:
            "Some fund descriptions are unavailable; giving totals are unchanged.",
        },
      }),
    );
    const job = {
      ...newPortfolioReportJob(period),
      stage: "giving",
      people: [{ constituentId: "1" }],
    };
    await advancePortfolioReportJob(context(job));
    expect(job.warnings).toHaveLength(1);
    expect(job.stage).toBe("totals");
  });
  it("deduplicates soft credits and loads identities once across giving batches", async () => {
    const credit = {
      giftId: "gift",
      recipientConstituentId: "3",
      hardCreditConstituentId: "4",
      giftSolicitors: [{ id: "700" }],
      amount: 100,
    };
    mocks.giving.mockImplementation(async (req) =>
      Response.json({
        ...giving(
          new URL(req.url).searchParams.get("constituentIds").split(","),
        ),
        acknowledgmentCredits: [credit],
      }),
    );
    const job = {
      ...newPortfolioReportJob(period),
      stage: "giving",
      people: ["1", "2", "3", "4", "5", "6"].map((constituentId) => ({
        constituentId,
      })),
    };
    await advancePortfolioReportJob(context(job));
    await advancePortfolioReportJob(context(job));
    expect(Object.keys(job.credits)).toHaveLength(1);
    expect(job.profileIds).toEqual(["4", "3"]);
  });
  it("persists a retry checkpoint for throttling without publishing a report", async () => {
    mocks.giving.mockResolvedValue(
      Response.json(
        { retryAfterMs: 120_000, quotaPaused: true },
        { status: 503 },
      ),
    );
    const job = {
      ...newPortfolioReportJob(period),
      stage: "giving",
      people: [{ constituentId: "1" }],
    };
    const error = await advancePortfolioReportJob(context(job)).catch((e) => e);
    const paused = pausePortfolioReportJob(job, error);
    expect(paused.status).toBe("paused");
    expect(paused.givingOffset).toBe(0);
    expect(new Date(paused.retryAt).getTime()).toBeGreaterThan(
      Date.now() + 119_000,
    );
  });
  it("saves open opportunity options separately from live link eligibility checks", async () => {
    const job = {
      ...newPortfolioReportJob(period),
      stage: "opportunities",
      profileIds: ["1"],
    };
    mocks.opportunities.mockResolvedValue({
      1: [{ id: "op1", status: "Cultivation" }],
    });
    await advancePortfolioReportJob(context(job));
    expect(job.opportunities[1][0].id).toBe("op1");
    expect(job.stage).toBe("totals");
  });
  it("does not publish after unverified donor codes or failed commitment reads", async () => {
    mocks.profile.mockResolvedValue(
      Response.json({
        mapped: {
          constituent: { name: "Person", constituencyCodesVerified: false },
        },
      }),
    );
    await expect(
      advancePortfolioReportJob(
        context({
          ...newPortfolioReportJob(period),
          stage: "profiles",
          profileIds: ["1"],
        }),
      ),
    ).rejects.toThrow(/codes/);
    mocks.totals.mockRejectedValue(new Error("provider unavailable"));
    await expect(
      advancePortfolioReportJob(
        context({ ...newPortfolioReportJob(period), stage: "totals" }),
      ),
    ).rejects.toThrow(/unavailable/);
  });
  it("refuses a profile resolved to a different constituent", async () => {
    mocks.profile.mockResolvedValue(
      Response.json({
        constituentId: "999",
        mapped: {
          constituent: {
            name: "Different donor",
            constituencyCodesVerified: true,
          },
        },
      }),
    );
    await expect(
      advancePortfolioReportJob(
        context({
          ...newPortfolioReportJob(period),
          stage: "profiles",
          profileIds: ["1"],
        }),
      ),
    ).rejects.toThrow(/verified/);
  });
});
