import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();
const findBlackbaudConstituentByLookupIdMock = vi.fn();
const getBlackbaudConstituentByIdMock = vi.fn();
const isBlackbaudQuotaExceededErrorMock = vi.fn();
const searchBlackbaudConstituentsMock = vi.fn();
const buildOrganizationRelationshipWriteMock = vi.fn();
const buildProfileDetailWritesMock = vi.fn();
const hasUsableProfileSnapshotMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: getWorkspaceUserMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/app/api/utils/blackbaud", () => ({
  findBlackbaudConstituentByLookupId: findBlackbaudConstituentByLookupIdMock,
  getBlackbaudConstituentById: getBlackbaudConstituentByIdMock,
  isBlackbaudQuotaExceededError: isBlackbaudQuotaExceededErrorMock,
  searchBlackbaudConstituents: searchBlackbaudConstituentsMock,
}));
vi.mock("@/app/api/constituency-import/preview/route", () => ({
  buildOrganizationRelationshipWrite: buildOrganizationRelationshipWriteMock,
  buildProfileDetailWrites: buildProfileDetailWritesMock,
  hasUsableProfileSnapshot: hasUsableProfileSnapshotMock,
}));
vi.mock("@/app/api/constituency-import/quotaPause", () => ({
  getQuotaPauseNotice: vi.fn(() => "NXT calls are temporarily paused."),
}));

function makeRequest(body) {
  return new Request(
    "https://example.com/api/constituency-import/runs/42/rows/9/match",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function makeRow() {
  return {
    id: "9",
    run_id: "42",
    status: "Needs Review",
    preview: {
      input: {
        nameUpdate: { firstName: "Joseph", lastName: "Heap" },
        sourceConstituency: "Student",
        targetConstituency: "Alumni Bachelor's Degree",
      },
      matchStatus: "unresolved",
      matchMethod: "NXT lookup deferred",
      confidence: 0,
      deferredHydration: { detail: true, contacts: false, educations: false, codes: true },
      writePlan: [{ type: "profile_detail_review", requiresReview: true }],
      reasons: [
        "NXT could not confirm this match during the fast import preview: Blackbaud 429 Too Many Requests.",
        "This row is held for review and cannot be treated as a new record automatically.",
      ],
    },
    requested_writes: [{ type: "profile_detail_review", requiresReview: true }],
    blackbaud_result: null,
  };
}

describe("manual NXT import match route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    sqlMock.mockReset();
    findBlackbaudConstituentByLookupIdMock.mockReset();
    getBlackbaudConstituentByIdMock.mockReset();
    isBlackbaudQuotaExceededErrorMock.mockReset();
    searchBlackbaudConstituentsMock.mockReset();
    buildOrganizationRelationshipWriteMock.mockReset();
    buildProfileDetailWritesMock.mockReset();
    hasUsableProfileSnapshotMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 7, email: "reviewer@example.com", role: "reviewer" },
    });
    isBlackbaudQuotaExceededErrorMock.mockReturnValue(false);
    buildOrganizationRelationshipWriteMock.mockReturnValue(null);
    buildProfileDetailWritesMock.mockReturnValue([]);
    hasUsableProfileSnapshotMock.mockReturnValue(true);
  });

  it("returns scoped NXT name search candidates without changing the import row", async () => {
    const { POST } = await import("./route.js");
    searchBlackbaudConstituentsMock.mockResolvedValue([
      {
        blackbaudConstituentId: "5566",
        lookupId: "JH-104",
        name: "Joseph Heap",
        email: "jheap@example.com",
      },
    ]);

    const response = await POST(makeRequest({ action: "search", query: "Joseph Heap" }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.results).toEqual([
      expect.objectContaining({
        blackbaudConstituentId: "5566",
        lookupId: "JH-104",
        name: "Joseph Heap",
      }),
    ]);
    expect(searchBlackbaudConstituentsMock).toHaveBeenCalledWith({
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      query: "Joseph Heap",
    });
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("persists the reviewer-selected match without sending an NXT write", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    sqlMock
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Needs Review" }])
      .mockResolvedValueOnce([]);
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "5566",
      lookupId: "JH-104",
      name: "Joseph Heap",
      email: "jheap@example.com",
      raw: {
        id: "5566",
        lookup_id: "JH-104",
        type: "Individual",
        first: "Joseph",
        last: "Heap",
      },
    });

    const response = await POST(makeRequest({ action: "select", constituentId: "5566" }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "Needs Review",
      match: { blackbaudConstituentId: "5566", lookupId: "JH-104" },
    });
    expect(getBlackbaudConstituentByIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ constituentId: "5566" }),
    );

    const updateCall = sqlMock.mock.calls.find(([strings]) =>
      strings.join("").includes("UPDATE constituency_import_rows"),
    );
    expect(updateCall).toBeTruthy();
    const savedPreview = JSON.parse(updateCall[7]);
    const savedWrites = JSON.parse(updateCall[8]);
    const savedResult = JSON.parse(updateCall[9]);
    expect(savedPreview).toMatchObject({
      matchStatus: "matched",
      matchMethod: "Reviewer-selected NXT match",
      confidence: 100,
      match: { blackbaudConstituentId: "5566", lookupId: "JH-104" },
      profileSnapshotLoaded: true,
    });
    expect(savedPreview.reasons.join(" ")).not.toContain("Too Many Requests");
    expect(savedWrites).toEqual([]);
    expect(savedResult.manualMatch).toMatchObject({
      constituentId: "5566",
      selectedByUserId: "7",
    });
  });
});
