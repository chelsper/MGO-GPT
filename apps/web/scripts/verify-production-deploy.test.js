// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { verifyStaleSession } from "./verify-production-deploy.mjs";

const current = { commitSha: "a".repeat(40), deploymentId: "dpl_current" };
const old = { commitSha: "b".repeat(40), deploymentId: "dpl_old" };
const response = (body) => ({ ok: true, json: async () => body });

describe("existing-session release verification", () => {
  it("detects a stale session even when explicit latest-version routing works", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(old))
      .mockResolvedValueOnce(response(current));
    expect(
      await verifyStaleSession("https://ju.test", current, "dpl_old", fetcher),
    ).toMatchObject({
      existingSessionCurrent: false,
      explicitLatestRoutingWorks: true,
      pinnedDeployment: "dpl_old",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0].origin).toBe("https://ju.test");
    expect(fetcher.mock.calls[0][0].search).toBe("");
    expect(fetcher.mock.calls[1][0].searchParams.get("dpl")).toBe(
      "dpl_current",
    );
    for (const [, options] of fetcher.mock.calls) {
      expect(options).toMatchObject({
        redirect: "error",
        cache: "no-store",
        headers: { accept: "application/json", cookie: "__vdpl=dpl_old" },
      });
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(Object.keys(options.headers)).toEqual(["accept", "cookie"]);
    }
  });
  it("accepts a retired pin only when both requests reach the current deployment", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(current));
    expect(
      await verifyStaleSession("https://ju.test", current, "dpl_old", fetcher),
    ).toMatchObject({
      existingSessionCurrent: true,
      explicitLatestRoutingWorks: true,
    });
  });
  it("detects a broken explicit version route", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(old));
    expect(
      await verifyStaleSession("https://ju.test", current, "dpl_old", fetcher),
    ).toMatchObject({ explicitLatestRoutingWorks: false });
  });
  it.each([
    "",
    "dpl_old; token=secret",
    "https://outside.test",
    "dpl_a\r\nsecret: value",
  ])("rejects invalid pins before any request: %j", async (pin) => {
    const fetcher = vi.fn();
    await expect(
      verifyStaleSession("https://ju.test", current, pin, fetcher),
    ).rejects.toThrow("valid previous and current");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not retry a failed network request", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(
      verifyStaleSession("https://ju.test", current, "dpl_old", fetcher),
    ).rejects.toThrow("503");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
