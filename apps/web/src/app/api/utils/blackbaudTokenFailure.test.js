import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("./ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("./sql", () => ({ default: vi.fn(async () => []) }));
import sql from "./sql";
import { refreshBlackbaudConnection, exchangeBlackbaudCode } from "./blackbaud";

const connection = { user_id: 7, refresh_token: "private-refresh-token", access_token: "private-access-token" };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

it.each([429, 500, 502, 503, 504])("retains HTTP %i renewal metadata but never immediately replays OAuth", async httpStatus => {
  fetch.mockResolvedValue(Response.json({ error_description: "Please try later" }, {
    status: httpStatus, headers: { "retry-after": "1200" },
  }));
  const error = await refreshBlackbaudConnection(connection, "https://example.org").catch(e => e);
  expect(error).toMatchObject({ name: "BlackbaudTokenError", stage: "blackbaud_auth", httpStatus,
    connectionRetryable: true, retryAfterMs: 1200000 });
  expect(JSON.stringify(error)).not.toContain("private-");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(sql).not.toHaveBeenCalled();
});

it.each([400, 401, 403, 500])("does not recommend retrying rejected credentials even on HTTP %i", async httpStatus => {
  fetch.mockResolvedValue(Response.json({ error: "invalid_grant" }, { status: httpStatus }));
  await expect(refreshBlackbaudConnection(connection)).rejects.toMatchObject({ httpStatus, connectionRetryable: false });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(sql).not.toHaveBeenCalled();
});

it("does not classify a transport failure with an uncertain token result as retryable", async () => {
  const uncertain = new Error("Connection closed before response");
  fetch.mockRejectedValue(uncertain);
  await expect(refreshBlackbaudConnection(connection)).rejects.toBe(uncertain);
  expect(uncertain.connectionRetryable).toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("does not recommend replaying an authorization code exchange", async () => {
  fetch.mockResolvedValue(Response.json({ error: "server_error" }, { status: 503 }));
  await expect(exchangeBlackbaudCode({ code: "private-code", origin: "https://example.org" }))
    .rejects.toMatchObject({ stage: "blackbaud_auth", connectionRetryable: false });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("keeps a successful renewal and its saved credentials unchanged", async () => {
  fetch.mockResolvedValue(Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }));
  expect(await refreshBlackbaudConnection(connection)).toMatchObject({ accessToken: "new-access", refreshToken: "new-refresh" });
  expect(sql).toHaveBeenCalledOnce();
});
