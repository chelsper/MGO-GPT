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
  const educationWrite = {
    type: "education_relationship",
    action: "review_existing",
    requiresReview: true,
    validationMessage: "Choose the exact current NXT education row before this update can be applied.",
    institution: "Jacksonville University",
  };
  const constituencyWrite = {
    type: "constituent_code",
    action: "replace",
    requiresReview: true,
    validationMessage: "Choose the exact current NXT constituent-code row to replace.",
    sourceConstituency: "Student",
    targetConstituency: "Alumni - Bachelor's Degree",
  };
  return {
    id: "9",
    run_id: "42",
    status: "Needs Review",
    matched_blackbaud_constituent_id: "123",
    preview: {
      match: { blackbaudConstituentId: "123" },
      currentEducations: [
        {
          id: "education-1",
          school: "Jacksonville University",
          degrees: ["Bachelor of Science"],
        },
      ],
      currentCodeDetails: [
        { id: "student-1", label: "Student", startDate: "2020-08-15", endDate: "" },
      ],
      reasons: [
        "Education relationship data is staged for review.",
        "Choose the exact current NXT constituent-code row before this replacement can be applied.",
      ],
      writePlan: [educationWrite, constituencyWrite],
    },
    requested_writes: [educationWrite, constituencyWrite],
    blackbaud_result: null,
    ...overrides,
  };
}

function makeRequest(body) {
  return new Request(
    "https://example.com/api/constituency-import/runs/42/rows/9/review",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("combined constituency import row review route", () => {
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

  it("uses the saved candidate snapshot when confirming all pending row reviews", async () => {
    const { POST } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([makeRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);

    const response = await POST(
      makeRequest({ educationId: "education-1", constituentCodeId: "student-1" }),
      { params: { id: "42", rowId: "9" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("Ready");
    expect(payload.writePlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "update", targetEducationId: "education-1" }),
        expect.objectContaining({ sourceCodeId: "student-1" }),
      ]),
    );
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
    expect(sqlMock).toHaveBeenCalledTimes(4);
  });

  it("converts a review-update into a duplicate-safe add when the saved NXT education snapshot is empty", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow({
      preview: {
        match: { blackbaudConstituentId: "123" },
        currentEducations: [],
        educationsSnapshotLoaded: true,
        currentCodeDetails: [],
        reasons: ["Education relationship data is staged for review."],
        writePlan: [
          {
            type: "education_relationship",
            action: "review_existing",
            requiresReview: true,
            validationMessage: "Choose the exact current NXT education row before this update can be applied.",
            institution: "Jacksonville University",
          },
        ],
      },
      requested_writes: [
        {
          type: "education_relationship",
          action: "review_existing",
          requiresReview: true,
          validationMessage: "Choose the exact current NXT education row before this update can be applied.",
          institution: "Jacksonville University",
        },
      ],
    });
    sqlMock
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);

    const response = await POST(makeRequest({}), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("Ready");
    expect(payload.writePlan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "add", duplicatePolicy: "skip_if_matching" }),
      ]),
    );
    expect(payload.preview).toMatchObject({
      currentEducations: [],
      educationsSnapshotLoaded: true,
    });
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });
});
