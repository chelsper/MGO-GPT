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
const checkClearNonmatchMock = vi.fn();

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
vi.mock("@/app/api/utils/safeConstituentCreate", () => ({ checkClearNonmatch: checkClearNonmatchMock }));

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
    checkClearNonmatchMock.mockReset();

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
      .mockResolvedValueOnce([{ id: row.id }])
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

  it("rejects the selected match, clears all target writes, and leaves a review audit without calling NXT", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    row.status = "Ready";
    row.matched_blackbaud_constituent_id = "123";
    row.preview.match = { blackbaudConstituentId: "123", name: "Not this person" };
    row.preview.currentContacts = { emails: [{ id: "old-contact" }] };
    row.preview.contactReviewDecisions = { email: { targetId: "old-contact" } };
    row.requested_writes = [{ type: "email_address", action: "replace", targetId: "old-contact" }];
    sqlMock.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: "9" }])
      .mockResolvedValueOnce([{ status: "Needs Review" }]).mockResolvedValueOnce([]);

    const response = await POST(makeRequest({ action: "reject", constituentId: "123" }), { params: { id: "42", rowId: "9" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "Needs Review", match: null });
    const [strings, encodedPreview, encodedAudit, ...args] = sqlMock.mock.calls[1];
    const preview = JSON.parse(encodedPreview);
    expect(preview).toMatchObject({ match: null, status: "Needs Review", writePlan: [], contactReviewDecisions: {}, currentContacts: { emails: [] }, intentDisposition: { allowApply: false, key: "needs_resolution" } });
    expect(preview.input).toEqual(row.preview.input);
    expect(preview.rejectedMatches[0]).toMatchObject({ constituentId: "123", reviewedByUserId: "7" });
    expect(JSON.parse(encodedAudit).matchDecisions[0].decision).toBe("rejected");
    expect(strings.join(" ")).toContain("matched_blackbaud_constituent_id = NULL");
    expect(strings.join(" ")).toContain("preview IS NOT DISTINCT FROM");
    expect(args.at(-1)).toBeNull();
    expect(getBlackbaudConstituentByIdMock).not.toHaveBeenCalled();
    expect(searchBlackbaudConstituentsMock).not.toHaveBeenCalled();
  });

  it.each([
    { created_blackbaud_constituent_id: "123" }, { create_request_started_at: "2026-09-08" },
    { create_approved_at: "2026-09-08" }, { status: "Creating" }, { status: "Applying" },
    { applied_at: "2026-09-08" }, { status: "Failed" },
    { blackbaud_result: { results: [{ status: "applied" }] } },
  ])("protects an already-created or attempted row from rejecting AND selecting: %j", async (overrides) => {
    const { POST } = await import("./route.js");
    sqlMock.mockResolvedValue([{ ...makeRow(), ...overrides }]);
    for (const action of ["reject", "select", "suggestions"]) {
      const response = await POST(makeRequest({ action, constituentId: "123" }), { params: { id: "42", rowId: "9" } });
      expect(response.status).toBe(409);
    }
    expect(sqlMock.mock.calls.every(([strings]) => strings.join(" ").includes("SELECT *"))).toBe(true);
    expect(getBlackbaudConstituentByIdMock).not.toHaveBeenCalled();
  });

  it("rejects stale or arbitrary candidate IDs", async () => {
    const { POST } = await import("./route.js");
    sqlMock.mockResolvedValue([{ ...makeRow(), matched_blackbaud_constituent_id: "456" }]);
    const response = await POST(makeRequest({ action: "reject", constituentId: "123" }), { params: { id: "42", rowId: "9" } });
    expect(response.status).toBe(409);
    expect(sqlMock).toHaveBeenCalledOnce();
  });

  it("rejects an unselected duplicate candidate and keeps the remaining suggestions across reload", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    row.create_approved_at = "2026-09-08";
    row.blackbaud_result = { type: "import_duplicate_review", matchCandidates: [
      { blackbaudConstituentId: "123", name: "First Person" }, { blackbaudConstituentId: "456", name: "Second Person" },
    ] };
    sqlMock.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: "9" }]).mockResolvedValueOnce([{ status: "Needs Review" }]).mockResolvedValueOnce([]);
    const response = await POST(makeRequest({ action: "reject", constituentId: "123" }), { params: { id: "42", rowId: "9" } });
    expect(response.status).toBe(200);
    const saved = JSON.parse(sqlMock.mock.calls[1][1]);
    expect(saved).toMatchObject({ match: null, writePlan: [], intentDisposition: { allowApply: false }, matchCandidates: [{ blackbaudConstituentId: "123" }, { blackbaudConstituentId: "456" }] });
    expect(sqlMock.mock.calls[1][0].join(" ")).toContain("create_approved_at = NULL");
    sqlMock.mockReset().mockResolvedValue([{ ...row, create_approved_at: null, preview: saved }]);
    const reloaded = await POST(makeRequest({ action: "suggestions" }), { params: { id: "42", rowId: "9" } });
    expect(await reloaded.json()).toMatchObject({ results: [{ blackbaudConstituentId: "456" }] });
    expect(sqlMock).toHaveBeenCalledOnce();
    expect(getBlackbaudConstituentByIdMock).not.toHaveBeenCalled();
    expect(checkClearNonmatchMock).not.toHaveBeenCalled();
  });

  it("rejects an alternative without changing the selected target, status, or staged writes", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    row.status = "Ready";
    row.matched_blackbaud_constituent_id = "456";
    row.preview.match = { blackbaudConstituentId: "456", name: "Selected" };
    row.preview.matchCandidates = [{ blackbaudConstituentId: "123", name: "Alternative" }];
    row.preview.writePlan = [{ type: "email", targetId: "existing-contact" }];
    sqlMock.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: "9" }]);
    const response = await POST(makeRequest({ action: "reject", constituentId: "123" }), { params: { id: "42", rowId: "9" } });
    expect(await response.json()).toMatchObject({ status: "Ready", match: { blackbaudConstituentId: "456" } });
    const saved = JSON.parse(sqlMock.mock.calls[1][1]);
    expect(saved.match).toEqual(row.preview.match);
    expect(saved.writePlan).toEqual(row.preview.writePlan);
    expect(saved.rejectedMatches).toEqual([expect.objectContaining({ constituentId: "123" })]);
    const statement = sqlMock.mock.calls[1][0].join(" ");
    expect(statement).not.toContain("requested_writes =");
    expect(statement).not.toContain("matched_blackbaud_constituent_id =");
    expect(statement).toContain("preview IS NOT DISTINCT FROM");
  });

  it("recovers legacy quick-import suggestions automatically using the saved identity checks only", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    row.create_approved_at = "2026-09-08";
    row.quick_create_status = "review";
    row.blackbaud_error = "NXT found a possible email match. Held for review.";
    row.preview.input = { firstName: "Jane", lastName: "Dolphin", email: "jane@example.com", duplicateCheckVersion: 1 };
    checkClearNonmatchMock.mockImplementation(async ({ onCandidates }) => { onCandidates([{ blackbaudConstituentId: "123", name: "Suggested Person" }]); return row.blackbaud_error; });
    sqlMock.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: "9" }]);
    const response = await POST(makeRequest({ action: "suggestions", query: "ignore this browser input" }), { params: { id: "42", rowId: "9" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ results: [{ blackbaudConstituentId: "123" }] });
    expect(checkClearNonmatchMock).toHaveBeenCalledWith(expect.objectContaining({ input: row.preview.input, credentials: { userId: 7, authUserId: 7, origin: "https://example.com" } }));
    const saved = JSON.parse(sqlMock.mock.calls[1][1]);
    expect(saved.matchCandidates).toEqual([{ blackbaudConstituentId: "123", name: "Suggested Person" }]);
    expect(saved.matchSuggestionsCheckedAt).toBeTruthy();
    expect(saved.writePlan).toEqual(row.preview.writePlan);
    expect(searchBlackbaudConstituentsMock).not.toHaveBeenCalled();
    expect(getBlackbaudConstituentByIdMock).not.toHaveBeenCalled();
  });

  it("does not save failed/throttled lookups as empty suggestions", async () => {
    const { POST } = await import("./route.js");
    sqlMock.mockResolvedValue([{ ...makeRow(), preview: { input: { duplicateCheckVersion: 1 } } }]);
    checkClearNonmatchMock.mockRejectedValue(Object.assign(new Error("429 Secret donor response"), { httpStatus: 429 }));
    const response = await POST(makeRequest({ action: "suggestions" }), { params: { id: "42", rowId: "9" } });
    expect(response.status).toBe(429);
    expect(await response.text()).not.toContain("Secret donor");
    expect(sqlMock).toHaveBeenCalledOnce();
  });

  it("rejects a stale suggestion checkpoint rather than overwriting new review choices", async () => {
    const { POST } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([{ ...makeRow(), preview: { input: { constituentName: "Jane Dolphin" } } }]).mockResolvedValueOnce([]);
    searchBlackbaudConstituentsMock.mockResolvedValue([{ blackbaudConstituentId: "123" }]);
    const response = await POST(makeRequest({ action: "suggestions" }), { params: { id: "42", rowId: "9" } });
    expect(response.status).toBe(409);
    expect(sqlMock.mock.calls[1][0].join(" ")).toContain("preview IS NOT DISTINCT FROM");
  });

  it("does not overwrite a row that changed while rejection was being saved", async () => {
    const { POST } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([{ ...makeRow(), matched_blackbaud_constituent_id: "123" }]).mockResolvedValueOnce([]);
    const response = await POST(makeRequest({ action: "reject", constituentId: "123" }), { params: { id: "42", rowId: "9" } });
    expect(response.status).toBe(409);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it("allows a different verified selection after rejection without keeping old replacement IDs", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    row.preview.matchReview = { decision: "rejected" };
    row.preview.contactReviewDecisions = { email: { targetId: "old-id" } };
    row.requested_writes = [{ type: "email_address", action: "replace", targetId: "old-id" }];
    sqlMock.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ id: "9" }])
      .mockResolvedValueOnce([{ status: "Needs Review" }]).mockResolvedValueOnce([]);
    getBlackbaudConstituentByIdMock.mockResolvedValue({ blackbaudConstituentId: "456", name: "Verified new selection", raw: { id: "456" } });
    const response = await POST(makeRequest({ action: "select", constituentId: "456" }), { params: { id: "42", rowId: "9" } });
    expect(response.status).toBe(200);
    const preview = JSON.parse(sqlMock.mock.calls[1][7]);
    expect(preview.matchReview.decision).toBe("selected");
    expect(preview.contactReviewDecisions).toEqual({});
    expect(preview.writePlan).toEqual([]);
  });

  it("restricts match decisions to authenticated reviewers", async () => {
    const { POST } = await import("./route.js");
    authMock.mockResolvedValueOnce(null);
    expect((await POST(makeRequest({ action: "reject", constituentId: "123" }), { params: { id: "42", rowId: "9" } })).status).toBe(401);
    getWorkspaceUserMock.mockResolvedValueOnce({ sessionUser: { id: 8, role: "mgo" } });
    expect((await POST(makeRequest({ action: "reject", constituentId: "123" }), { params: { id: "42", rowId: "9" } })).status).toBe(403);
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
