import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const getBlackbaudConfigIssuesMock = vi.fn();
const listBlackbaudGiftsMock = vi.fn();

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
  listBlackbaudGifts: listBlackbaudGiftsMock,
}));

describe("current fiscal year giving route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T14:00:00.000Z"));

    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    getBlackbaudConfigIssuesMock.mockReset();
    listBlackbaudGiftsMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 9, email: "mgo@example.com" },
      workspaceUser: { id: 9, email: "mgo@example.com" },
      isActing: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads multiple constituents in one comma-separated Gift API request", async () => {
    listBlackbaudGiftsMock.mockResolvedValue([
      {
        id: "received-gift",
        constituent_id: "123",
        gift_type: "Donation",
        date: "2026-07-05T00:00:00.000Z",
        amount: { value: 250 },
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
          constituent_id: "123,456",
          start_gift_date: "2026-07-01",
          end_gift_date: "2026-08-11",
        },
        pageLimit: 500,
        maxPages: 2,
      }),
    );
    expect(payload.byConstituentId["123"]).toMatchObject({
      recognizedReceived: 250,
      recognizedCommitted: 0,
    });
    expect(payload.byConstituentId["456"]).toMatchObject({
      recognizedReceived: 0,
      recognizedCommitted: 5000,
      plannedGifts: 5000,
    });
  });
});
