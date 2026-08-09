import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: getWorkspaceUserMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));

function makeRow(overrides = {}) {
  const write = {
    type: "education_relationship",
    action: "add",
    requiresReview: true,
    validationMessage: "Education Class Year must be a four-digit year before it can be imported.",
    institution: "Jacksonville University",
    classYear: "26",
  };
  return {
    id: "9",
    run_id: "42",
    status: "Needs Review",
    matched_blackbaud_constituent_id: "123",
    preview: {
      match: { blackbaudConstituentId: "123" },
      reasons: [write.validationMessage],
      writePlan: [write],
    },
    requested_writes: [write],
    blackbaud_result: null,
    ...overrides,
  };
}

function makeRequest(body) {
  return new Request(
    "https://example.com/api/constituency-import/runs/42/rows/9/education-class-year",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("constituency import education class-year review route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    sqlMock.mockReset();
    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 7, email: "reviewer@example.com", role: "reviewer" },
    });
  });

  it("accepts the configured two-digit class year and makes the matched row Ready", async () => {
    const { POST } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([makeRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);

    const response = await POST(makeRequest({ classYear: "26" }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.classYear).toBe("26");
    expect(payload.status).toBe("Ready");
    expect(payload.message).toContain("ready to send to NXT");
    expect(sqlMock).toHaveBeenCalledTimes(4);
  });

  it("rejects a class year that is neither two nor four digits", async () => {
    const { POST } = await import("./route.js");

    const response = await POST(makeRequest({ classYear: "2" }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("two- or four-digit");
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
