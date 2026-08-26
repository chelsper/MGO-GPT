import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const getBlackbaudConfigIssuesMock = vi.fn();
const getBlackbaudGiftMock = vi.fn();
const listBlackbaudGiftsMock = vi.fn();
const getRealizedPlannedGiftIdsMock = vi.fn();

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
