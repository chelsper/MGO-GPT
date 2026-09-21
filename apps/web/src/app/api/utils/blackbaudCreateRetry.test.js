import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("./ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("./sql", () => ({ default: vi.fn(async parts => parts.join("").includes("FROM blackbaud_connections") ? [{ access_token: "test" }] : []) }));
vi.mock("./portfolioActivityStore", () => ({ requestPortfolioActionRefresh: vi.fn() }));
import { blackbaudApiFetch, createBlackbaudAction, createBlackbaudOpportunity } from "./blackbaud";
const credentials = { userId: 7, origin: "https://example.org" };
beforeEach(() => { vi.stubEnv("BLACKBAUD_SUBSCRIPTION_KEY", "test"); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each([createBlackbaudAction, createBlackbaudOpportunity])("never retries a create after a server error", async create => {
  fetch.mockResolvedValue(Response.json({ message: "upstream response lost" }, { status: 503 }));
  await expect(create({ ...credentials, payload: { constituent_id: "1" }, maxRetries: 9 })).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(["POST", "post"])("never retries a %s timeout even with an explicit retry override", async method => {
  fetch.mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
  await expect(blackbaudApiFetch("/test", { ...credentials, method, maxRetries: 9 })).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("keeps bounded retries for reads", async () => {
  fetch.mockResolvedValueOnce(Response.json({}, { status: 503 })).mockResolvedValueOnce(Response.json({ id: "1" }));
  expect(await blackbaudApiFetch("/test", { ...credentials, method: "GET", maxRetries: 1 })).toEqual({ id: "1" });
  expect(fetch).toHaveBeenCalledTimes(2);
});
