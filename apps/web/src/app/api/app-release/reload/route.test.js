import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const path = "/reports/dashboards/fy-revenue-goals?fy=2027#pledges";
const headers = { "content-type": "application/json", "x-ju-release-reset": "1", origin: "https://app.test", "sec-fetch-site": "same-origin" };
function request(body = { expectedDeployment: "dpl_new", returnTo: path }, overrides = {}) {
  return new Request("https://app.test/api/app-release/reload", { method: "POST", headers: { ...headers, ...overrides }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
beforeEach(() => vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_new"));
afterEach(() => vi.unstubAllEnvs());
describe("explicit app release reset", () => {
  it("only deletes host-only version cookies, retaining authentication and same-view routing", async () => {
    const result = await route.POST(request());
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ deploymentId: "dpl_new", returnTo: path });
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    const cookies = result.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(10);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/^__vdpl=; Max-Age=0; Path=\/[a-z/-]*; HttpOnly; Secure; SameSite=Lax$/);
      expect(cookie).not.toMatch(/Domain=|auth|session/i);
    }
    expect(cookies.some(cookie => cookie.includes("Path=/reports/dashboards/fy-revenue-goals;"))).toBe(true);
    expect(result.headers.get("location")).toBeNull();
    expect(route.GET).toBeUndefined();
  });
  it.each([
    { origin: "https://evil.test" }, { "sec-fetch-site": "cross-site" },
    { "content-type": "text/plain" }, { "x-ju-release-reset": "" },
  ])("rejects cross-origin or implicit resets: %j", async overrides => {
    const result = await route.POST(request(undefined, overrides));
    expect(result.status).toBe(403);
    expect(result.headers.get("set-cookie")).toBeNull();
  });
  it.each([
    [{ expectedDeployment: "dpl_old", returnTo: path }, 409],
    [{ expectedDeployment: "dpl_new", returnTo: "//evil.test" }, 400],
    [{ expectedDeployment: "dpl_new", returnTo: "/api/users" }, 400],
    [{ expectedDeployment: "dpl_new", returnTo: path, extra: true }, 400],
    ["{", 400], ["x".repeat(8193), 413], [null, 400],
  ])("refuses invalid, oversized or stale requests without changing cookies", async (body, status) => {
    const result = await route.POST(request(body));
    expect(result.status).toBe(status);
    expect(result.headers.get("set-cookie")).toBeNull();
  });
});
