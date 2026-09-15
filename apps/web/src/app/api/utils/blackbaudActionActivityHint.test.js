import { afterEach, beforeEach, expect, it, vi } from "vitest";
const hint = vi.hoisted(() => vi.fn());
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn(async strings => strings.join("").includes("FROM blackbaud_connections") ? [{ access_token: "test-token" }] : []) }));
vi.mock("./portfolioActivityStore", () => ({ requestPortfolioActionRefresh: hint }));
import { createBlackbaudAction } from "./blackbaud";
const options = { userId: 7, authUserId: 99, origin: "https://example.org", payload: { constituent_id: "100", date: "2026-09-15" } };
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("BLACKBAUD_SUBSCRIPTION_KEY", "test-subscription");
  hint.mockReset().mockResolvedValue();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("requests a background check only after a confirmed action creation", async () => {
  fetch.mockResolvedValue(Response.json({ id: "a" }));
  expect(await createBlackbaudAction(options)).toEqual({ id: "a" });
  expect(hint).toHaveBeenCalledWith({ origin: options.origin, constituentId: "100" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].method).toBe("POST");
});
it("does not request a check for a failed or unconfirmed creation", async () => {
  fetch.mockResolvedValueOnce(Response.json({ message: "bad input" }, { status: 400 }));
  await expect(createBlackbaudAction(options)).rejects.toThrow();
  fetch.mockResolvedValueOnce(Response.json({}));
  await createBlackbaudAction(options);
  expect(hint).not.toHaveBeenCalled();
});
it("never turns a successful NXT write into a user retry because the hint failed", async () => {
  fetch.mockResolvedValue(Response.json({ id: "a" }));
  hint.mockRejectedValue(new Error("temporary database outage"));
  expect(await createBlackbaudAction(options)).toEqual({ id: "a" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
