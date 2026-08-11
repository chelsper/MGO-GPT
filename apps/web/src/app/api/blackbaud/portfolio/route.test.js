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

  it("does not cache a portfolio when a last-gift lookup fails", async () => {
    const { GET } = await import("./route.js");
    listBlackbaudGiftsMock.mockRejectedValue(new Error("Gift lookup timed out"));

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.supportingSolicitor[0].lastGiftStatus).toBe("unavailable");
    // The initial cache read occurs, but no failed data is written back as cache.
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
});
