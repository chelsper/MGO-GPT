// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { recoverLetterRelease } from "./letterReleaseRecovery";

const current = {
  environment: "production",
  commitSha: "a".repeat(40),
  deploymentId: "dpl_current",
};
const old = { ...current, commitSha: "b".repeat(40), deploymentId: "dpl_old" };
const path = "/stewardship/society-letters?view=history#saved";
const receipt = { deploymentId: current.deploymentId, returnTo: path };
const respond = (value) => ({ ok: true, json: async () => value });
function fixture(values = [current, receipt, current]) {
  const fetcher = vi.fn();
  values.forEach((value) => fetcher.mockResolvedValueOnce(respond(value)));
  return fetcher;
}

describe("recovery from a pinned older letter release", () => {
  it("uses an explicit fetch header to reset the pin, then verifies normal credentialed routing", async () => {
    let pinned = true;
    const fetcher = vi.fn(async (url, options) => {
      if (url === "/api/version")
        return respond(
          options.credentials === "omit" || !pinned ? current : old,
        );
      // Reproduce the old-cookie precedence that a top-level ?dpl= missed.
      if (options.headers?.["x-deployment-id"] !== current.deploymentId)
        return { ok: false, status: 409 };
      expect(options.credentials).toBe("same-origin");
      expect(options.headers.accept).toBe("application/json");
      const target = new URL(url, "https://ju.test");
      expect(target.searchParams.get("expectedDeployment")).toBe(
        current.deploymentId,
      );
      expect(target.searchParams.get("returnTo")).toBe(path);
      pinned = false;
      return respond(receipt);
    });
    const controller = new AbortController();
    expect(
      await recoverLetterRelease(path, { fetcher, signal: controller.signal }),
    ).toBe(path);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2]).toEqual([
      "/api/version",
      expect.objectContaining({ credentials: "same-origin" }),
    ]);
    expect(fetcher.mock.calls[2][1].headers).toBeUndefined();
    for (const [, options] of fetcher.mock.calls) {
      expect(options.method).toBeUndefined();
      expect(options).toMatchObject({
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
    }
  });
  it("removes old routing parameters but preserves the workspace view", async () => {
    const fetcher = fixture();
    expect(
      await recoverLetterRelease(path.replace("#saved", "&dpl=dpl_old#saved"), {
        fetcher,
      }),
    ).toBe(path);
  });
  it.each([
    "https://other.test/stewardship/society-letters",
    "//other.test/stewardship/society-letters",
    "/api/blackbaud/connect",
    "javascript:alert(1)",
  ])("never uses an arbitrary return destination: %s", async (destination) => {
    const fetcher = fixture();
    await expect(
      recoverLetterRelease(destination, { fetcher }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    [{ ...current, environment: "preview" }, receipt, current],
    [{ ...current, deploymentId: "https://other.test" }, receipt, current],
    [{ ...current, commitSha: "invalid" }, receipt, current],
    [current, { ...receipt, deploymentId: old.deploymentId }, current],
    [current, { ...receipt, returnTo: "https://other.test" }, current],
    [current, receipt, old],
    [current, receipt, { ...current, commitSha: old.commitSha }],
  ])(
    "does not return a navigation when release verification fails: %j",
    async (...values) => {
      await expect(
        recoverLetterRelease(path, { fetcher: fixture(values) }),
      ).rejects.toThrow();
    },
  );
  it.each([0, 1, 2])(
    "stops on a failed request at stage %i without retrying",
    async (stage) => {
      const values = [current, receipt, current];
      let index = 0;
      const fetcher = vi.fn(async () =>
        index++ === stage
          ? { ok: false, status: 503 }
          : respond(values[index - 1]),
      );
      await expect(recoverLetterRelease(path, { fetcher })).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(stage + 1);
    },
  );
  it("does not return a navigation after cancellation", async () => {
    const controller = new AbortController();
    const fetcher = fixture();
    controller.abort();
    await expect(
      recoverLetterRelease(path, { fetcher, signal: controller.signal }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
