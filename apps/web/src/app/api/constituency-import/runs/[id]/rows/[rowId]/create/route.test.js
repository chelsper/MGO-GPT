import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();
const findBlackbaudConstituentByEmailMock = vi.fn();
const findBlackbaudConstituentByLookupIdMock = vi.fn();
const getBlackbaudConstituentByIdMock = vi.fn();
const searchBlackbaudConstituentsMock = vi.fn();
const claimMock = vi.fn();
const renewMock = vi.fn();
const releaseMock = vi.fn();
const checkMock = vi.fn();
const formatsMock = vi.fn();
const checkpointMock = vi.fn();
const localMatchMock = vi.fn();
const recordCreatedMock = vi.fn();
const rejectCreateMock = vi.fn();
vi.mock("@/app/api/utils/safeConstituentCreate", () => ({
  claimConstituentCreateLease: claimMock,
  renewConstituentCreateLease: renewMock,
  releaseConstituentCreateLease: releaseMock,
  checkClearNonmatch: checkMock,
  configuredNameFormatPayload: formatsMock,
  markConstituentCreateStarted: checkpointMock,
  findLocalImportDuplicate: localMatchMock,
  recordCreatedConstituent: recordCreatedMock,
  recordRejectedConstituentCreate: rejectCreateMock,
}));

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
  default: sqlMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  blackbaudApiFetch: blackbaudApiFetchMock,
  findBlackbaudConstituentByEmail: findBlackbaudConstituentByEmailMock,
  findBlackbaudConstituentByLookupId: findBlackbaudConstituentByLookupIdMock,
  getBlackbaudConstituentById: getBlackbaudConstituentByIdMock,
  searchBlackbaudConstituents: searchBlackbaudConstituentsMock,
}));

function makeRequest() {
  return new Request(
    "https://example.com/api/constituency-import/runs/42/rows/9/create",
    { method: "POST" },
  );
}

function makeRow(overrides = {}) {
  return {
    id: "9",
    run_id: "42",
    status: "Needs Review",
    preview: {
      rowNumber: 1,
      intentDisposition: { key: "potential_new" },
      input: {
        firstName: "Jane",
        duplicateCheckVersion: 1,
        lastName: "Dolphin",
        preferredName: "Janie",
        title: "Dr.",
        gender: "Female",
        birthDate: "07/23/80",
        suffix: "Ph.D.",
        email: "jane@example.com",
      },
      writePlan: [
        {
          type: "constituent_code",
          action: "add",
          targetConstituency: "Alumni - Graduate Degree",
        },
      ],
      reasons: [],
    },
    requested_writes: [
      {
        type: "constituent_code",
        action: "add",
        targetConstituency: "Alumni - Graduate Degree",
      },
    ],
    created_blackbaud_constituent_id: null,
    ...overrides,
  };
}

describe("constituency import new-record create route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    sqlMock.mockReset();
    blackbaudApiFetchMock.mockReset();
    findBlackbaudConstituentByEmailMock.mockReset();
    findBlackbaudConstituentByLookupIdMock.mockReset();
    getBlackbaudConstituentByIdMock.mockReset();
    searchBlackbaudConstituentsMock.mockReset();
    claimMock.mockReset().mockResolvedValue("owned");
    renewMock.mockReset().mockResolvedValue();
    releaseMock.mockReset().mockResolvedValue();
    checkMock.mockReset().mockResolvedValue(null);
    formatsMock.mockReset().mockResolvedValue({});
    checkpointMock.mockReset().mockResolvedValue();
    localMatchMock.mockReset().mockResolvedValue(null);
    recordCreatedMock.mockReset().mockResolvedValue();
    rejectCreateMock.mockReset().mockResolvedValue();

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: {
        id: 7,
        name: "Reviewer",
        email: "reviewer@example.com",
        role: "reviewer",
      },
    });
    findBlackbaudConstituentByEmailMock.mockResolvedValue(null);
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue(null);
    getBlackbaudConstituentByIdMock.mockResolvedValue(null);
  });

  it("creates one reviewed individual record only after a final duplicate check", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    sqlMock
      .mockResolvedValueOnce([{ id: "42" }])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ ...row, status: "Creating" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);
    searchBlackbaudConstituentsMock.mockResolvedValue([]);
    blackbaudApiFetchMock.mockResolvedValue({ id: "456", lookup_id: "NEW-456" });

    const response = await POST(makeRequest(), { params: { id: "42", rowId: "9" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(checkMock).toHaveBeenCalledWith(expect.objectContaining({ input: row.preview.input, rowId: "9", runId: "42" }));
    expect(searchBlackbaudConstituentsMock).not.toHaveBeenCalled();
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith("/constituent/v1/constituents", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "POST",
      maxRetries: 0,
      timeoutMs: 20000,
      body: {
        type: "Individual",
        first: "Jane",
        last: "Dolphin",
        preferred_name: "Janie",
        title: "Dr.",
        gender: "Female",
        suffix: "Ph.D.",
        birthdate: { y: 1980, m: 7, d: 23 },
      },
    });
    expect(payload.createdConstituentId).toBe("456");
    expect(payload.createdLookupId).toBe("NEW-456");
  });

  it("allows an external source ID without sending it to NXT", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    row.preview.input.externalConstituentId = "SIS-100001";
    row.preview.input.targetConstituency = "Alumni - Graduate Degree";
    sqlMock
      .mockResolvedValueOnce([{ id: "42" }])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ ...row, status: "Creating" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);
    searchBlackbaudConstituentsMock.mockResolvedValue([]);
    blackbaudApiFetchMock.mockResolvedValue({ id: "456", lookup_id: "NEW-456" });

    const response = await POST(makeRequest(), { params: { id: "42", rowId: "9" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.externalSourceId).toBe("SIS-100001");
    expect(payload.message).toContain("Alumni - Graduate Degree remains staged");
    const createCall = blackbaudApiFetchMock.mock.calls.find(
      ([path]) => path === "/constituent/v1/constituents",
    );
    expect(createCall?.[1]?.body).not.toHaveProperty("externalConstituentId");
    expect(createCall?.[1]?.body).not.toHaveProperty("targetConstituency");
  });

  it("assigns an unresolved supplied lookup ID to a reviewed new record after final duplicate checks", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    row.preview.input.lookupId = "593441";
    sqlMock
      .mockResolvedValueOnce([{ id: "42" }])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ ...row, status: "Creating" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);
    searchBlackbaudConstituentsMock.mockResolvedValue([]);
    blackbaudApiFetchMock.mockResolvedValue({ id: "456", lookup_id: "NEW-456" });

    const response = await POST(makeRequest(), { params: { id: "42", rowId: "9" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(checkMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ lookupId: "593441" }) }));
    expect(getBlackbaudConstituentByIdMock).not.toHaveBeenCalled();
    expect(payload.unresolvedNxtIdentifier).toEqual({
      blackbaudConstituentId: null,
      lookupId: "593441",
    });
    expect(payload.message).toContain("assigned Lookup ID NEW-456");
    const createCall = blackbaudApiFetchMock.mock.calls.find(
      ([path]) => path === "/constituent/v1/constituents",
    );
    expect(createCall?.[1]?.body).not.toHaveProperty("id");
    expect(createCall?.[1]?.body).toHaveProperty("lookup_id", "593441");
  });

  it("creates a clean unmatched row that is ready for new-record creation", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow({
      status: "Ready",
      preview: {
        ...makeRow().preview,
        intentDisposition: { key: "ready_new" },
      },
    });
    row.preview.input.lookupId = "593441";
    sqlMock
      .mockResolvedValueOnce([{ id: "42" }])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ ...row, status: "Creating" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);
    searchBlackbaudConstituentsMock.mockResolvedValue([]);
    blackbaudApiFetchMock.mockResolvedValue({ id: "456", lookup_id: "593441" });

    const response = await POST(makeRequest(), { params: { id: "42", rowId: "9" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.createdConstituentId).toBe("456");
    const createCall = blackbaudApiFetchMock.mock.calls.find(
      ([path]) => path === "/constituent/v1/constituents",
    );
    expect(createCall?.[1]?.body).toHaveProperty("lookup_id", "593441");
  });

  it("does not send an unresolved NXT system record ID in a new-record create payload", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    row.preview.input.blackbaudConstituentId = "593441";
    sqlMock
      .mockResolvedValueOnce([{ id: "42" }])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ ...row, status: "Creating" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);
    searchBlackbaudConstituentsMock.mockResolvedValue([]);
    blackbaudApiFetchMock.mockResolvedValue({ id: "456", lookup_id: "NEW-456" });

    const response = await POST(makeRequest(), { params: { id: "42", rowId: "9" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.message).toContain("retained in the import audit only");
    const createCall = blackbaudApiFetchMock.mock.calls.find(
      ([path]) => path === "/constituent/v1/constituents",
    );
    expect(createCall?.[1]?.body).not.toHaveProperty("id");
    expect(createCall?.[1]?.body).not.toHaveProperty("lookup_id");
  });

  it("returns an exact email duplicate to review without creating a record", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    sqlMock
      .mockResolvedValueOnce([{ id: "42" }])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ ...row, status: "Creating" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Needs Review" }])
      .mockResolvedValueOnce([]);
    checkMock.mockImplementation(async ({ onCandidates }) => { onCandidates([{
      blackbaudConstituentId: "123",
      lookupId: "DUP-123",
      name: "Different Name",
      email: "jane@example.com",
    }]); return "NXT found a possible email match. Held for review."; });

    const response = await POST(makeRequest(), { params: { id: "42", rowId: "9" } });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("email match");
    expect(searchBlackbaudConstituentsMock).not.toHaveBeenCalled();
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it("returns a final duplicate candidate to review without creating a record", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    sqlMock
      .mockResolvedValueOnce([{ id: "42" }])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ ...row, status: "Creating" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Needs Review" }])
      .mockResolvedValueOnce([]);
    checkMock.mockImplementation(async ({ onCandidates }) => { onCandidates([
      {
        blackbaudConstituentId: "123",
        lookupId: "DUP-123",
        name: "Jane Dolphin",
        email: "jane@example.com",
      },
    ]); return "NXT found a possible first and last name match. Held for review."; });

    const response = await POST(makeRequest(), { params: { id: "42", rowId: "9" } });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("first and last name match");
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  function setupQuick(row = makeRow()) {
    row.preview.input.duplicateCheckVersion = 1;
    sqlMock.mockImplementation((strings) => {
      const query = strings.join(" ");
      if (query.includes("SELECT id, defaults")) return Promise.resolve([{ id: "42", defaults: { importIntent: "new" }, status: "ready" }]);
      if (query.includes("SELECT *")) return Promise.resolve([row]);
      if (query.includes("RETURNING *")) return Promise.resolve([row]);
      if (query.includes("SELECT status")) return Promise.resolve([{ status: "Ready" }]);
      return Promise.resolve([]);
    });
    blackbaudApiFetchMock.mockResolvedValue({ id: "456" });
    checkpointMock.mockImplementation(async () => { row.create_request_started_at = "2026-09-07T12:00:00Z"; });
    return row;
  }
  const quickRequest = () => new Request(`${makeRequest().url}?mode=clear_nonmatches`, { method: "POST" });
  const completeRequest = () => new Request(`${makeRequest().url}?mode=clear_nonmatches&complete=1`, { method: "POST" });

  it("accepts multiple contacts without dropping them and saves the approval for automatic completion", async () => {
    const row = setupQuick();
    row.preview.input.emailUpdates = [
      { address: "jane@example.com", type: "Work", makePrimary: true },
      { address: "jane2@example.com", type: "Home", makePrimary: false },
    ];
    row.preview.reasons = ["No likely NXT match was found; this import does not create records."];
    row.quick_create_status = "review";
    row.blackbaud_error = "Multiple contacts of one kind need individual review before quick creation. No NXT record was created.";
    const { POST } = await import("./route.js");
    expect(await (await POST(completeRequest(), { params: { id: "42", rowId: "9" } })).json()).toMatchObject({ next: "details", createdConstituentId: "456" });
    expect(checkMock).toHaveBeenCalledOnce();
    expect(blackbaudApiFetchMock.mock.calls[0][1].body).not.toHaveProperty("email");
    const save = sqlMock.mock.calls.find(([query]) => query.join(" ").includes("match_method = 'Created NXT record'"));
    const preview = save.map((value) => { try { return JSON.parse(value); } catch { return null; } }).find((value) => value?.quickImportWorkflow);
    expect(preview.input.emailUpdates).toHaveLength(2);
    expect(preview.quickImportWorkflow).toMatchObject({ phase: "details", approvedByUserId: "7", constituentId: "456", scopes: ["contacts"] });
    expect(preview.writePlan.some((write) => write.type === "contact_detail_review")).toBe(true);
    expect(preview.reasons.join(" ")).not.toContain("does not create records");
  });

  it("holds conflicting primary selections before any NXT reads or create lock", async () => {
    const row = setupQuick();
    row.preview.input.emailUpdates = [
      { address: "jane@example.com", type: "Work", makePrimary: true },
      { address: "jane2@example.com", type: "Home", makePrimary: true },
    ];
    const { POST } = await import("./route.js");
    expect(await (await POST(completeRequest(), { params: { id: "42", rowId: "9" } })).json()).toMatchObject({ held: true, error: expect.stringContaining("one primary email") });
    expect(checkMock).not.toHaveBeenCalled();
    expect(claimMock).not.toHaveBeenCalled();
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it("does not turn an existing duplicate hold into automatic approval", async () => {
    const row = setupQuick(); row.quick_create_status = "review"; row.blackbaud_error = "Possible email match";
    const { POST } = await import("./route.js");
    expect((await POST(completeRequest(), { params: { id: "42", rowId: "9" } })).status).toBe(409);
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  async function setupReviewed() {
    const row = setupQuick();
    row.preview.intentDisposition = { key: "needs_resolution", allowApply: false };
    const { newRecordReviewFingerprint } = await import("@/app/api/utils/reviewedConstituentCreate");
    row.preview.newRecordReview = { status: "clear", token: "token", checkedAt: new Date().toISOString(), fingerprint: newRecordReviewFingerprint(row) };
    return row;
  }
  const reviewedRequest = (body = {}) => new Request(`${makeRequest().url}?mode=reviewed_new`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true, reviewToken: "token", ...body }) });

  it("creates a confirmed unmatched row using complete checks and an audit checkpoint", async () => {
    await setupReviewed();
    const { POST } = await import("./route.js");
    expect((await POST(reviewedRequest(), { params: { id: "42", rowId: "9" } })).status).toBe(200);
    expect(checkMock).toHaveBeenCalledWith(expect.objectContaining({ reviewedCandidateIds: [] }));
    expect(searchBlackbaudConstituentsMock).not.toHaveBeenCalled();
    const claimIndex = sqlMock.mock.calls.findIndex(([query]) => query.join(" ").includes("RETURNING *"));
    expect(sqlMock.mock.calls[claimIndex][0].join(" ")).toContain("blackbaud_result = CASE WHEN");
    expect(sqlMock.mock.calls[claimIndex].some((value) => typeof value === "string" && value.includes('"reviewedNewApproval"'))).toBe(true);
    expect(sqlMock.mock.invocationCallOrder[claimIndex]).toBeLessThan(blackbaudApiFetchMock.mock.invocationCallOrder[0]);
    expect(checkpointMock.mock.invocationCallOrder[0]).toBeLessThan(blackbaudApiFetchMock.mock.invocationCallOrder[0]);
  });
  it("check-only mode requires reviewer access and cannot claim or create anything", async () => {
    setupQuick();
    const impl = sqlMock.getMockImplementation();
    sqlMock.mockImplementation((strings, ...args) => strings.join(" ").includes("RETURNING id") ? Promise.resolve([{ id: "9" }]) : impl(strings, ...args));
    const request = () => new Request(`${makeRequest().url}?mode=review_new_check`, { method: "POST" });
    const { POST } = await import("./route.js");
    getWorkspaceUserMock.mockResolvedValueOnce({ sessionUser: { id: 8, role: "mgo" } });
    expect((await POST(request(), { params: { id: "42", rowId: "9" } })).status).toBe(403);
    const response = await POST(request(), { params: { id: "42", rowId: "9" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ review: { status: "clear" } });
    expect(claimMock).not.toHaveBeenCalled();
    expect(checkpointMock).not.toHaveBeenCalled();
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });
  it("allows manual review again after a confirmed provider rejection, not an uncertain outcome", async () => {
    await setupReviewed();
    blackbaudApiFetchMock.mockRejectedValue(Object.assign(new Error("Bad field"), { httpStatus: 400 }));
    const { POST } = await import("./route.js");
    expect((await POST(reviewedRequest(), { params: { id: "42", rowId: "9" } })).status).toBe(502);
    expect(rejectCreateMock).toHaveBeenCalledWith("9");
    const returned = sqlMock.mock.calls.find(([query]) => query.join(" ").includes("create_approved_at = CASE"));
    expect(returned[4]).toBe(true);
    const blocked = sqlMock.mock.calls.find(([query]) => query.join(" ").includes("jsonb_set(preview, '{newRecordReview}'"));
    expect(JSON.parse(blocked[1])).toMatchObject({ status: "blocked", nextAction: "correct_csv" });
    expect(blackbaudApiFetchMock).toHaveBeenCalledOnce();
  });
  it.each(["review_local_check", "review_local_reject"])("protects %s with reviewer access and never falls through to creation", async (mode) => {
    setupQuick();
    const { POST } = await import("./route.js");
    const request = () => new Request(`${makeRequest().url}?mode=${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    getWorkspaceUserMock.mockResolvedValueOnce({ sessionUser: { id: 8, role: "mgo" } });
    expect((await POST(request(), { params: { id: "42", rowId: "9" } })).status).toBe(403);
    expect((await POST(request(), { params: { id: "42", rowId: "9" } })).status).toBe(409);
    expect(claimMock).not.toHaveBeenCalled();
    expect(checkpointMock).not.toHaveBeenCalled();
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });
  it("uses only server-saved local decisions in the final leased check and stores them in the approval audit", async () => {
    const row = await setupReviewed();
    row.preview.reviewedLocalDuplicates = [{ fingerprint: "saved", note: "Different person verified." }];
    const { newRecordReviewFingerprint } = await import("@/app/api/utils/reviewedConstituentCreate");
    row.preview.newRecordReview.fingerprint = newRecordReviewFingerprint(row);
    const { POST } = await import("./route.js");
    const response = await POST(reviewedRequest({ reviewNote: "Verified separate people and all holds.", reviewedLocalDuplicates: [{ fingerprint: "forged" }] }), { params: { id: "42", rowId: "9" } });
    expect(response.status).toBe(200);
    expect(checkMock).toHaveBeenCalledWith(expect.objectContaining({ reviewedLocalDuplicates: row.preview.reviewedLocalDuplicates }));
    const claim = sqlMock.mock.calls.find(([query]) => query.join(" ").includes("blackbaud_result = CASE WHEN"));
    expect(claim.some((value) => typeof value === "string" && value.includes('"localDuplicateDecisions":[{"fingerprint":"saved"'))).toBe(true);
  });
  it("rebuilds deferred source writes after rejected matches and never reuses their NXT IDs", async () => {
    const row = await setupReviewed();
    row.preview.input.lookupId = "55";
    row.preview.input.emailUpdates = [{ address: "jane@example.com", type: "Email" }];
    row.preview.input.targetConstituency = "Student";
    row.preview.input.action = "add";
    row.preview.matchReview = { decision: "rejected" };
    row.preview.rejectedMatches = [{ decision: "rejected", constituentId: "55", reviewedAt: "2026-09-09", reviewedByUserId: "7" }];
    row.preview.matchCandidates = [{ blackbaudConstituentId: "55" }];
    row.requested_writes = [];
    const { newRecordReviewFingerprint } = await import("@/app/api/utils/reviewedConstituentCreate");
    row.preview.newRecordReview.fingerprint = newRecordReviewFingerprint(row);
    const { POST } = await import("./route.js");
    expect((await POST(reviewedRequest({ reviewNote: "Compared contact details; these are different people.", reviewedCandidateIds: ["evil"] }), { params: { id: "42", rowId: "9" } })).status).toBe(200);
    expect(checkMock).toHaveBeenCalledWith(expect.objectContaining({ reviewedCandidateIds: ["55"] }));
    expect(blackbaudApiFetchMock.mock.calls[0][1].body.lookup_id).toBeUndefined();
    const saved = sqlMock.mock.calls.find(([query]) => query.join(" ").includes("match_method = 'Created NXT record'"));
    const nextPreview = saved.filter((value) => typeof value === "string" && value.startsWith("{")).map((value) => JSON.parse(value)).find((value) => value.matchStatus === "matched");
    expect(nextPreview).toMatchObject({ status: "Needs Review", matchReview: { decision: "created" }, match: { blackbaudConstituentId: "456" } });
    expect(nextPreview.writePlan.map((write) => write.type)).toEqual(expect.arrayContaining(["contact_detail_review", "constituent_code_detail_review"]));
  });
  it("requires a current check token and explicit confirmation before any create work", async () => {
    await setupReviewed();
    const { POST } = await import("./route.js");
    expect((await POST(reviewedRequest({ confirmed: false }), { params: { id: "42", rowId: "9" } })).status).toBe(409);
    expect((await POST(reviewedRequest({ reviewToken: "forged" }), { params: { id: "42", rowId: "9" } })).status).toBe(409);
    expect(claimMock).not.toHaveBeenCalled();
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });
  it("stops and invalidates a checked approval when the final check discovers another person", async () => {
    await setupReviewed();
    checkMock.mockImplementation(async ({ onCandidates }) => { onCandidates([{ blackbaudConstituentId: "77" }]); return "New possible name match"; });
    const { POST } = await import("./route.js");
    expect((await POST(reviewedRequest(), { params: { id: "42", rowId: "9" } })).status).toBe(409);
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
    expect(sqlMock.mock.calls.some(([query]) => query.join(" ").includes("jsonb_set(preview, '{newRecordReview}'"))).toBe(true);
  });
  it("does not post when the approval or pre-POST checkpoint cannot be saved", async () => {
    await setupReviewed();
    checkpointMock.mockRejectedValue(new Error("DB checkpoint failed"));
    const { POST } = await import("./route.js");
    expect((await POST(reviewedRequest(), { params: { id: "42", rowId: "9" } })).status).toBe(502);
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });
  it("does not repeat an uncertain reviewed create", async () => {
    await setupReviewed();
    blackbaudApiFetchMock.mockRejectedValue(new Error("Lost response"));
    const { POST } = await import("./route.js");
    expect((await POST(reviewedRequest(), { params: { id: "42", rowId: "9" } })).status).toBe(502);
    expect((await POST(reviewedRequest(), { params: { id: "42", rowId: "9" } })).status).toBe(409);
    expect(blackbaudApiFetchMock).toHaveBeenCalledOnce();
  });

  it("quick-creates one row with configured formats and selected contacts, after its checkpoint", async () => {
    const row = setupQuick();
    row.preview.input.emailUpdates = [{ address: "jane@example.com", type: "Email" }];
    formatsMock.mockResolvedValue({ primary_addressee: { custom_format: false, configuration_id: "5" } });
    const { POST } = await import("./route.js");
    expect((await POST(quickRequest(), { params: { id: "42", rowId: "9" } })).status).toBe(200);
    expect(checkMock).toHaveBeenCalledOnce();
    expect(searchBlackbaudConstituentsMock).not.toHaveBeenCalled();
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith("/constituent/v1/constituents", expect.objectContaining({ maxRetries: 0, body: expect.objectContaining({
      primary_addressee: { custom_format: false, configuration_id: "5" },
      email: { address: "jane@example.com", type: "Email", primary: true },
    }) }));
    expect(checkpointMock.mock.invocationCallOrder[0]).toBeLessThan(blackbaudApiFetchMock.mock.invocationCallOrder[0]);
    expect(releaseMock).toHaveBeenCalledWith("owned");
  });
  it("holds a quick match and persists the review checkpoint without any create", async () => {
    setupQuick();
    const candidates = [{ blackbaudConstituentId: "123", name: "Suggested Person", address: "42 Main St" }];
    checkMock.mockImplementation(async ({ onCandidates }) => {
      onCandidates(candidates);
      return "NXT found a matching address. Held for review.";
    });
    const { POST } = await import("./route.js");
    const response = await POST(quickRequest(), { params: { id: "42", rowId: "9" } });
    expect(await response.json()).toMatchObject({ held: true });
    expect(sqlMock.mock.calls.some(([query]) => query.join(" ").includes("quick_create_status = 'review'"))).toBe(true);
    expect(checkpointMock).not.toHaveBeenCalled();
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
    const saved = sqlMock.mock.calls.find(([query]) => query.join(" ").includes("create_approved_at = CASE"));
    expect(JSON.parse(saved[2])).toMatchObject({ type: "import_duplicate_review", matchCandidates: candidates });
    expect(saved[4]).toBe(true);
  });
  it.each([403, 429])("pauses instead of treating NXT %s as a nonmatch", async (status) => {
    setupQuick();
    checkMock.mockRejectedValue(Object.assign(new Error("Throttled"), { httpStatus: status, retryAfterMs: 30000 }));
    const { POST } = await import("./route.js");
    const response = await POST(quickRequest(), { params: { id: "42", rowId: "9" } });
    expect(await response.json()).toMatchObject({ paused: true, held: false, retryAfterMs: 30000 });
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
    expect(sqlMock.mock.calls.some(([query]) => query.join(" ").includes("quick_create_status = 'review'"))).toBe(false);
  });
  it("never retries an uncertain POST, including a later request for the same row", async () => {
    setupQuick();
    blackbaudApiFetchMock.mockRejectedValue(new Error("Request timed out"));
    const { POST } = await import("./route.js");
    const response = await POST(quickRequest(), { params: { id: "42", rowId: "9" } });
    expect(await response.json()).toMatchObject({ held: true });
    expect((await POST(quickRequest(), { params: { id: "42", rowId: "9" } })).status).toBe(409);
    expect(blackbaudApiFetchMock).toHaveBeenCalledOnce();
    expect(rejectCreateMock).not.toHaveBeenCalled();
  });
  it("allows manual correction after a confirmed rejection, without an automatic retry", async () => {
    setupQuick();
    blackbaudApiFetchMock.mockRejectedValue(Object.assign(new Error("Invalid type"), { httpStatus: 400 }));
    const { POST } = await import("./route.js");
    const response = await POST(quickRequest(), { params: { id: "42", rowId: "9" } });
    expect((await response.json()).error).toContain("No new record was created");
    expect(rejectCreateMock).toHaveBeenCalledWith("9");
    expect(blackbaudApiFetchMock).toHaveBeenCalledOnce();
  });
  it("blocks duplicate creation when the post-create DB save fails", async () => {
    setupQuick();
    const impl = sqlMock.getMockImplementation();
    sqlMock.mockImplementation((strings, ...args) => {
      if (strings.join(" ").includes("match_method = 'Created NXT record'")) throw new Error("DB unavailable");
      return impl(strings, ...args);
    });
    const { POST } = await import("./route.js");
    const response = await POST(quickRequest(), { params: { id: "42", rowId: "9" } });
    expect(await response.json()).toMatchObject({ paused: true });
    expect((await POST(quickRequest(), { params: { id: "42", rowId: "9" } })).status).toBe(409);
    expect(blackbaudApiFetchMock).toHaveBeenCalledOnce();
  });
  it("requires reviewer permission and a free creation lock", async () => {
    setupQuick();
    const { POST } = await import("./route.js");
    getWorkspaceUserMock.mockResolvedValueOnce({ sessionUser: { id: 8, role: "mgo" } });
    expect((await POST(quickRequest(), { params: { id: "42", rowId: "9" } })).status).toBe(403);
    expect(checkMock).not.toHaveBeenCalled();
    claimMock.mockResolvedValue(null);
    expect((await POST(quickRequest(), { params: { id: "42", rowId: "9" } })).status).toBe(423);
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });
});
