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
  return {
    id: "9",
    run_id: "42",
    status: "Needs Review",
    matched_blackbaud_constituent_id: "123",
    preview: {
      match: { blackbaudConstituentId: "123" },
      reasons: ["Education relationship data is staged for review."],
      writePlan: [
        {
          type: "education_relationship",
          action: "review_existing",
          requiresReview: true,
          validationMessage: "Found 2 possible NXT education rows for Jacksonville University.",
          institution: "Jacksonville University",
          degree: "Bachelor of Science",
        },
      ],
    },
    requested_writes: [
      {
        type: "education_relationship",
        action: "review_existing",
        requiresReview: true,
        validationMessage: "Found 2 possible NXT education rows for Jacksonville University.",
        institution: "Jacksonville University",
        degree: "Bachelor of Science",
      },
    ],
    blackbaud_result: null,
    ...overrides,
  };
}

function makeRequest(method, body) {
  return new Request(
    "https://example.com/api/constituency-import/runs/42/rows/9/education-target",
    body === undefined
      ? { method }
      : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
}

describe("constituency import education-target review route", () => {
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

  it("returns only live NXT education candidates for an ambiguous row", async () => {
    const { GET } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([makeRow()]);
    blackbaudApiFetchMock.mockResolvedValue({
      value: [
        { id: "e-1", school: "Jacksonville University", degree: "Bachelor of Science", class_of: 2010 },
        { id: "e-2", school: "Jacksonville University", degree: "Bachelor of Science", class_of: 2014 },
        { id: "e-3", school: "Other University", degree: "Bachelor of Science" },
      ],
    });

    const response = await GET(makeRequest("GET"), { params: { id: "42", rowId: "9" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.candidateCount).toBe(2);
    expect(payload.candidates.map((candidate) => candidate.id)).toEqual(["e-1", "e-2"]);
  });

  it("records the explicit target and makes the row Ready", async () => {
    const { POST } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([makeRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);
    blackbaudApiFetchMock.mockResolvedValue({
      value: [
        { id: "e-1", school: "Jacksonville University", degree: "Bachelor of Science" },
        { id: "e-2", school: "Jacksonville University", degree: "Bachelor of Science" },
      ],
    });

    const response = await POST(makeRequest("POST", { educationId: "e-2" }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("Ready");
    expect(payload.targetEducationId).toBe("e-2");
    expect(sqlMock).toHaveBeenCalledTimes(4);
  });
});
