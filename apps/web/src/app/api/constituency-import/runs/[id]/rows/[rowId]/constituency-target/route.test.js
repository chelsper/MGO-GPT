import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: getWorkspaceUserMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/app/api/utils/blackbaud", () => ({ blackbaudApiFetch: blackbaudApiFetchMock }));

function makeRow(overrides = {}) {
  const write = {
    type: "constituent_code",
    action: "replace",
    requiresReview: true,
    validationMessage: "Choose the exact current NXT constituent-code row to replace.",
    sourceConstituency: "Student",
    targetConstituency: "Alumni - Bachelor's Degree",
    startDate: "2026-05-03",
    endDate: "",
  };
  return {
    id: "9",
    run_id: "42",
    status: "Needs Review",
    matched_blackbaud_constituent_id: "123",
    preview: {
      match: { blackbaudConstituentId: "123" },
      reasons: ["Choose the exact current NXT constituent-code row before this replacement can be applied."],
      writePlan: [write],
    },
    requested_writes: [write],
    blackbaud_result: null,
    ...overrides,
  };
}

function makeRequest(method, body) {
  return new Request(
    "https://example.com/api/constituency-import/runs/42/rows/9/constituency-target",
    body === undefined
      ? { method }
      : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
}

describe("constituency import constituency-target review route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    sqlMock.mockReset();
    blackbaudApiFetchMock.mockReset();
    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 7, email: "reviewer@example.com", role: "reviewer" },
    });
  });

  it("returns only the live NXT rows matching the source constituency", async () => {
    const { GET } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([makeRow()]);
    blackbaudApiFetchMock.mockResolvedValue({
      value: [
        { id: "student-1", description: "Student", date_from: "2020-08-15", date_to: "2024-05-04" },
        { id: "student-2", description: "Student" },
        { id: "friend-1", description: "Friend" },
      ],
    });

    const response = await GET(makeRequest("GET"), { params: { id: "42", rowId: "9" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.candidateCount).toBe(2);
    expect(payload.candidates).toEqual([
      { id: "student-1", label: "Student", startDate: "2020-08-15", endDate: "2024-05-04" },
      { id: "student-2", label: "Student", startDate: "", endDate: "" },
    ]);
  });

  it("reuses saved constituent-code candidates without another NXT read", async () => {
    const { GET } = await import("./route.js");
    const row = makeRow();
    row.preview.currentCodeDetails = [
      { id: "student-1", label: "Student", startDate: "2020-08-15", endDate: "" },
    ];
    sqlMock.mockResolvedValueOnce([row]);

    const response = await GET(makeRequest("GET"), { params: { id: "42", rowId: "9" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.candidates).toEqual([
      { id: "student-1", label: "Student", startDate: "2020-08-15", endDate: "" },
    ]);
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it("records the selected source row and makes the record ready when no other review remains", async () => {
    const { POST } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([makeRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);
    blackbaudApiFetchMock.mockResolvedValue({
      value: [
        { id: "student-1", description: "Student", date_from: "2020-08-15", date_to: "2024-05-04" },
        { id: "student-2", description: "Student" },
      ],
    });

    const response = await POST(makeRequest("POST", { constituentCodeId: "student-2" }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("Ready");
    expect(payload.sourceCodeId).toBe("student-2");
    expect(sqlMock).toHaveBeenCalledTimes(4);
  });

  it("records a saved code candidate without another NXT read", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    row.preview.currentCodeDetails = [
      { id: "student-2", label: "Student", startDate: "", endDate: "" },
    ];
    sqlMock
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);

    const response = await POST(makeRequest("POST", { constituentCodeId: "student-2" }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sourceCodeId).toBe("student-2");
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });
});
