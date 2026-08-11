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
const listBlackbaudGiftsMock = vi.fn();
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
  listBlackbaudGifts: listBlackbaudGiftsMock,
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
    listBlackbaudGiftsMock.mockReset();
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

  it("uses the next gift when the newest gift is only a processing fee", async () => {
    const { GET } = await import("./route.js");
    listBlackbaudGiftsMock.mockResolvedValue([
      {
        date: "2026-08-09",
        type: "Donation",
        funds: [{ name: "Credit Card Processing Fee" }],
      },
      {
        date: "2026-08-08",
        type: "Donation",
        funds: [{ name: "Donor Advised Fund" }],
        soft_credits: [{ constituent_id: "5044931" }],
      },
    ]);

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();
    const person = payload.supportingSolicitor[0];

    expect(response.status).toBe(200);
    expect(person.lastGiftStatus).toBe("loaded");
    expect(person.lastGift).toEqual({
      date: "2026-08-08",
      type: "Donation",
      fund: "Donor Advised Fund",
    });
  });

  it("keeps a valid gift when it contains both a fee and a real fund", async () => {
    const { GET } = await import("./route.js");
    listBlackbaudGiftsMock.mockResolvedValue([
      {
        date: "2026-08-09",
        type: "Donation",
        funds: [
          { name: "Credit Card Processing Fee" },
          { name: "Donor Advised Fund" },
        ],
        soft_credits: [{ constituent_id: "5044931" }],
      },
    ]);

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();
    const person = payload.supportingSolicitor[0];

    expect(person.lastGift).toEqual({
      date: "2026-08-09",
      type: "Donation",
      fund: "Donor Advised Fund",
    });
  });

  it("uses the canonical NXT constituent ID for the batched gift lookup", async () => {
    const { GET } = await import("./route.js");
    blackbaudApiFetchMock.mockImplementation(async (path) => {
      if (path.includes("/givingsummary/lifetimegiving")) {
        return { total_giving: { value: 100000 } };
      }

      if (path.startsWith("/constituent/v1/constituents/")) {
        return {
          id: "100001",
          lookup_id: "5044931",
          name: "Armando M. Codina",
        };
      }

      throw new Error(`Unexpected Blackbaud request: ${path}`);
    });
    listBlackbaudGiftsMock.mockResolvedValue([
      {
        date: "2026-08-08",
        type: "Donation",
        funds: [{ name: "Donor Advised Fund" }],
        soft_credits: [{ constituent_id: "100001" }],
      },
    ]);

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();
    const person = payload.supportingSolicitor[0];

    expect(response.status).toBe(200);
    expect(person.lastGiftStatus).toBe("loaded");
    expect(person.lastGift).toEqual({
      date: "2026-08-08",
      type: "Donation",
      fund: "Donor Advised Fund",
    });
    expect(listBlackbaudGiftsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        searchParams: { constituent_id: ["100001"] },
      }),
    );
  });

  it("maps direct gifts and soft credits from one batched lookup to their constituents", async () => {
    const { GET } = await import("./route.js");
    listBlackbaudFundraiserAssignmentsMock.mockResolvedValue([
      { constituent_id: "100001", type: "Secondary Solicitor" },
      { constituent_id: "100002", type: "Secondary Solicitor" },
    ]);
    blackbaudApiFetchMock.mockImplementation(async (path) => {
      if (path.includes("/givingsummary/lifetimegiving")) {
        return { total_giving: { value: 100000 } };
      }

      if (path.endsWith("/100001")) {
        return { id: "100001", lookup_id: "100001", name: "Direct Gift" };
      }

      if (path.endsWith("/100002")) {
        return { id: "100002", lookup_id: "100002", name: "Soft Credit" };
      }

      throw new Error(`Unexpected Blackbaud request: ${path}`);
    });
    listBlackbaudGiftsMock.mockResolvedValue([
      {
        constituent_id: "100001",
        date: "2026-08-09",
        type: "Donation",
        funds: [{ name: "Annual Fund" }],
      },
      {
        constituent_id: "999999",
        date: "2026-08-08",
        type: "Donation",
        funds: [{ name: "Donor Advised Fund" }],
        soft_credits: [{ constituent_id: "100002" }],
      },
    ]);

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.supportingSolicitor).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          constituentId: "100001",
          lastGift: {
            date: "2026-08-09",
            type: "Donation",
            fund: "Annual Fund",
          },
        }),
        expect.objectContaining({
          constituentId: "100002",
          lastGift: {
            date: "2026-08-08",
            type: "Donation",
            fund: "Donor Advised Fund",
          },
        }),
      ]),
    );
    expect(listBlackbaudGiftsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        searchParams: { constituent_id: ["100001", "100002"] },
      }),
    );
  });

  it("caches a complete portfolio when optional last-gift lookup fails", async () => {
    const { GET } = await import("./route.js");
    listBlackbaudGiftsMock.mockRejectedValue(new Error("Gift lookup timed out"));

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.supportingSolicitor[0].lastGiftStatus).toBe("unavailable");
    // A delayed gift lookup must not force every subsequent portfolio view to
    // rebuild the assignment and constituent cards from NXT.
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
