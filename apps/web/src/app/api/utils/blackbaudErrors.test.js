import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn(async strings =>
  strings.join("").includes("FROM blackbaud_connections") ? [{ access_token: "test-token" }] : []) }));
import { blackbaudApiFetch } from "./blackbaud";

const path = "/constituent/v1/constituents/100/givingsummary/latest";
const options = { authUserId: 1, origin: "https://example.org", maxRetries: 0 };
const noGifts = { error_name: "ConstituentDoesNotHaveGifts", error_code: 404,
  message: "The given constituent does not have any gifts.", raw_message: "provider detail", error_args: ["private"] };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("BLACKBAUD_SUBSCRIPTION_KEY", "test-subscription");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("preserves the named no-gifts error without converting transport errors to success", async () => {
  fetch.mockResolvedValue(Response.json([noGifts], { status: 404, statusText: "Not Found" }));
  const error = await blackbaudApiFetch(path, options).catch(error => error);
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ httpStatus: 404, blackbaudErrorName: "ConstituentDoesNotHaveGifts", blackbaudErrorCode: 404 });
  expect(error.message).toBe(`Blackbaud 404 Not Found: ${JSON.stringify([noGifts])}`);
  expect(error).not.toHaveProperty("raw_message");
  expect(error).not.toHaveProperty("error_args");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
  [],
  [noGifts, { error_name: "ConstituentNotFound", error_code: 404 }],
  [noGifts, null],
  [{ ...noGifts, error_code: "404" }],
  [{ ...noGifts, error_name: "not a structured identifier" }],
  [{ ...noGifts, error_name: "A".repeat(101) }],
  [{ message: noGifts.message }],
  [null],
  noGifts,
].map(payload => ({ payload })))("does not attach a trusted single error identifier to ambiguous/malformed payloads: $payload", async ({ payload }) => {
  fetch.mockResolvedValue(Response.json(payload, { status: 404 }));
  const error = await blackbaudApiFetch(path, options).catch(error => error);
  expect(error).toBeInstanceOf(Error);
  expect(error.httpStatus).toBe(404);
  expect(error).not.toHaveProperty("blackbaudErrorName");
  expect(error).not.toHaveProperty("blackbaudErrorCode");
});

it("leaves generic HTML not-found failures unclassified", async () => {
  fetch.mockResolvedValue(new Response("<h1>Not found</h1>", { status: 404 }));
  await expect(blackbaudApiFetch(path, options)).rejects.toMatchObject({ httpStatus: 404 });
});

it("does not turn an error identifier into a different HTTP status", async () => {
  fetch.mockResolvedValue(Response.json([noGifts], { status: 403 }));
  await expect(blackbaudApiFetch(path, options)).rejects.toMatchObject({ httpStatus: 403, blackbaudErrorName: "ConstituentDoesNotHaveGifts" });
});

it("leaves normal latest-gift responses unchanged", async () => {
  const gift = { id: "g1", date: "2026-09-01", amount: { value: 250 } };
  fetch.mockResolvedValue(Response.json(gift));
  await expect(blackbaudApiFetch(path, options)).resolves.toEqual(gift);
});
