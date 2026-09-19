// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  workspace: vi.fn(),
  access: vi.fn(),
  read: vi.fn(),
  claim: vi.fn(),
  checkpoint: vi.fn(),
  advance: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: m.workspace }));
vi.mock("@/app/api/utils/reportAccess", () => ({
  getReportAccessForUser: m.access,
  PORTFOLIO_GIVING_REPORT_KEY: "portfolio-fy-giving",
}));
vi.mock(
  "@/app/api/utils/portfolioGivingReportStore",
  async (importOriginal) => ({
    ...(await importOriginal()),
    readPortfolioReport: m.read,
    claimPortfolioReport: m.claim,
    checkpointPortfolioReport: m.checkpoint,
  }),
);
vi.mock("@/app/api/utils/sql", () => ({
  default: vi.fn(() => {
    throw new Error("Unexpected database query");
  }),
}));
vi.mock("@/app/api/utils/portfolioGivingReportRefresh", () => ({
  newPortfolioReportJob: (period) => ({
    id: "new-job",
    period,
    stage: "portfolio",
    status: "pending",
  }),
  advancePortfolioReportJob: m.advance,
  pausePortfolioReportJob: (job, error) => ({
    ...job,
    status: "paused",
    message: error.message,
  }),
}));
import { GET, POST } from "./route";
import { getCurrentFiscalYearWindow } from "@/app/api/utils/currentFyGiving";
const user = {
  id: 7,
  name: "Example Fundraiser",
  active: true,
  blackbaud_constituent_id: "700",
};
const req = (body = { action: "start" }, headers = {}) =>
  new Request(
    "https://example.test/api/reports/portfolio-giving?workspaceUserId=999",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
  );
let saved;
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ user: { email: "operator@example.test" } });
  m.workspace.mockResolvedValue({ workspaceUser: user, sessionUser: user });
  m.access.mockResolvedValue({ canView: true });
  saved = {
    snapshot: {
      workspaceUserId: 7,
      generatedAt: "2026-09-18",
      hardCreditTotals: { received: 150 },
    },
    job: null,
  };
  m.read.mockImplementation(async () => structuredClone(saved));
  m.claim.mockImplementation(async (_, old, next) => ({
    ...next,
    revision: "lease",
    leaseUntil: Date.now() + 360_000,
  }));
  m.advance.mockImplementation(async ({ job }) => ({
    job: { ...job, stage: "giving" },
    snapshot: null,
  }));
  m.checkpoint.mockImplementation(async (_, claimed, job, snapshot) => {
    saved.job = { ...job, leaseUntil: 0 };
    if (snapshot) saved.snapshot = snapshot;
    return true;
  });
});
describe("saved portfolio giving endpoint", () => {
  it("GET only reads saved data even when refresh or another workspace is requested", async () => {
    const response = await GET(
      new Request(
        "https://example.test/api/reports/portfolio-giving?refresh=1&workspaceUserId=999",
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).snapshot.hardCreditTotals.received).toBe(
      150,
    );
    expect(m.read.mock.calls[0][0].snapshot).toContain(":7:");
    expect(m.advance).not.toHaveBeenCalled();
    expect(m.claim).not.toHaveBeenCalled();
  });
  it("returns an explicit empty state, never fabricated zeros", async () => {
    saved.snapshot = null;
    expect(
      (
        await (
          await GET(
            new Request("https://example.test/api/reports/portfolio-giving"),
          )
        ).json()
      ).snapshot,
    ).toBeNull();
    expect(m.advance).not.toHaveBeenCalled();
  });
  it.each([GET, POST])("rejects signed-out requests", async (method) => {
    m.auth.mockResolvedValue(null);
    expect((await method(req())).status).toBe(401);
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([
    { workspaceUser: { ...user, active: false }, sessionUser: user },
    { workspaceUser: user, sessionUser: { ...user, active: false } },
    { workspaceUser: user, sessionUser: user, invalidActingUserId: 8 },
  ])("rejects inactive and invalid acting workspaces", async (context) => {
    m.workspace.mockResolvedValue(context);
    expect((await GET(req())).status).toBe(403);
    expect(m.read).not.toHaveBeenCalled();
  });
  it("checks report access before returning a saved report or refreshing", async () => {
    m.access.mockResolvedValue({ canView: false });
    expect((await GET(req())).status).toBe(403);
    expect((await POST(req())).status).toBe(403);
    expect(m.advance).not.toHaveBeenCalled();
  });
  it("does not accept a cross-site refresh", async () => {
    expect(
      (await POST(req(undefined, { origin: "https://unrelated.test" }))).status,
    ).toBe(403);
    expect(m.advance).not.toHaveBeenCalled();
  });
  it("starts one bounded refresh phase and ignores client totals/workspace IDs", async () => {
    const response = await POST(
      req({
        action: "start",
        workspaceUserId: 999,
        hardCreditTotals: { received: 1000000 },
      }),
    );
    expect(response.status).toBe(200);
    expect(m.advance).toHaveBeenCalledTimes(1);
    expect(m.advance.mock.calls[0][0].workspaceUser.id).toBe(7);
    expect((await response.json()).snapshot.hardCreditTotals.received).toBe(
      150,
    );
    expect(m.checkpoint.mock.calls[0][3]).toBeNull();
  });
  it.each([
    { leaseUntil: Date.now() + 360_000 },
    { retryAt: new Date(Date.now() + 360_000).toISOString() },
  ])("honors active leases and provider retry delays", async (state) => {
    saved.job = { id: "old-job", status: "pending", ...state };
    expect((await POST(req())).status).toBe(200);
    expect(m.advance).not.toHaveBeenCalled();
  });
  it("cannot restart a completed or superseded job with a continuation", async () => {
    saved.job = { id: "current", status: "complete" };
    await POST(req({ action: "continue", jobId: "current" }));
    saved.job.status = "pending";
    await POST(req({ action: "continue", jobId: "old" }));
    expect(m.claim).not.toHaveBeenCalled();
  });
  it("does not duplicate work when another request wins the lease", async () => {
    m.claim.mockResolvedValue(null);
    await POST(req());
    expect(m.advance).not.toHaveBeenCalled();
  });
  it("retains the previous complete snapshot on a failed provider call", async () => {
    m.advance.mockRejectedValue(new Error("Provider failed"));
    const payload = await (await POST(req())).json();
    expect(payload.snapshot.hardCreditTotals.received).toBe(150);
    expect(payload.refresh.status).toBe("paused");
    expect(m.checkpoint.mock.calls[0][3]).toBeUndefined();
  });
  it("refuses to publish if fundraiser identity or access changes during a refresh", async () => {
    m.workspace
      .mockResolvedValueOnce({ workspaceUser: user, sessionUser: user })
      .mockResolvedValue({
        workspaceUser: { ...user, blackbaud_constituent_id: "999" },
        sessionUser: user,
      });
    m.advance.mockResolvedValue({
      job: { status: "complete" },
      snapshot: { hardCreditTotals: { received: 500 } },
    });
    await POST(req());
    expect(m.checkpoint.mock.calls[0][3]).toBeUndefined();
    expect(saved.snapshot.hardCreditTotals.received).toBe(150);
  });
  it("starts fresh inputs when a previous checkpoint belongs to another day", async () => {
    saved.job = {
      id: "yesterday",
      status: "pending",
      period: { ...getCurrentFiscalYearWindow(), endDate: "2000-01-01" },
    };
    await POST(req());
    expect(m.advance.mock.calls[0][0].job.id).toBe("new-job");
  });
  it("resumes the same checkpoint after a pause, without starting from constituent one", async () => {
    saved.job = {
      id: "resume",
      status: "paused",
      period: getCurrentFiscalYearWindow(),
      givingOffset: 50,
      stage: "giving",
    };
    await POST(req());
    expect(m.advance.mock.calls[0][0].job.givingOffset).toBe(50);
  });
});
