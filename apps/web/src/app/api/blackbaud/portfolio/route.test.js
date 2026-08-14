import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const getOrCreateUserMock = vi.fn();
const sqlMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();
const findBlackbaudConstituentByLookupIdMock = vi.fn();
const findBlackbaudConstituentByEmailMock = vi.fn();
const getBlackbaudConstituentByIdMock = vi.fn();
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
  getBlackbaudConstituentById: getBlackbaudConstituentByIdMock,
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
    getBlackbaudConstituentByIdMock.mockReset();
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
    getBlackbaudConstituentByIdMock.mockResolvedValue(null);
    searchBlackbaudConstituentsMock.mockResolvedValue([]);
    listBlackbaudFundraiserAssignmentsMock.mockResolvedValue([
      {
        constituent_id: "5044931",
        type: "Secondary Solicitor",
        constituent: {
          lookup_id: "5044931",
          name: "Armando M. Codina",
        },
      },
    ]);
  });

  it("returns assignment cards without waiting for NXT details for every constituent", async () => {
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
          totalGiving: null,
          totalReceivedGiving: null,
        },
      }),
    );
    expect(payload.supportingSolicitor[0]).not.toHaveProperty("lastGift");
    // Cache lookup, local-data lookup, cached-contact lookup, and cache
    // write. The full NXT constituent summary is fetched only if the user
    // expands a card.
    expect(sqlMock).toHaveBeenCalledTimes(4);
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it("returns a usable stale portfolio cache immediately", async () => {
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
        blackbaud_portfolio_cache_key: "v9:800",
        blackbaud_portfolio_cached_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    ]);
    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.supportingSolicitor[0].name).toBe("Armando M. Codina");
    expect(payload.portfolioMeta).toEqual(
      expect.objectContaining({
        source: "stale-cache",
        reason: "cached-portfolio-available",
      }),
    );
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
    expect(listBlackbaudFundraiserAssignmentsMock).not.toHaveBeenCalled();
  });

  it("reuses cached NXT contacts without loading a full summary per card", async () => {
    const { GET } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          constituent_id: "5044931",
          payload: {
            mapped: {
              constituent: {
                name: "Armando M. Codina",
                email: "acodina@example.com",
                phone: "904-555-0199",
                address: "50 Casuarina Concourse, Miami, FL",
              },
            },
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.supportingSolicitor[0]).toEqual(
      expect.objectContaining({
        email: "acodina@example.com",
        phone: "904-555-0199",
        address: "50 Casuarina Concourse, Miami, FL",
        contactDataSource: "nxt-summary-cache",
      }),
    );
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it("resolves an otherwise unnamed assignment without loading a full summary", async () => {
    const { GET } = await import("./route.js");
    listBlackbaudFundraiserAssignmentsMock.mockResolvedValue([
      {
        constituent_id: "77",
        type: "Lead Solicitor",
      },
    ]);
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      name: "Alex Example",
      lookupId: "A-77",
    });

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.leadSolicitor[0]).toEqual(
      expect.objectContaining({
        constituentId: "77",
        name: "Alex Example",
        lookupId: "A-77",
      }),
    );
    expect(getBlackbaudConstituentByIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ constituentId: "77" }),
    );
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });
});
