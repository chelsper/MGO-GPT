// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/app/api/utils/dashboardAuth", () => ({ requireDashboardUser: vi.fn() }));
vi.mock("@/app/api/utils/blackbaud", () => ({ blackbaudApiFetch: vi.fn() }));
import { requireDashboardUser } from "@/app/api/utils/dashboardAuth";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";
import { POST } from "./route";
const request = (body = {}) => new Request("https://example.test/api/reports/fundraising-funds", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); requireDashboardUser.mockResolvedValue({ id: 1, role: "admin" }); });
describe("explicit NXT fund picker", () => {
  it("requires authentication and report management permission before contacting NXT", async () => {
    requireDashboardUser.mockRejectedValueOnce(Object.assign(new Error("not signed in"), { status: 401 }));
    expect((await POST(request())).status).toBe(401);
    requireDashboardUser.mockResolvedValue({ id: 1, role: "mgo" });
    expect((await POST(request())).status).toBe(403);
    expect(blackbaudApiFetch).not.toHaveBeenCalled();
  });
  it.each([{ offset: -1 }, { offset: 5 }, { offset: 20500 }, { offset: "500" }, null])("rejects invalid paging %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(blackbaudApiFetch).not.toHaveBeenCalled();
  });
  it("uses one bounded read and returns only fund-picker fields with private no-store headers", async () => {
    blackbaudApiFetch.mockResolvedValue({ value: [{ id: "123", description: "A-Train Campaign", lookup_id: "TRAIN", private: "hidden" }], next_link: "https://api.sky.blackbaud.com/fundraising/v1/funds?offset=500" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toEqual({ funds: [{ id: "123", name: "A-Train Campaign", lookupId: "TRAIN", inactive: false }], nextOffset: 500 });
    expect(blackbaudApiFetch).toHaveBeenCalledExactlyOnceWith("/fundraising/v1/funds", expect.objectContaining({ userId: 1, maxRetries: 0, searchParams: { limit: 500, offset: 0, include_inactive: true } }));
  });
  it("does not expose provider errors", async () => {
    blackbaudApiFetch.mockRejectedValue(new Error("private token"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private token");
  });
});
