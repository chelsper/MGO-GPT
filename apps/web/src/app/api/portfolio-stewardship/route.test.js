import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/portfolioStewardship", () => ({ checkPortfolioStewardshipScope: vi.fn(), readPortfolioStewardship: vi.fn() }));
import { auth } from "@/auth";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { checkPortfolioStewardshipScope, readPortfolioStewardship } from "@/app/api/utils/portfolioStewardship";
import * as route from "./route";
const context = { sessionUser: { id: 2 }, workspaceUser: { id: 44, name: "Selected MGO" } };
const request = () => new Request("https://example.com/api/portfolio-stewardship?viewerId=2&workspaceId=44&constituentId=100");
beforeEach(() => {
  vi.resetAllMocks(); auth.mockResolvedValue({ user: { email: "admin@example.com" } }); getWorkspaceUser.mockResolvedValue(context);
  readPortfolioStewardship.mockResolvedValue({ requests: [], receivedItems: [], followUps: [] });
});
it("is GET-only and returns scoped saved data without caching", async () => {
  expect(Object.keys(route)).toEqual(["GET"]);
  const response = await route.GET(request());
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ viewerId: "2", workspaceId: "44", constituentId: "100", ownerName: "Selected MGO", requests: [] });
  expect(checkPortfolioStewardshipScope).toHaveBeenCalledExactlyOnceWith(context, { viewerId: "2", workspaceId: "44", constituentId: "100" });
  expect(readPortfolioStewardship).toHaveBeenCalledExactlyOnceWith(context, "100");
});
it("requires a session before accessing workspace or saved data", async () => {
  auth.mockResolvedValue(null);
  expect((await route.GET(request())).status).toBe(401);
  expect(getWorkspaceUser).not.toHaveBeenCalled(); expect(readPortfolioStewardship).not.toHaveBeenCalled();
});
it("fails closed on a scope mismatch", async () => {
  checkPortfolioStewardshipScope.mockRejectedValue(Object.assign(new Error("Workspace changed"), { stewardshipScope: true, status: 409 }));
  const response = await route.GET(request());
  expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: "Workspace changed" });
  expect(readPortfolioStewardship).not.toHaveBeenCalled();
});
it("does not expose database errors or report unavailable history as empty", async () => {
  readPortfolioStewardship.mockRejectedValue(new Error("private database detail"));
  const response = await route.GET(request());
  expect(response.status).toBe(500);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const data = await response.json(); expect(data).not.toHaveProperty("requests"); expect(data.error).not.toContain("private");
});
