import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const getOrCreateUserMock = vi.fn();
const getBlackbaudConfigMock = vi.fn();
const getBlackbaudConfigIssuesMock = vi.fn();
const getBlackbaudQuotaStatusMock = vi.fn();
const getValidBlackbaudConnectionMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({
  default: getOrCreateUserMock,
}));
vi.mock("@/app/api/utils/blackbaud", () => ({
  getBlackbaudConfig: getBlackbaudConfigMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  getBlackbaudQuotaStatus: getBlackbaudQuotaStatusMock,
  getValidBlackbaudConnection: getValidBlackbaudConnectionMock,
}));

describe("Blackbaud status route", () => {
  beforeEach(() => {
    authMock.mockReset();
    getOrCreateUserMock.mockReset();
    getBlackbaudConfigMock.mockReset();
    getBlackbaudConfigIssuesMock.mockReset();
    getBlackbaudQuotaStatusMock.mockReset();
    getValidBlackbaudConnectionMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    getOrCreateUserMock.mockResolvedValue({ id: 7 });
    getBlackbaudConfigMock.mockReturnValue({
      redirectUri: "https://example.com/api/blackbaud/callback",
      scopes: ["offline_access", "rnxt.r"],
      subscriptionKey: "configured",
    });
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    getBlackbaudQuotaStatusMock.mockResolvedValue({
      status: "available",
      paused: false,
      blockedUntil: null,
      remainingMs: 0,
      checkedAt: "2026-08-21T16:00:00.000Z",
      updatedAt: null,
    });
    getValidBlackbaudConnectionMock.mockResolvedValue({
      scope: "offline_access rnxt.r",
      expires_at: "2026-08-21T17:00:00.000Z",
      connected_at: "2026-08-21T15:00:00.000Z",
      updated_at: "2026-08-21T15:00:00.000Z",
    });
  });

  it("returns the quota circuit-breaker state without loading a connection", async () => {
    getBlackbaudQuotaStatusMock.mockResolvedValue({
      status: "paused",
      paused: true,
      blockedUntil: "2026-08-21T23:00:00.000Z",
      remainingMs: 60_000,
      checkedAt: "2026-08-21T22:59:00.000Z",
      updatedAt: "2026-08-21T22:00:00.000Z",
    });
    const { GET } = await import("./route.js");

    const response = await GET(
      new Request("https://example.com/api/blackbaud/status?availability=1"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.quota).toMatchObject({ status: "paused", paused: true });
    expect(getOrCreateUserMock).not.toHaveBeenCalled();
    expect(getValidBlackbaudConnectionMock).not.toHaveBeenCalled();
  });

  it("includes quota availability with the existing account connection status", async () => {
    const { GET } = await import("./route.js");

    const response = await GET(new Request("https://example.com/api/blackbaud/status"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.connected).toBe(true);
    expect(payload.quota).toMatchObject({ status: "available", paused: false });
    expect(getValidBlackbaudConnectionMock).toHaveBeenCalledWith(7, "https://example.com");
  });

  it("requires an authenticated user before revealing availability", async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await import("./route.js");

    const response = await GET(
      new Request("https://example.com/api/blackbaud/status?availability=1"),
    );

    expect(response.status).toBe(401);
    expect(getBlackbaudQuotaStatusMock).not.toHaveBeenCalled();
  });
});
