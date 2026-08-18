import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const sqlMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const getBlackbaudConfigIssuesMock = vi.fn();
const getClosedFiscalYearDiagnosticMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));
vi.mock("@/app/api/utils/blackbaud", () => ({
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
}));
vi.mock("@/app/api/utils/closedFyGiftTotals", () => ({
  getClosedFiscalYearDiagnostic: getClosedFiscalYearDiagnosticMock,
}));

describe("closed FY diagnostic route", () => {
  beforeEach(() => {
    authMock.mockReset();
    sqlMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    getBlackbaudConfigIssuesMock.mockReset();
    getClosedFiscalYearDiagnosticMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 9, email: "reviewer@example.com", role: "reviewer" },
      workspaceUser: {
        id: 17,
        name: "Default Workspace User",
        email: "default@example.com",
        role: "mgo",
        active: true,
        blackbaud_constituent_id: "186057",
        blackbaud_lookup_id: "436887",
      },
      isActing: false,
    });
    getClosedFiscalYearDiagnosticMock.mockResolvedValue({
      fiscalYearLabel: "FY27",
      closedTotal: 50000,
      debug: { countedGiftRows: 1 },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows reviewers to target a user by Blackbaud lookup id", async () => {
    sqlMock.mockResolvedValueOnce([
      {
        id: 25,
        name: "Leslie M. Redd",
        email: "lredd@ju.edu",
        role: "mgo",
        active: true,
        blackbaud_constituent_id: "186057",
        blackbaud_lookup_id: "436887",
      },
    ]);

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request(
        "https://example.com/api/admin/closed-fy-diagnostic?blackbaudLookupId=436887&fiscalYear=FY27",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.targetUser).toEqual(
      expect.objectContaining({
        id: 25,
        name: "Leslie M. Redd",
        blackbaudConstituentId: "186057",
        blackbaudLookupId: "436887",
      }),
    );
    expect(getClosedFiscalYearDiagnosticMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceUser: expect.objectContaining({ id: 25 }),
        authUserId: 9,
        fiscalYearLabel: "FY27",
      }),
    );
  });

  it("falls back to the active workspace user when no selector is provided", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(
      new Request("https://example.com/api/admin/closed-fy-diagnostic"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.targetUser).toEqual(
      expect.objectContaining({
        id: 17,
        blackbaudConstituentId: "186057",
        blackbaudLookupId: "436887",
      }),
    );
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("rejects non-reviewers", async () => {
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 11, email: "mgo@example.com", role: "mgo" },
      workspaceUser: { id: 11, email: "mgo@example.com", role: "mgo" },
      isActing: false,
    });

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request("https://example.com/api/admin/closed-fy-diagnostic"),
    );

    expect(response.status).toBe(403);
    expect(getClosedFiscalYearDiagnosticMock).not.toHaveBeenCalled();
  });
});
