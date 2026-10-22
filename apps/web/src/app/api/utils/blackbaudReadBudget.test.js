import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { withBlackbaudReadBudget, reserveBlackbaudRead, hasBlackbaudReadBudget } from "./blackbaudReadBudget";
vi.mock("./ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("./sql", () => ({ default: vi.fn(async parts => parts.join("").includes("FROM blackbaud_connections") ? [{ access_token: "test" }] : []) }));
import { blackbaudApiFetch } from "./blackbaud";
const options = { userId: 7, origin: "https://example.org", maxRetries: 5 };
beforeEach(() => { vi.stubEnv("BLACKBAUD_SUBSCRIPTION_KEY", "test"); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("does not affect requests outside a maintenance context", async () => {
  expect(hasBlackbaudReadBudget()).toBe(false);
  await expect(reserveBlackbaudRead("POST")).resolves.toBeUndefined();
});
it("caps parallel reservations and stops after the first denied reservation", async () => {
  let calls = 0;
  const reserve = vi.fn(async () => ++calls <= 2);
  const results = await withBlackbaudReadBudget(reserve, () => Promise.allSettled(
    Array.from({ length: 6 }, () => reserveBlackbaudRead("GET")),
  ));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(2);
  expect(reserve).toHaveBeenCalledTimes(3);
  expect(hasBlackbaudReadBudget()).toBe(false);
});
it("keeps simultaneous requests' budgets isolated", async () => {
  const results = await Promise.allSettled([
    withBlackbaudReadBudget(async () => false, () => reserveBlackbaudRead("GET")),
    withBlackbaudReadBudget(async () => true, () => reserveBlackbaudRead("GET")),
  ]);
  expect(results.map(r => r.status)).toEqual(["rejected", "fulfilled"]);
});
it.each([false, "database unavailable"])("fails closed before a provider call: %s", async result => {
  const reserve = async () => { if (result) throw Error(result); return false; };
  await expect(withBlackbaudReadBudget(reserve, () => blackbaudApiFetch("/test", options))).rejects.toMatchObject({ quotaPaused: true, httpStatus: 429 });
  expect(fetch).not.toHaveBeenCalled();
});
it("never retries budgeted reads after an upstream failure", async () => {
  const reserve = vi.fn(async () => true);
  fetch.mockResolvedValue(Response.json({}, { status: 503 }));
  await expect(withBlackbaudReadBudget(reserve, () => blackbaudApiFetch("/test", options))).rejects.toThrow();
  expect(fetch).toHaveBeenCalledOnce();
  expect(reserve).toHaveBeenCalledOnce();
});
it("prevents any NXT write inside background continuation", async () => {
  const reserve = vi.fn(async () => true);
  await expect(withBlackbaudReadBudget(reserve, () => blackbaudApiFetch("/test", { ...options, method: "POST", body: {} }))).rejects.toMatchObject({ quotaPaused: true });
  expect(fetch).not.toHaveBeenCalled();
  expect(reserve).not.toHaveBeenCalled();
});
