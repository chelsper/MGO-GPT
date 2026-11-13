import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("./ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("./sql", () => ({ default: vi.fn(async parts => parts.join("").includes("FROM blackbaud_connections") ? [{ access_token: "test" }] : []) }));
vi.mock("./portfolioActivityStore", () => ({ requestPortfolioActionRefresh: vi.fn() }));
import { blackbaudApiFetch, createBlackbaudAction, createBlackbaudOpportunity } from "./blackbaud";
import { withBlackbaudReadBudget } from "./blackbaudReadBudget";
const credentials = { userId: 7, origin: "https://example.org" };
beforeEach(() => { vi.stubEnv("BLACKBAUD_SUBSCRIPTION_KEY", "test"); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
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

it.each(["GET", "get", "POST", "PATCH", "PUT", "DELETE", "HEAD"])("marks only a verified GET deadline as safely deferrable (%s)", async method => {
  vi.useFakeTimers();
  fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  const result = blackbaudApiFetch("/test", { ...credentials, method, timeoutMs: 1000, maxRetries: 0 }).catch(error => error);
  await vi.advanceTimersByTimeAsync(1000);
  const error = await result;
  expect(error.message).toBe("Blackbaud request timed out");
  if (method.toUpperCase() === "GET") {
    expect(error).toMatchObject({ code: "BLACKBAUD_READ_TIMEOUT", readRetryable: true });
  } else {
    expect(error.code).toBeUndefined();
    expect(error.readRetryable).toBeUndefined();
  }
  expect(error.httpStatus).toBeUndefined();
  expect(fetch).toHaveBeenCalledOnce();
});

it.each(["timeout from an unknown source", "aborted by another source"])("does not infer deferral permission from text: %s", async message => {
  fetch.mockRejectedValue(new Error(message));
  const error = await blackbaudApiFetch("/test", { ...credentials, maxRetries: 0 }).catch(error => error);
  expect(error.readRetryable).toBeUndefined();
  expect(error.code).toBeUndefined();
  expect(fetch).toHaveBeenCalledOnce();
});

it("reserves one background call and does not immediately replay a timed-out read", async () => {
  vi.useFakeTimers();
  const reserve = vi.fn(async () => true);
  fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  const result = withBlackbaudReadBudget(reserve, () => blackbaudApiFetch("/test", {
    ...credentials, maxRetries: 9,
  })).catch(error => error);
  await vi.advanceTimersByTimeAsync(8000);
  expect(await result).toMatchObject({ code: "BLACKBAUD_READ_TIMEOUT", readRetryable: true });
  expect(fetch).toHaveBeenCalledOnce();
  expect(reserve).toHaveBeenCalledOnce();
});
