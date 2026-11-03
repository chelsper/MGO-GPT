import { describe, expect, it, vi } from "vitest";
import { appReleasePath, recoverAppRelease, releaseCookiePaths } from "./appRelease";

const path = "/reports/dashboards/fy-revenue-goals?fy=2027#pledges";
const version = { environment: "production", commitSha: "b".repeat(40), deploymentId: "dpl_new" };
const response = value => ({ ok: true, json: async () => value });
function fetcher() {
  return vi.fn(async url => response(url === "/api/app-release/reload"
    ? { deploymentId: version.deploymentId, returnTo: path } : version));
}

describe("app version recovery", () => {
  it("preserves a workspace, filters and anchor, removing only an explicit version pin", () => {
    expect(appReleasePath(path.replace("?fy=", "?dpl=dpl_old&fy="))).toBe(path);
    expect(appReleasePath("/action-opportunity-update?returnTo=%2Fmy-top-prospects"))
      .toBe("/action-opportunity-update?returnTo=%2Fmy-top-prospects");
  });
  it.each(["//other.test", "https://other.test", "/api/users", "/account/logout", "/unknown", "/\\other.test", "/%0a", "/reports/../api/users"])("rejects unsafe or non-workspace destinations: %s", value => {
    expect(appReleasePath(value)).toBe("");
  });
  it("clears framework pin scopes including all current page ancestors", () => {
    const paths = releaseCookiePaths(path);
    expect(paths).toEqual(expect.arrayContaining(["/", "/api", "/reports", "/reports/dashboards", "/reports/dashboards/fy-revenue-goals", "/stewardship"]));
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.some(value => /[?#;]/.test(value))).toBe(false);
  });
  it("forces only the reset to latest and verifies unforced API AND document routing", async () => {
    const fetch = fetcher();
    const beforeReset = vi.fn();
    expect(await recoverAppRelease(path, { fetcher: fetch, beforeReset })).toBe(path);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/version", "/api/app-release/reload", "/api/version", path.split("#")[0],
    ]);
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "omit", redirect: "error", cache: "no-store" });
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: "POST", credentials: "same-origin",
      headers: { "x-deployment-id": "dpl_new", "x-ju-release-reset": "1", "Content-Type": "application/json" },
      body: JSON.stringify({ expectedDeployment: "dpl_new", returnTo: path }),
    });
    expect(fetch.mock.calls[2][1].headers).toBeUndefined();
    expect(fetch.mock.calls[3][1].headers).toEqual({ "x-ju-release-check": "1" });
    expect(beforeReset).toHaveBeenCalledTimes(2);
  });
  it.each([0, 1, 2, 3])("stops without retry when request %i fails", async failure => {
    const fetch = fetcher();
    let call = 0;
    fetch.mockImplementation(async url => call++ === failure ? { ok: false } : response(
      url === "/api/app-release/reload" ? { deploymentId: "dpl_new", returnTo: path } : version,
    ));
    await expect(recoverAppRelease(path, { fetcher: fetch })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(failure + 1);
  });
  it("rejects a stale page even when the API is current", async () => {
    const fetch = fetcher();
    fetch.mockImplementation(async url => response(url === "/api/app-release/reload"
      ? { deploymentId: "dpl_new", returnTo: path }
      : url.startsWith("/reports") ? { ...version, deploymentId: "dpl_old" } : version));
    await expect(recoverAppRelease(path, { fetcher: fetch })).rejects.toThrow("older release");
  });
  it("rejects unexpected reset receipts and invalid public metadata", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ ...version, environment: "preview" }));
    await expect(recoverAppRelease(path, { fetcher: fetch })).rejects.toThrow("metadata");
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockReset().mockResolvedValueOnce(response(version)).mockResolvedValue(response({ deploymentId: "dpl_other", returnTo: path }));
    await expect(recoverAppRelease(path, { fetcher: fetch })).rejects.toThrow("not confirmed");
  });
  it("does not clear pins if a save begins after discovery", async () => {
    const fetch = fetcher();
    await expect(recoverAppRelease(path, { fetcher: fetch, beforeReset: () => { throw new Error("Saving"); } })).rejects.toThrow("Saving");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("honors cancellation before and during recovery", async () => {
    const controller = new AbortController();
    const fetch = fetcher();
    controller.abort();
    await expect(recoverAppRelease(path, { fetcher: fetch, signal: controller.signal })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    const during = new AbortController();
    fetch.mockImplementation(async () => { during.abort(); return response(version); });
    await expect(recoverAppRelease(path, { fetcher: fetch, signal: during.signal })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
