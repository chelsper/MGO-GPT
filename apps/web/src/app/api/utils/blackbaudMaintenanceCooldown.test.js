import { afterEach, expect, it, vi } from "vitest";
vi.mock("./ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("./sql", () => ({ default: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); vi.resetModules(); });
it.each([false, true])("persists a shared budgeted 429 pause without retrying or shortening an existing pause: %s", async longer => {
  vi.resetModules();
  vi.stubEnv("BLACKBAUD_SUBSCRIPTION_KEY", "test");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const { default: sql } = await import("./sql");
  sql.mockReset().mockImplementation(async parts => {
    const query = parts.join(" ");
    if (query.includes("FROM blackbaud_connections")) return [{ access_token: "test" }];
    if (query.includes("RETURNING blocked_until")) return [{ blocked_until: longer ? "2026-10-01T13:00:00Z" : "2026-10-01T12:10:00Z", message: "Saved pause" }];
    return [];
  });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: 429, headers: { "Retry-After": "600" } })));
  const { blackbaudApiFetch } = await import("./blackbaud");
  const { withBlackbaudReadBudget } = await import("./blackbaudReadBudget");
  const options = { userId: 7, origin: "https://example.org", maxRetries: 5 };
  await expect(withBlackbaudReadBudget(async () => true, () => blackbaudApiFetch("/test", options)))
    .rejects.toMatchObject({ name: "BlackbaudQuotaExceededError", retryAfterMs: longer ? 3600000 : 600000 });
  expect(fetch).toHaveBeenCalledOnce();
  expect(sql.mock.calls.find(([p]) => p.join(" ").includes("RETURNING blocked_until"))[0].join(" "))
    .toContain("GREATEST(blackbaud_api_limit_state.blocked_until, EXCLUDED.blocked_until)");
  sql.mockClear();
  await expect(blackbaudApiFetch("/other", options)).rejects.toMatchObject({ name: "BlackbaudQuotaExceededError" });
  expect(fetch).toHaveBeenCalledOnce();
  expect(sql.mock.calls.some(([p]) => p.join(" ").includes("FROM blackbaud_connections"))).toBe(false);
});
