import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMockImpl = vi.fn(async () => []);
const getBlackbaudConfigIssuesMock = vi.fn();
const findBlackbaudConstituentByEmailMock = vi.fn();
const findBlackbaudConstituentByLookupIdMock = vi.fn();
const getBlackbaudFundraiserByIdMock = vi.fn();
const listBlackbaudFundraiserAssignmentsMock = vi.fn();
const searchBlackbaudConstituentsMock = vi.fn();
const updateBlackbaudFundraiserAssignmentMock = vi.fn();
const clearUserPortfolioCacheMock = vi.fn();
const clearUserProspectsSummaryCacheMock = vi.fn();

function sqlTag(strings, ...values) {
  return sqlMockImpl(strings, ...values);
}

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));

vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

vi.mock("@/app/api/utils/userDataCache", () => ({
  clearUserPortfolioCache: clearUserPortfolioCacheMock,
  clearUserProspectsSummaryCache: clearUserProspectsSummaryCacheMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  findBlackbaudConstituentByEmail: findBlackbaudConstituentByEmailMock,
  findBlackbaudConstituentByLookupId: findBlackbaudConstituentByLookupIdMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  getBlackbaudFundraiserById: getBlackbaudFundraiserByIdMock,
  listBlackbaudFundraiserAssignments: listBlackbaudFundraiserAssignmentsMock,
  searchBlackbaudConstituents: searchBlackbaudConstituentsMock,
  updateBlackbaudFundraiserAssignment: updateBlackbaudFundraiserAssignmentMock,
}));

describe("portfolio solicitor assignment route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T16:00:00.000Z"));

    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    sqlMockImpl.mockClear();
    getBlackbaudConfigIssuesMock.mockReset();
    findBlackbaudConstituentByEmailMock.mockReset();
    findBlackbaudConstituentByLookupIdMock.mockReset();
    getBlackbaudFundraiserByIdMock.mockReset();
    listBlackbaudFundraiserAssignmentsMock.mockReset();
    searchBlackbaudConstituentsMock.mockReset();
    updateBlackbaudFundraiserAssignmentMock.mockReset();
    clearUserPortfolioCacheMock.mockReset();
    clearUserProspectsSummaryCacheMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: {
        id: 44,
        name: "MGO User",
        email: "mgo@example.com",
        role: "mgo",
      },
      workspaceUser: {
        id: 44,
        name: "MGO User",
        email: "mgo@example.com",
        role: "mgo",
        blackbaud_constituent_id: "800",
      },
      isActing: false,
    });
    findBlackbaudConstituentByEmailMock.mockResolvedValue(null);
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue(null);
    searchBlackbaudConstituentsMock.mockResolvedValue([]);
    getBlackbaudFundraiserByIdMock.mockResolvedValue({
      fundraiserId: "800",
      constituentId: "800",
      name: "MGO User",
    });
    updateBlackbaudFundraiserAssignmentMock.mockResolvedValue({ id: "assignment-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("changes the active solicitor assignment to Former Solicitor with today's end date", async () => {
    const { PATCH } = await import("./route.js");

    listBlackbaudFundraiserAssignmentsMock.mockResolvedValue([
      {
        id: "assignment-1",
        constituent_id: "12345",
        type: "Secondary Solicitor",
        start: "2026-03-01T00:00:00.000Z",
        end: null,
      },
      {
        id: "assignment-2",
        constituent_id: "99999",
        type: "Lead Solicitor",
        start: "2026-03-01T00:00:00.000Z",
        end: null,
      },
    ]);

    const response = await PATCH(
      new Request("https://example.com/api/blackbaud/portfolio/solicitor-assignment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constituentId: "12345" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(updateBlackbaudFundraiserAssignmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 44,
        authUserId: 44,
        origin: "https://example.com",
        assignmentId: "assignment-1",
        payload: {
          type: "Former Solicitor",
          start: "2026-03-01T00:00:00.000Z",
          end: "2026-07-22",
        },
      }),
    );
    expect(clearUserPortfolioCacheMock).toHaveBeenCalledWith(44);
    expect(clearUserProspectsSummaryCacheMock).toHaveBeenCalledWith(44);
  });

  it("does not allow an executive viewer to remove another user's solicitor assignment", async () => {
    const { PATCH } = await import("./route.js");

    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: {
        id: 7,
        name: "Executive Admin",
        email: "admin@example.com",
        role: "admin",
      },
      workspaceUser: {
        id: 44,
        name: "MGO User",
        email: "mgo@example.com",
        role: "mgo",
        blackbaud_constituent_id: "800",
      },
      isActing: true,
    });

    const response = await PATCH(
      new Request("https://example.com/api/blackbaud/portfolio/solicitor-assignment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constituentId: "12345" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(listBlackbaudFundraiserAssignmentsMock).not.toHaveBeenCalled();
    expect(updateBlackbaudFundraiserAssignmentMock).not.toHaveBeenCalled();
  });
});
