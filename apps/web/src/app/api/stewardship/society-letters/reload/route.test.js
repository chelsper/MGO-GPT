// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const origin = "https://www.jumgogpt.app";
const base = `${origin}/api/stewardship/society-letters/reload?expectedDeployment=dpl_new`;
beforeEach(() => vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_new"));
afterEach(() => vi.unstubAllEnvs());
describe("explicit release-pin reset", () => {
  it("works after the platform consumes its reserved routing parameter", async () => {
    const result = await GET(new Request(base));
    expect(result.status).toBe(303);
    expect(result.headers.getSetCookie()).toHaveLength(3);
  });
  it("requires the application validation value, not only the platform parameter", async () => {
    const result = await GET(new Request(base.replace("expectedDeployment", "dpl")));
    expect(result.status).toBe(409);
    expect(result.headers.get("set-cookie")).toBeNull();
  });
  it("expires only version pins and returns to the saved workspace view", async () => {
    const result = await GET(
      new Request(
        base +
          "&returnTo=" +
          encodeURIComponent(
            "/stewardship/society-letters?view=history&dpl=dpl_old#saved",
          ),
        {
          headers: {
            "sec-fetch-site": "same-origin",
            cookie: "__vdpl=dpl_old; authjs.session-token=unchanged",
          },
        },
      ),
    );
    expect(result.status).toBe(303);
    expect(result.headers.get("location")).toBe(
      "/stewardship/society-letters?view=history#saved",
    );
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    const cookies = result.headers.getSetCookie();
    expect(cookies).toHaveLength(3);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/^__vdpl=; Max-Age=0;/);
      expect(cookie).toContain("HttpOnly; Secure; SameSite=Lax");
      expect(cookie).not.toMatch(/authjs|Domain=/);
    }
  });
  it.each([
    "https://other.test/",
    "//other.test/stewardship/society-letters",
    "/api/blackbaud/connect",
    "/stewardship/society-letters/../other",
    "javascript:alert(1)",
  ])("does not redirect to an arbitrary destination: %s", async (returnTo) => {
    const result = await GET(
      new Request(base + "&returnTo=" + encodeURIComponent(returnTo)),
    );
    expect(result.headers.get("location")).toBe("/stewardship/society-letters");
  });
  it.each([
    { origin: "https://other.test" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
  ])("rejects external triggers without clearing cookies", async (headers) => {
    const result = await GET(new Request(base, { headers }));
    expect(result.status).toBe(403);
    expect(result.headers.get("set-cookie")).toBeNull();
  });
  it("does not alter cookies when the requested deployment does not match", async () => {
    const result = await GET(new Request(base.replace("dpl_new", "dpl_old")));
    expect(result.status).toBe(409);
    expect(result.headers.get("set-cookie")).toBeNull();
  });
});
