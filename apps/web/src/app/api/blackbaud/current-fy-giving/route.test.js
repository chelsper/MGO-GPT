import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const getBlackbaudConfigIssuesMock = vi.fn();
const getBlackbaudGiftMock = vi.fn();
const listBlackbaudGiftsMock = vi.fn();
const getRealizedPlannedGiftIdsMock = vi.fn();
const sqlMock = vi.fn();
const isScheduledMock = vi.fn();
const refreshUserMock = vi.fn();

vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/app/api/utils/reportRefresh", () => ({
  isAuthorizedReportRefreshRequest: isScheduledMock, getReportRefreshUser: refreshUserMock,
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));

vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  getBlackbaudGift: getBlackbaudGiftMock,
  listBlackbaudGifts: listBlackbaudGiftsMock,
  isBlackbaudQuotaExceededError: (error) => error?.httpStatus === 403 && error?.retryAfterMs > 0,
}));

vi.mock("../../utils/plannedGiftRevenue.js", () => ({
  getRealizedPlannedGiftIds: getRealizedPlannedGiftIdsMock,
}));

describe("current fiscal year giving route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T14:00:00.000Z"));

    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    getBlackbaudConfigIssuesMock.mockReset();
    getBlackbaudGiftMock.mockReset();
    listBlackbaudGiftsMock.mockReset();
    getRealizedPlannedGiftIdsMock.mockReset();
    sqlMock.mockReset().mockResolvedValue([]);
    isScheduledMock.mockReset().mockReturnValue(false);
    refreshUserMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    getRealizedPlannedGiftIdsMock.mockResolvedValue(new Set());
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 9, email: "mgo@example.com" },
      workspaceUser: { id: 9, email: "mgo@example.com" },
      isActing: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves saved FY figures without Blackbaud calls, including stale snapshots", async () => {
    sqlMock.mockResolvedValue([{ constituent_id: "saved", stale_after: "2026-01-01", payload: {
      currentFyPeriod: { startDate: "2026-07-01" }, currentFyGiving: { recognizedReceived: 250 },
    } }]);
    const { GET } = await import("./route.js");
    const data = await (await GET(new Request("https://example.com/api/blackbaud/current-fy-giving?constituentIds=saved,missing&portfolio_snapshot=1"))).json();
    expect(data.byConstituentId.saved.recognizedReceived).toBe(250);
    expect(data.byConstituentId.missing).toBeUndefined();
    expect(data.warnings.saved).toContain("last saved");
    expect(listBlackbaudGiftsMock).not.toHaveBeenCalled();
    expect(getBlackbaudGiftMock).not.toHaveBeenCalled();
  });

  it("does not label last fiscal year's saved numbers as current", async () => {
    sqlMock.mockResolvedValue([{ constituent_id: "saved", payload: {
      currentFyPeriod: { startDate: "2025-07-01" }, currentFyGiving: { recognizedReceived: 250 },
    } }]);
    const { GET } = await import("./route.js");
    const data = await (await GET(new Request("https://example.com/api/blackbaud/current-fy-giving?constituentId=saved&portfolio_snapshot=1"))).json();
    expect(data.byConstituentId).toEqual({});
    expect(listBlackbaudGiftsMock).not.toHaveBeenCalled();
  });

  it.each([429, 403])("preserves HTTP %i throttling for the nightly worker", async (httpStatus) => {
    listBlackbaudGiftsMock.mockRejectedValue(Object.assign(new Error("Provider paused"), { httpStatus, retryAfterMs: 30000 }));
    const { GET } = await import("./route.js");
    const response = await GET(new Request("https://example.com/api/blackbaud/current-fy-giving?constituentId=paused&portfolio_refresh=1"));
    expect(response.status).toBe(httpStatus === 429 ? 429 : 503);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.json()).toMatchObject({ providerStatus: httpStatus, retryAfterMs: 30000 });
  });

  it.each([{}, { gifts: [null], hasMore: false }])("rejects malformed nightly giving instead of caching zero", async (value) => {
    listBlackbaudGiftsMock.mockResolvedValue(value);
    const { GET } = await import("./route.js");
    const response = await GET(new Request("https://example.com/api/blackbaud/current-fy-giving?constituentId=bad&portfolio_refresh=1"));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("Malformed");
  });

  it("allows only the validated scheduled context to choose a target workspace", async () => {
    isScheduledMock.mockReturnValue(true);
    refreshUserMock.mockResolvedValue({ id: 99 });
    sqlMock.mockResolvedValueOnce([{ id: 7, active: true }]);
    listBlackbaudGiftsMock.mockResolvedValue({ gifts: [], hasMore: false });
    const { GET } = await import("./route.js");
    const response = await GET(new Request("https://example.com/api/blackbaud/current-fy-giving?constituentId=scheduled&portfolio_refresh=1&workspaceUserId=7"));
    expect(response.status).toBe(200);
    expect(authMock).not.toHaveBeenCalled();
    expect(listBlackbaudGiftsMock).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, authUserId: 99, strictResponse: true }));
  });

  it("loads multiple constituents with repeated Gift API filters", async () => {
    listBlackbaudGiftsMock.mockResolvedValue([
      {
        id: "received-gift",
        constituent_id: "123",
        gift_type: "Donation",
        date: "2026-07-05T00:00:00.000Z",
        amount: { value: 250 },
        soft_credits: [{ constituent_id: "456", amount: { value: 250 } }],
      },
      {
        id: "planned-gift",
        constituent_id: "456",
        gift_type: "Planned Gift",
        date: "2026-07-12T00:00:00.000Z",
        amount: { value: 5000 },
      },
    ]);

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request(
        "https://example.com/api/blackbaud/current-fy-giving?constituentIds=123,456",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(listBlackbaudGiftsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        searchParams: {
          constituent_id: ["123", "456"],
          start_gift_date: "2026-07-01",
          end_gift_date: "2026-08-11",
        },
        pageLimit: 500,
        maxPages: 2,
        includePageMetadata: true,
      }),
    );
    expect(payload.byConstituentId["123"]).toMatchObject({
      recognizedReceived: 250,
      recognizedCommitted: 0,
    });
    expect(payload.byConstituentId["456"]).toMatchObject({
      recognizedReceived: 250,
      recognizedCommitted: 5000,
      plannedGifts: 5000,
    });
  });

  it("enriches an associated soft-credited pledge payment when the Gift list omits credits", async () => {
    listBlackbaudGiftsMock.mockResolvedValue([
      {
        id: "pledge-payment-1",
        constituent_id: "donor-constituent-id",
        type: "Pledge payment ($50,000 Soft credit)",
        date: "2026-07-05T00:00:00.000Z",
        amount: { value: 50000 },
        soft_credits: [],
      },
    ]);
    getBlackbaudGiftMock.mockResolvedValue({
      id: "pledge-payment-1",
      constituent_id: "donor-constituent-id",
      type: "Pledge payment ($50,000 Soft credit)",
      date: "2026-07-05T00:00:00.000Z",
      amount: { value: 50000 },
      soft_credits: [{ constituent_id: "789", amount: { value: 50000 } }],
    });

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request(
        "https://example.com/api/blackbaud/current-fy-giving?constituentId=789",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getBlackbaudGiftMock).toHaveBeenCalledWith(
      expect.objectContaining({ giftId: "pledge-payment-1" }),
    );
    expect(payload.byConstituentId["789"]).toMatchObject({
      recognizedReceived: 50000,
      recognizedCommitted: 0,
    });
  });

  it("rechecks zero-result constituents for recipient-side soft-credit gifts", async () => {
    listBlackbaudGiftsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "pledge-payment-soft-credit-1",
          constituent_id: "direct-donor-id",
          gift_type: "Pledge payment ($50,000 Soft credit)",
          date: "2026-07-02T00:00:00.000Z",
          amount: { value: 50000 },
          soft_credits: [],
        },
      ]);
    getBlackbaudGiftMock.mockResolvedValue({
      id: "pledge-payment-soft-credit-1",
      constituent_id: "direct-donor-id",
      gift_type: "Pledge payment ($50,000 Soft credit)",
      date: "2026-07-02T00:00:00.000Z",
      amount: { value: 50000 },
      soft_credits: [{ constituent_id: "cynthia-id", amount: { value: 50000 } }],
    });

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request(
        "https://example.com/api/blackbaud/current-fy-giving?constituentId=cynthia-id",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.usedPerConstituentFallback).toBe(true);
    expect(listBlackbaudGiftsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        searchParams: {
          constituent_id: "cynthia-id",
          start_gift_date: "2026-07-01",
          end_gift_date: "2026-08-11",
        },
      }),
    );
    expect(payload.byConstituentId["cynthia-id"]).toMatchObject({
      recognizedReceived: 50000,
      recognizedCommitted: 0,
    });
    expect(payload.acknowledgmentCredits).toEqual([
      expect.objectContaining({
        hardCreditConstituentId: "direct-donor-id",
        recipientConstituentId: "cynthia-id",
        amount: 50000,
      }),
    ]);
  });

  it("reloads fiscal-year gifts by constituent when the combined portfolio list is paginated", async () => {
    listBlackbaudGiftsMock
      .mockResolvedValueOnce({ gifts: [], pageCount: 2, hasMore: true })
      .mockResolvedValueOnce({
        gifts: [
          {
            id: "pledge-payment-fallback-1",
            constituent_id: "donor-constituent-id",
            gift_type: { description: "Pledge payment ($50,000 Soft credit)" },
            date: "2026-07-05T00:00:00.000Z",
            amount: { value: 50000 },
          },
        ],
        pageCount: 1,
        hasMore: false,
      });
    getBlackbaudGiftMock.mockResolvedValue({
      id: "pledge-payment-fallback-1",
      constituent_id: "donor-constituent-id",
      gift_type: { description: "Pledge payment ($50,000 Soft credit)" },
      date: "2026-07-05T00:00:00.000Z",
      amount: { value: 50000 },
      soft_credits: [{ constituent_id: "888", amount: { value: 50000 } }],
    });

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request(
        "https://example.com/api/blackbaud/current-fy-giving?constituentId=888",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.usedPerConstituentFallback).toBe(true);
    expect(payload.byConstituentId["888"]).toMatchObject({
      recognizedReceived: 50000,
      recognizedCommitted: 0,
    });
    expect(listBlackbaudGiftsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        searchParams: {
          constituent_id: "888",
          start_gift_date: "2026-07-01",
          end_gift_date: "2026-08-11",
        },
        maxPages: 4,
        includePageMetadata: true,
      }),
    );
  });
});
