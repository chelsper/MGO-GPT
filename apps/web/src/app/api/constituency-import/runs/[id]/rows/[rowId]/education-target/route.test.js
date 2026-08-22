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

  it("returns every current NXT education row so the reviewer can select the source row", async () => {
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
    expect(payload.candidateCount).toBe(3);
    expect(payload.candidates.map((candidate) => candidate.id)).toEqual(["e-1", "e-2", "e-3"]);
  });

  it("reuses saved education candidates without another NXT read", async () => {
    const { GET } = await import("./route.js");
    const row = makeRow();
    row.preview.currentEducations = [
      {
        id: "e-1",
        school: "Jacksonville University",
        degrees: ["Bachelor of Science"],
        classYear: "2010",
      },
    ];
    sqlMock.mockResolvedValueOnce([row]);

    const response = await GET(makeRequest("GET"), { params: { id: "42", rowId: "9" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.candidates).toEqual([
      expect.objectContaining({ id: "e-1", school: "Jacksonville University" }),
    ]);
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
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
        { id: "e-2", school: "Florida State University", degree: "Bachelor of Science" },
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

  it("records a saved education candidate without another NXT read", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    row.preview.currentEducations = [
      {
        id: "e-2",
        school: "Florida State University",
        degrees: ["Bachelor of Science"],
      },
    ];
    sqlMock
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);

    const response = await POST(makeRequest("POST", { educationId: "e-2" }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.targetEducationId).toBe("e-2");
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it("treats an already saved education selection as a successful no-op", async () => {
    const { GET, POST } = await import("./route.js");
    const row = makeRow({
      status: "Ready",
      preview: {
        match: { blackbaudConstituentId: "123" },
        writePlan: [
          {
            type: "education_relationship",
            action: "update",
            targetEducationId: "e-2",
          },
        ],
      },
      requested_writes: [
        {
          type: "education_relationship",
          action: "update",
          targetEducationId: "e-2",
        },
      ],
    });
    sqlMock.mockResolvedValueOnce([row]);

    const getResponse = await GET(makeRequest("GET"), { params: { id: "42", rowId: "9" } });
    const getPayload = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getPayload).toMatchObject({ alreadyResolved: true, targetEducationId: "e-2" });
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();

    sqlMock.mockReset();
    sqlMock.mockResolvedValueOnce([row]);

    const postResponse = await POST(makeRequest("POST", { educationId: "e-2" }), {
      params: { id: "42", rowId: "9" },
    });
    const postPayload = await postResponse.json();

    expect(postResponse.status).toBe(200);
    expect(postPayload).toMatchObject({ alreadyResolved: true, status: "Ready", targetEducationId: "e-2" });
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("does not require a source-row selection when a deferred education update became an add", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow({
      status: "Ready",
      preview: {
        match: { blackbaudConstituentId: "123" },
        writePlan: [
          {
            type: "education_relationship",
            action: "add",
            duplicatePolicy: "skip_if_matching",
          },
        ],
      },
      requested_writes: [
        {
          type: "education_relationship",
          action: "add",
          duplicatePolicy: "skip_if_matching",
        },
      ],
    });
    sqlMock.mockResolvedValueOnce([row]);

    const response = await POST(makeRequest("POST", {}), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ alreadyResolved: true, status: "Ready", targetEducationId: null });
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it("converts a legacy source-row review into an add when NXT has no education rows", async () => {
    const { GET, POST } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([makeRow()]);
    blackbaudApiFetchMock.mockResolvedValue({ value: [] });

    const getResponse = await GET(makeRequest("GET"), { params: { id: "42", rowId: "9" } });
    const getPayload = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getPayload).toMatchObject({ candidateCount: 0, noCurrentEducation: true });

    sqlMock.mockReset();
    sqlMock
      .mockResolvedValueOnce([makeRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);

    const postResponse = await POST(makeRequest("POST", {}), {
      params: { id: "42", rowId: "9" },
    });
    const postPayload = await postResponse.json();

    expect(postResponse.status).toBe(200);
    expect(postPayload).toMatchObject({
      status: "Ready",
      alreadyResolved: true,
      noCurrentEducation: true,
    });
  });
});
