import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ schema: vi.fn(), user: vi.fn(), definitions: vi.fn(), advance: vi.fn() }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/reportRefresh", () => ({ getReportRefreshUser: mocks.user }));
vi.mock("@/app/api/utils/givingSocietyConfigurations", () => ({ listGivingSocietyConfigurations: mocks.definitions }));
vi.mock("@/app/api/utils/societyGivingSource", () => ({ advanceSocietyGivingSource: mocks.advance }));
import { GET } from "./route";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  mocks.user.mockResolvedValue({ id: 1, role: "Admin, Advancement_Services" });
  mocks.definitions.mockResolvedValue([]);
  mocks.advance.mockResolvedValue({ status: "processing", calls: 5 });
});
const request = (key = "test-secret") => new Request("https://example.com/api/internal/society-giving-refresh", { headers: { authorization: `Bearer ${key}` } });
describe("society background refresh authorization", () => {
  it("does not initialize storage or read NXT without the cron secret", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(mocks.schema).not.toHaveBeenCalled(); expect(mocks.advance).not.toHaveBeenCalled();
  });
  it("requires an organization-level refresh account, even if another user is pinned", async () => {
    mocks.user.mockResolvedValue({ id: 4, role: "mgo" });
    expect((await GET(request())).status).toBe(503);
    expect(mocks.advance).not.toHaveBeenCalled();
  });
  it("passes only the authorized connection to the bounded worker", async () => {
    expect(await (await GET(request())).json()).toEqual({ status: "processing", calls: 5 });
    expect(mocks.advance).toHaveBeenCalledWith({ authUserId: 1, origin: "https://example.com", societyDefinitions: [] });
  });
});
