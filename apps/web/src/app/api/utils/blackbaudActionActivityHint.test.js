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
it("does not request an extra latest-activity pull for a new planned action", async () => {
  fetch.mockResolvedValue(Response.json({ id: "planned" }));
  await createBlackbaudAction({ ...options, payload: { ...options.payload, completed: false } });
  expect(hint).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("never turns a successful NXT write into a user retry because the hint failed", async () => {
  fetch.mockResolvedValue(Response.json({ id: "a" }));
  hint.mockRejectedValue(new Error("temporary database outage"));
  expect(await createBlackbaudAction(options)).toEqual({ id: "a" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(["timeout", "server error"])("does not retry an ambiguous %s when the caller disables create retries", async kind => {
  if (kind === "timeout") fetch.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
  else fetch.mockResolvedValue(Response.json({ message: "temporary error" }, { status: 503 }));
  await expect(createBlackbaudAction({ ...options, maxRetries: 0 })).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(hint).not.toHaveBeenCalled();
});
