import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ALUMNI_DONOR_CONFIGURATION,
  getAlumniDonorConfigurationFingerprint,
} from "@/app/api/utils/alumniDonorConfiguration";

const {
  authMock,
  ensureAppSchemaMock,
  getCachedReportSnapshotMock,
  getReportCacheHeadersMock,
  getOrCreateUserMock,
  getReportAccessForUserMock,
  getReportRefreshUserMock,
  isAuthorizedReportRefreshRequestMock,
  saveReportSnapshotMock,
  shouldBypassReportCacheMock,
  getBlackbaudConfigIssuesMock,
  listBlackbaudConstituentCodesMock,
  listBlackbaudGiftsMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  ensureAppSchemaMock: vi.fn(),
  getCachedReportSnapshotMock: vi.fn(),
  getReportCacheHeadersMock: vi.fn((status) => ({ "X-MGOGPT-Report-Cache": status })),
  getOrCreateUserMock: vi.fn(),
  getReportAccessForUserMock: vi.fn(),
  getReportRefreshUserMock: vi.fn(),
  isAuthorizedReportRefreshRequestMock: vi.fn(),
  saveReportSnapshotMock: vi.fn(),
  shouldBypassReportCacheMock: vi.fn(
    (request) => new URL(request.url).searchParams.get("refresh") === "1",
  ),
  getBlackbaudConfigIssuesMock: vi.fn(),
  listBlackbaudConstituentCodesMock: vi.fn(),
  listBlackbaudGiftsMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: getOrCreateUserMock }));
vi.mock("@/app/api/utils/reportRefresh", () => ({
  getReportRefreshUser: getReportRefreshUserMock,
  isAuthorizedReportRefreshRequest: isAuthorizedReportRefreshRequestMock,
}));
vi.mock("@/app/api/utils/reportAccess", () => ({
  ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY: "alumni-family-engagement",
  getReportAccessForUser: getReportAccessForUserMock,
}));
vi.mock("@/app/api/utils/reportCache", () => ({
  getCachedReportSnapshot: getCachedReportSnapshotMock,
  getReportCacheHeaders: getReportCacheHeadersMock,
  saveReportSnapshot: saveReportSnapshotMock,
  shouldBypassReportCache: shouldBypassReportCacheMock,
}));
vi.mock("@/app/api/utils/blackbaud", () => ({
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  listBlackbaudConstituentCodes: listBlackbaudConstituentCodesMock,
  listBlackbaudGifts: listBlackbaudGiftsMock,
}));

function createRequest(search = "") {
  return new Request(`https://www.jumgogpt.app/api/reports/alumni-family-engagement${search}`);
}

function createCachedSnapshot(overrides = {}) {
  return {
    status: "complete",
    generatedAt: "2026-08-25T18:00:00.000Z",
    configurationFingerprint: getAlumniDonorConfigurationFingerprint(
      DEFAULT_ALUMNI_DONOR_CONFIGURATION,
    ),
    totalRows: 5,
    totals: [
      { key: "fy27-alumni-giving", total: 3 },
      { key: "fy26-alumni-giving", total: 2 },
    ],
    constituencyMembershipCache: {
      "100": {
        codes: ["Alumni Bachelor's Degree"],
        cachedAt: "2026-08-25T18:00:00.000Z",
      },
    },
    ...overrides,
  };
}

describe("Alumni & Family Engagement report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { email: "mgo@example.edu" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({ id: 7, role: "mgo" });
    getReportAccessForUserMock.mockResolvedValue({ canView: true });
    isAuthorizedReportRefreshRequestMock.mockReturnValue(false);
    getCachedReportSnapshotMock.mockResolvedValue(null);
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    saveReportSnapshotMock.mockResolvedValue();
  });

  it("returns the matching snapshot without making another NXT request", async () => {
    getCachedReportSnapshotMock.mockResolvedValueOnce(createCachedSnapshot());
    const { GET } = await import("./route.js");

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      totalRows: 5,
      totals: [
        { key: "fy27-alumni-giving", label: "FY27 Alumni Giving", total: 3 },
        { key: "fy26-alumni-giving", label: "FY26 Alumni Giving", total: 2 },
      ],
    });
    expect(payload).not.toHaveProperty("constituencyMembershipCache");
    expect(listBlackbaudGiftsMock).not.toHaveBeenCalled();
    expect(listBlackbaudConstituentCodesMock).not.toHaveBeenCalled();
  });

  it("requires an explicit refresh when no matching snapshot exists", async () => {
    const { GET } = await import("./route.js");

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "refresh_required" });
    expect(listBlackbaudGiftsMock).not.toHaveBeenCalled();
    expect(listBlackbaudConstituentCodesMock).not.toHaveBeenCalled();
  });

  it("counts distinct selected-constituency recipients from direct NXT gift records", async () => {
    listBlackbaudGiftsMock.mockImplementation(async ({ searchParams }) => {
      if (searchParams.start_gift_date === "2026-07-01") {
        return {
          gifts: [
            { constituent_id: "100", gift_type: "Donation" },
            { constituent_id: "100", gift_type: "Donation" },
            { constituent_id: "101", gift_type: "Pledge" },
            { constituent_id: "102", gift_type: "Donation" },
          ],
          hasMore: false,
        };
      }
      return {
        gifts: [{ constituent_id: "103", gift_type: "Donation" }],
        hasMore: false,
      };
    });
    listBlackbaudConstituentCodesMock.mockImplementation(async ({ constituentId }) => {
      const codesById = {
        "100": [{ description: "Alumni Bachelor's Degree" }],
        "101": [{ description: "Parent" }],
        "102": [{ description: "Alumni Graduate Degree" }],
        "103": [{ description: "Alumni" }],
      };
      return codesById[constituentId] || [];
    });
    const { GET } = await import("./route.js");

    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "complete",
      totalRows: 3,
      totals: [
        { key: "fy27-alumni-giving", total: 2 },
        { key: "fy26-alumni-giving", total: 1 },
      ],
      refreshMetrics: {
        giftRowsRead: 5,
        selectedGiftRows: 5,
        uniqueGiftRecipients: 4,
        refreshedConstituencyMemberships: 4,
      },
    });
    expect(listBlackbaudGiftsMock).toHaveBeenCalledTimes(2);
    expect(listBlackbaudConstituentCodesMock).toHaveBeenCalledTimes(4);
    expect(saveReportSnapshotMock).toHaveBeenCalledWith(
      "report:alumni-family-engagement",
      expect.objectContaining({
        status: "complete",
        totalRows: 3,
        constituencyMembershipCache: expect.any(Object),
      }),
    );
  });

  it("uses the configured gift types and constituency codes", async () => {
    getReportAccessForUserMock.mockResolvedValue({
      canView: true,
      dataConfiguration: {
        constituencies: ["Alumni Bachelor's Degree"],
        giftTypes: ["donation"],
        rows: [
          {
            key: "fy25-alumni-giving",
            label: "FY25 Alumni Giving",
            fiscalYearStart: "2024-07-01",
            fiscalYearEnd: "2025-06-30",
          },
        ],
      },
    });
    listBlackbaudGiftsMock.mockResolvedValue({
      gifts: [
        { constituent_id: "100", gift_type: "Donation" },
        { constituent_id: "101", gift_type: "Pledge" },
        { constituent_id: "102", gift_type: "Donation" },
      ],
      hasMore: false,
    });
    listBlackbaudConstituentCodesMock.mockImplementation(async ({ constituentId }) => {
      if (constituentId === "100") return [{ description: "Alumni Bachelor's Degree" }];
      return [{ description: "Alumni Graduate Degree" }];
    });
    const { GET } = await import("./route.js");

    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      donorDefinition: {
        constituencies: ["Alumni Bachelor's Degree"],
        giftTypes: [{ key: "donation", label: "Donation / cash received" }],
      },
      totals: [{ key: "fy25-alumni-giving", label: "FY25 Alumni Giving", total: 1 }],
    });
    expect(listBlackbaudConstituentCodesMock).toHaveBeenCalledTimes(2);
  });

  it("does not save an incomplete count when the Gift API indicates more pages", async () => {
    listBlackbaudGiftsMock.mockResolvedValue({
      gifts: [{ constituent_id: "100", gift_type: "Donation" }],
      hasMore: true,
    });
    const { GET } = await import("./route.js");

    const response = await GET(createRequest("?refresh=1"));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toContain("exceeds 10,000 gift rows");
    expect(saveReportSnapshotMock).not.toHaveBeenCalled();
  });

  it("does not present a snapshot created with a different donor definition", async () => {
    getReportAccessForUserMock.mockResolvedValue({
      canView: true,
      dataConfiguration: { giftTypes: ["donation"] },
    });
    getCachedReportSnapshotMock.mockResolvedValueOnce(createCachedSnapshot());
    const { GET } = await import("./route.js");

    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "refresh_required" });
    expect(listBlackbaudGiftsMock).not.toHaveBeenCalled();
  });
});
