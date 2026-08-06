import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const getBlackbaudConfigIssuesMock = vi.fn();
const listBlackbaudGiftsMock = vi.fn();
const listGivingSocietyConfigurationsMock = vi.fn();

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

vi.mock("../../utils/givingSocietyConfigurations.js", async () => {
  const definitions = await vi.importActual("../../utils/givingSocietyDefinitions.js");
  return {
    getGivingSocietyConfigurationSignature:
      definitions.getGivingSocietyConfigurationSignature,
    listGivingSocietyConfigurations: listGivingSocietyConfigurationsMock,
  };
});

describe("annual giving societies batch route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T14:00:00.000Z"));

    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    getBlackbaudConfigIssuesMock.mockReset();
    listBlackbaudGiftsMock.mockReset();
    listGivingSocietyConfigurationsMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 9, email: "mgo@example.com" },
      workspaceUser: { id: 9, email: "mgo@example.com" },
      isActing: false,
    });
    listGivingSocietyConfigurationsMock.mockResolvedValue([
      {
        key: "presidents_society",
        name: "President's Society",
        basis: "annual",
        periodBasis: "calendar_year",
        fiscalYearStartMonth: 7,
        minimumAmount: 10000,
        maximumAmount: null,
        countSources: ["received_revenue", "recognition_credit"],
        active: true,
        displayOrder: 1,
      },
      {
        key: "order_of_the_dolphin",
        name: "Order of the Dolphin",
        basis: "annual",
        periodBasis: "calendar_year",
        fiscalYearStartMonth: 7,
        minimumAmount: 1000,
        maximumAmount: 9999.99,
        countSources: ["received_revenue", "recognition_credit"],
        active: true,
        displayOrder: 2,
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns annual giving society data keyed by constituent ID", async () => {
    const { GET } = await import("./route.js");

    listBlackbaudGiftsMock.mockImplementation(async ({ searchParams }) => {
      if (searchParams.constituent_id === "123") {
        return [
          {
            id: "gift-1",
            constituent_id: "123",
            gift_type: "Donation",
            date: "2026-07-01T00:00:00.000Z",
            amount: { value: 12500 },
          },
        ];
      }
      return [];
    });

    const response = await GET(
      new Request(
        "https://example.com/api/blackbaud/annual-giving-societies?constituentIds=123,456",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.byConstituentId["123"].primarySociety.label).toBe(
      "President's Society",
    );
    expect(payload.byConstituentId["456"].primarySociety).toBe(null);
    expect(payload.warnings).toEqual({});
  });

  it("keeps the batch response usable when one constituent lookup fails", async () => {
    const { GET } = await import("./route.js");

    listBlackbaudGiftsMock.mockImplementation(async ({ searchParams }) => {
      if (searchParams.constituent_id === "456") {
        throw new Error("Blackbaud gift lookup failed");
      }
      return [
        {
          id: "gift-1",
          constituent_id: searchParams.constituent_id,
          gift_type: "Donation",
          date: "2026-07-01T00:00:00.000Z",
          amount: { value: 1500 },
        },
      ];
    });

    const response = await GET(
      new Request(
        "https://example.com/api/blackbaud/annual-giving-societies?constituentId=123&constituentId=456",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.byConstituentId["123"].primarySociety.label).toBe(
      "Order of the Dolphin",
    );
    expect(payload.byConstituentId["456"]).toBe(null);
    expect(payload.warnings["456"]).toBe("Blackbaud gift lookup failed");
  });
});
