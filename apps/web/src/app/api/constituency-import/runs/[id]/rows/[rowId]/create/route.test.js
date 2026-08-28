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
    expect(searchBlackbaudConstituentsMock).toHaveBeenCalledWith({
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      query: "Jane Dolphin",
    });
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith("/constituent/v1/constituents", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "POST",
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
    expect(findBlackbaudConstituentByLookupIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ lookupId: "593441", userId: 7, authUserId: 7 }),
    );
    expect(getBlackbaudConstituentByIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ constituentId: "593441", userId: 7, authUserId: 7 }),
    );
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
    findBlackbaudConstituentByEmailMock.mockResolvedValue({
      blackbaudConstituentId: "123",
      lookupId: "DUP-123",
      name: "Different Name",
      email: "jane@example.com",
    });

    const response = await POST(makeRequest(), { params: { id: "42", rowId: "9" } });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("by NXT email address");
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
    searchBlackbaudConstituentsMock.mockResolvedValue([
      {
        blackbaudConstituentId: "123",
        lookupId: "DUP-123",
        name: "Jane Dolphin",
        email: "jane@example.com",
      },
    ]);

    const response = await POST(makeRequest(), { params: { id: "42", rowId: "9" } });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("likely NXT duplicate");
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });
});
