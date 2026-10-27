import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/portfolioOpportunityContext", () => ({ checkPortfolioOpportunityScope: vi.fn(), findPortfolioProspect: vi.fn(), readPortfolioOpportunities: vi.fn() }));
import { auth } from "@/auth";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { checkPortfolioOpportunityScope, findPortfolioProspect, readPortfolioOpportunities } from "@/app/api/utils/portfolioOpportunityContext";
import { GET } from "./route";
const context = { sessionUser: { id: 2, name: "Admin" }, workspaceUser: { id: 44, name: "MGO" } };
const request = () => new Request("https://example.com/api/portfolio-opportunities?viewerId=2&workspaceId=44&constituentId=100");
beforeEach(() => {
  vi.resetAllMocks(); auth.mockResolvedValue({ user: { email: "admin@example.com" } }); getWorkspaceUser.mockResolvedValue(context);
  findPortfolioProspect.mockResolvedValue({ id: 7 }); readPortfolioOpportunities.mockResolvedValue({ opportunities: [{ id: 8 }], truncated: false });
});
it("returns saved opportunities with authoritative identity and no-store", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ viewerId: 2, workspaceId: 44, constituentId: "100", prospectId: 7, ownerName: "MGO", opportunities: [{ id: 8 }] });
  expect(checkPortfolioOpportunityScope).toHaveBeenCalledWith(context, { viewerId: "2", workspaceId: "44", constituentId: "100" });
  expect(readPortfolioOpportunities).toHaveBeenCalledExactlyOnceWith(44, "100");
});
it("requires login", async () => {
  auth.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
  expect(findPortfolioProspect).not.toHaveBeenCalled();
});
it("fails closed on scope errors before returning donor details", async () => {
  checkPortfolioOpportunityScope.mockRejectedValue(Object.assign(new Error("Read-only"), { portfolioPreflight: true, status: 403 }));
  const response = await GET(request());
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "Read-only" });
  expect(readPortfolioOpportunities).not.toHaveBeenCalled();
});
it("does not misreport unavailable saved data as an empty opportunity list", async () => {
  readPortfolioOpportunities.mockRejectedValue(new Error("private database detail"));
  const response = await GET(request());
  expect(response.status).toBe(500);
  const data = await response.json();
  expect(data).not.toHaveProperty("opportunities");
  expect(data.error).not.toContain("private database detail");
});
