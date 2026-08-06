import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();

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
}));

function makeRequest() {
  return new Request("https://example.com/api/constituency-import/runs/42/apply", {
    method: "POST",
  });
}

function makeRun(overrides = {}) {
  return {
    id: "42",
    status: "previewed",
    warnings: [],
    summary: {},
    row_count: 1,
    ready_count: 1,
    needs_review_count: 0,
    conflict_count: 0,
    skipped_count: 0,
    applied_count: 0,
    failed_count: 0,
    ...overrides,
  };
}

describe("constituency import run apply route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    sqlMock.mockReset();
    blackbaudApiFetchMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      workspaceUser: {
        id: 7,
        name: "Reviewer",
        email: "reviewer@example.com",
        role: "reviewer",
      },
    });
  });

  it("applies additive constituent-code rows to NXT", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "constituent_code",
      action: "add",
      targetConstituency: "Alumni - Graduate Degree",
      startDate: "2026-08-01",
    };
    const row = {
      id: "9",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      target_constituency: "Alumni - Graduate Degree",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Applied" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRun({ status: "applied", applied_count: 1, ready_count: 0 })])
      .mockResolvedValueOnce([{ ...row, status: "Applied", applied_at: "2026-08-06T12:00:00Z" }]);
    blackbaudApiFetchMock.mockResolvedValue({ id: "cc-1" });

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith("/constituent/v1/constituentcodes", {
      userId: 7,
      authUserId: 7,
      origin: "https://example.com",
      method: "POST",
      body: {
        constituent_id: "123",
        description: "Alumni - Graduate Degree",
        date_from: "2026-08-01",
      },
    });
    expect(payload.applySummary.applied).toBe(1);
    expect(payload.savedRun.appliedCount).toBe(1);
  });

  it("keeps relationship writes in manual review instead of guessing NXT payloads", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "education_relationship",
      action: "update",
      institution: "Jacksonville University",
      degree: "Bachelor of Science",
    };
    const row = {
      id: "10",
      run_id: "42",
      row_number: 1,
      status: "Ready",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      preview: {
        rowNumber: 1,
        input: { constituentName: "Jane Dolphin" },
        match: { blackbaudConstituentId: "123" },
        writePlan: [write],
      },
    };

    sqlMock
      .mockResolvedValueOnce([makeRun()])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...row, status: "Needs Review" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeRun({ status: "partially_applied", ready_count: 0, needs_review_count: 1 }),
      ])
      .mockResolvedValueOnce([{ ...row, status: "Needs Review" }]);

    const response = await POST(makeRequest(), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
    expect(payload.applySummary.manualRequired).toBe(1);
    expect(payload.savedRun.needsReviewCount).toBe(1);
  });
});
