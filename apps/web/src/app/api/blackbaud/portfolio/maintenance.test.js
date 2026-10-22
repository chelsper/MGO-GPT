import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/reportRefresh", () => ({
  isAuthorizedReportRefreshRequest: request => request.headers.get("authorization") === "Bearer fixture",
  getReportRefreshUser: vi.fn(async () => ({ id: 99, role: "admin" })),
}));
vi.mock("@/app/api/utils/portfolioMaintenanceStore", () => ({ reserveMaintenanceCall: vi.fn() }));
vi.mock("@/app/api/utils/blackbaud", () => ({ getBlackbaudConfigIssues: () => [],
  findBlackbaudConstituentByLookupId: vi.fn(async () => null), findBlackbaudConstituentByEmail: vi.fn(async () => null),
  getBlackbaudConstituentById: vi.fn(async () => null), searchBlackbaudConstituents: vi.fn(async () => []),
  listBlackbaudFundraiserAssignments: vi.fn(),
}));
import sql from "@/app/api/utils/sql";
import { listBlackbaudFundraiserAssignments } from "@/app/api/utils/blackbaud";
import { reserveMaintenanceCall } from "@/app/api/utils/portfolioMaintenanceStore";
import { reserveBlackbaudRead } from "@/app/api/utils/blackbaudReadBudget";
import { GET } from "./route";
const token = "00000000-0000-4000-8000-000000000001";
const request = (origin = "https://example.org", secret = "fixture", query = "workspaceUserId=7&refreshAssignments=1") => new Request(`${origin}/api/blackbaud/portfolio?${query}`, {
  headers: { authorization: `Bearer ${secret}`, "x-mgogpt-portfolio-continuation": token },
});
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("PORTFOLIO_MAINTENANCE_CONTINUATION_ENABLED", "true");
  vi.stubEnv("PORTFOLIO_MAINTENANCE_ORIGIN", "https://example.org");
  sql.mockReset().mockImplementation(async p => p.join(" ").includes("SELECT *") ? [{ id: 7, blackbaud_constituent_id: "123" }] : []);
  reserveMaintenanceCall.mockReset().mockResolvedValue(true);
  listBlackbaudFundraiserAssignments.mockReset().mockImplementation(async () => { await reserveBlackbaudRead("GET"); return []; });
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  ["https://other.example", "fixture", "workspaceUserId=7&refreshAssignments=1"],
  ["https://example.org", "wrong", "workspaceUserId=7&refreshAssignments=1"],
  ["https://example.org", "fixture", "workspaceUserId=7"],
  ["https://example.org", "fixture", "workspaceUserId=bad&refreshAssignments=1"],
])("rejects unscoped membership continuation", async (origin, secret, query) => {
  expect((await GET(request(origin, secret, query))).status).toBe(403);
  expect(sql).not.toHaveBeenCalled();
  expect(listBlackbaudFundraiserAssignments).not.toHaveBeenCalled();
});
it("passes exact membership identity to the shared read budget", async () => {
  expect((await GET(request())).status).toBe(200);
  expect(reserveMaintenanceCall).toHaveBeenCalledWith({ origin: "https://example.org", token, workspaceUserId: "7", constituentId: null });
  expect(listBlackbaudFundraiserAssignments).toHaveBeenCalledOnce();
});
it("cannot persist successful membership when the budget denies provider reads", async () => {
  reserveMaintenanceCall.mockResolvedValue(false);
  const response = await GET(request());
  const payload = await response.json();
  expect(payload.portfolioMeta?.assignmentDataStatus).not.toBe("live");
  expect(sql.mock.calls.map(([s]) => s.join(" ")).join(" ")).not.toContain("blackbaud_portfolio_cached_at = NOW()");
});
