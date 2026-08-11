import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const getOrCreateUserMock = vi.fn();
const sqlMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();
const findBlackbaudConstituentByLookupIdMock = vi.fn();
const findBlackbaudConstituentByEmailMock = vi.fn();
const getBlackbaudConfigIssuesMock = vi.fn();
const listBlackbaudFundraiserAssignmentsMock = vi.fn();
const searchBlackbaudConstituentsMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({
  default: getOrCreateUserMock,
}));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/app/api/utils/blackbaud", () => ({
  blackbaudApiFetch: blackbaudApiFetchMock,
  findBlackbaudConstituentByLookupId: findBlackbaudConstituentByLookupIdMock,
  findBlackbaudConstituentByEmail: findBlackbaudConstituentByEmailMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  listBlackbaudFundraiserAssignments: listBlackbaudFundraiserAssignmentsMock,
  listBlackbaudConstituents: vi.fn(),
  searchBlackbaudConstituents: searchBlackbaudConstituentsMock,
}));

describe("Blackbaud portfolio route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    getOrCreateUserMock.mockReset();
    sqlMock.mockReset();
    blackbaudApiFetchMock.mockReset();
    findBlackbaudConstituentByLookupIdMock.mockReset();
    findBlackbaudConstituentByEmailMock.mockReset();
    getBlackbaudConfigIssuesMock.mockReset();
    listBlackbaudFundraiserAssignmentsMock.mockReset();
    searchBlackbaudConstituentsMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({ id: 9 });
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 9, email: "mgo@example.com" },
      workspaceUser: {
        id: 9,
        email: "mgo@example.com",
        blackbaud_constituent_id: "800",
      },
      isActing: false,
    });
    sqlMock.mockResolvedValue([]);
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue(null);
    findBlackbaudConstituentByEmailMock.mockResolvedValue(null);
    searchBlackbaudConstituentsMock.mockResolvedValue([]);
    listBlackbaudFundraiserAssignmentsMock.mockResolvedValue([
      { constituent_id: "5044931", type: "Secondary Solicitor" },
    ]);
    blackbaudApiFetchMock.mockImplementation(async (path) => {
      if (path.includes("/givingsummary/lifetimegiving")) {
        return { total_giving: { value: 100000 } };
      }

      if (path.startsWith("/constituent/v1/constituents/")) {
        return {
          id: "5044931",
          lookup_id: "5044931",
          name: "Armando M. Codina",
        };
      }

      throw new Error(`Unexpected Blackbaud request: ${path}`);
    });
  });

  it("returns assignments with constituent and lifetime-giving details without gift-history lookups", async () => {
    const { GET } = await import("./route.js");

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.supportingSolicitor[0]).toEqual(
      expect.objectContaining({
        constituentId: "5044931",
        lookupId: "5044931",
        name: "Armando M. Codina",
        assignmentTypes: ["Secondary Solicitor"],
        lifetimeGiving: {
          totalGiving: 100000,
          totalReceivedGiving: null,
        },
      }),
    );
    expect(payload.supportingSolicitor[0]).not.toHaveProperty("lastGift");
    // One cache read and one cache write; no expensive gift-history lookup.
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it("uses a recent stale portfolio cache when fundraiser assignments fail", async () => {
    const { GET } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([
      {
        blackbaud_portfolio_cache: {
          leadSolicitor: [],
          supportingSolicitor: [
            {
              constituentId: "5044931",
              name: "Armando M. Codina",
              assignmentTypes: ["Secondary Solicitor"],
            },
          ],
          summary: { leadCount: 0, supportingCount: 1 },
        },
        blackbaud_portfolio_cache_key: "v5:800",
        blackbaud_portfolio_cached_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    ]);
    listBlackbaudFundraiserAssignmentsMock.mockRejectedValue(
      new Error("Rate limited by NXT"),
    );

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.supportingSolicitor[0].name).toBe("Armando M. Codina");
    expect(payload.portfolioMeta).toEqual(
      expect.objectContaining({
        source: "stale-cache",
        reason: "fundraiser-assignments-unavailable",
      }),
    );
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });
});
