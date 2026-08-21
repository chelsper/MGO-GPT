import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();

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

function makeRequest() {
  return new Request("https://example.com/api/constituency-import/runs?id=42");
}

describe("constituency import runs route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    sqlMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: {
        id: 7,
        email: "reviewer@example.com",
        role: "admin",
      },
    });
  });

  it("sanitizes a legacy quota-paused row when reopening a saved import", async () => {
    const { GET } = await import("./route.js");
    const quotaResponse =
      'Blackbaud call-volume quota is temporarily unavailable. Provider response: {"statusCode":403,"message":"Out of call volume quota. Quota will be replenished in 07:01:20."} This row was saved safely without attempting further NXT calls. Retry its review after the Blackbaud quota is available.';

    sqlMock
      .mockResolvedValueOnce([
        {
          id: "42",
          status: "previewed",
          source_filename: "students.csv",
          row_count: 1,
          ready_count: 0,
          needs_review_count: 1,
          conflict_count: 0,
          skipped_count: 0,
          applied_count: 0,
          failed_count: 0,
          warnings: [quotaResponse],
          summary: {},
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "9",
          run_id: "42",
          row_number: 1,
          status: "Needs Review",
          match_method: "NXT checks paused",
          match_status: "needs_review",
          confidence: 84,
          blackbaud_result: { provider: quotaResponse },
          blackbaud_error: quotaResponse,
          requested_writes: [
            { type: "constituent_code", action: "replace", sourceConstituency: "Student" },
          ],
          preview: {
            rowNumber: 1,
            matchMethod: "NXT checks paused",
            confidence: 84,
            currentCodes: ["Student"],
            writePlan: [
              { type: "constituent_code", action: "replace", sourceConstituency: "Student" },
            ],
            reasons: [
              quotaResponse,
              "Current constituency Student was not found on the NXT record.",
              "Education relationship data is staged for review.",
            ],
          },
        },
      ]);

    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.warnings[0]).toContain("about 422 minutes");
    expect(payload.warnings[0]).not.toContain('"statusCode"');
    expect(payload.rows[0]).toMatchObject({
      nxtChecksPaused: true,
      matchMethod: "NXT checks paused",
      confidence: 0,
      match: null,
      currentCodes: [],
      currentCodeDetails: [],
      writePlan: [],
      intentDisposition: {
        key: "nxt_checks_paused",
        allowApply: false,
      },
    });
    expect(payload.rows[0].reasons.join(" ")).not.toContain("Student was not found");
    expect(payload.rows[0].reasons.join(" ")).not.toContain('"statusCode"');
    expect(payload.rows[0].blackbaudResult).toBeNull();
    expect(payload.rows[0].blackbaudError).toBe("");
  });
});
