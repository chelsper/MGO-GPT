import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  ensureAppSchemaMock,
  getOrCreateUserMock,
  getCustomFieldReportAccessForUserMock,
  isAuthorizedReportRefreshRequestMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  ensureAppSchemaMock: vi.fn(),
  getOrCreateUserMock: vi.fn(),
  getCustomFieldReportAccessForUserMock: vi.fn(),
  isAuthorizedReportRefreshRequestMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: getOrCreateUserMock }));
vi.mock("@/app/api/utils/reportAccess", () => ({
  getCustomFieldReportAccessForUser: getCustomFieldReportAccessForUserMock,
}));
vi.mock("@/app/api/utils/reportRefresh", () => ({
  getReportRefreshUser: vi.fn(),
  isAuthorizedReportRefreshRequest: isAuthorizedReportRefreshRequestMock,
}));
vi.mock("@/app/api/utils/reportCache", () => ({
  getCachedReportSnapshot: vi.fn(),
  getReportCacheHeaders: vi.fn(() => ({})),
  saveReportSnapshot: vi.fn(),
  shouldBypassReportCache: vi.fn(() => false),
}));
vi.mock("@/app/api/utils/blackbaud", () => ({
  createBlackbaudQueryJob: vi.fn(),
  downloadBlackbaudQueryResult: vi.fn(),
  getBlackbaudConfigIssues: vi.fn(() => []),
  getBlackbaudQueryJob: vi.fn(),
}));
vi.mock("@/app/api/utils/customFieldReports", () => ({
  customFieldReportCacheKey: vi.fn(() => "report:custom-field:alumni-donors"),
  serializeCustomFieldReport: vi.fn((record) => ({
    slug: record.slug,
    title: record.title,
    sourceQueryId: record.source_query_id,
  })),
}));

describe("custom field report route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAppSchemaMock.mockResolvedValue();
    isAuthorizedReportRefreshRequestMock.mockReturnValue(false);
    authMock.mockResolvedValue({ user: { email: "admin@example.edu" } });
    getOrCreateUserMock.mockResolvedValue({ id: 8, role: "admin" });
    getCustomFieldReportAccessForUserMock.mockResolvedValue({
      record: {
        slug: "alumni-donors",
        title: "Alumni Donors",
        source_query_id: "30976",
        active: true,
      },
      canView: false,
    });
  });

  it("does not let an administrator bypass explicit user enablement with a direct URL", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(
      new Request("https://www.jumgogpt.app/api/reports/custom-field/alumni-donors"),
      { params: { slug: "alumni-donors" } },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "This Custom Field Report has not been enabled for you.",
    });
  });
});
