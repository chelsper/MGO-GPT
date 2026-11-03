import { afterEach, expect, it, vi } from "vitest";
import { appReleaseCheck } from "./app-release-check";
afterEach(() => vi.unstubAllEnvs());
it("returns only public version metadata for an explicit document-path probe", async () => {
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "b".repeat(40));
  vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_new");
  const result = appReleaseCheck(new Request("https://app.test/stewardship/requests?mine=1", { headers: { "x-ju-release-check": "1" } }));
  expect(await result.json()).toMatchObject({ commitSha: "b".repeat(40), deploymentId: "dpl_new" });
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(result.headers.get("vary")).toBe("x-ju-release-check");
  expect(result.headers.get("set-cookie")).toBeNull();
});
it.each(["/api/users/profile", "/api/auth/session", "/account/logout", "/unknown"])("does not intercept protected or unknown routes: %s", path => {
  expect(appReleaseCheck(new Request(`https://app.test${path}`, { headers: { "x-ju-release-check": "1" } }))).toBeNull();
});
it("does not intercept normal document loads or writes", () => {
  expect(appReleaseCheck(new Request("https://app.test/stewardship/requests"))).toBeNull();
  expect(appReleaseCheck(new Request("https://app.test/stewardship/requests", { method: "POST", headers: { "x-ju-release-check": "1" } }))).toBeNull();
});
