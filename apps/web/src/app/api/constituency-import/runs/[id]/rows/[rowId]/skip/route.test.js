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
  return {
    id: "9",
    run_id: "42",
    status: "Needs Review",
    blackbaud_result: null,
    ...overrides,
  };
}

function makeRequest(body) {
  return new Request(
    "https://example.com/api/constituency-import/runs/42/rows/9/skip",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("constituency import row skip route", () => {
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

  it("skips an un-applied row without sending anything to NXT", async () => {
    const { PATCH } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([makeRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Skipped" }, { status: "Ready" }])
      .mockResolvedValueOnce([]);

    const response = await PATCH(makeRequest({ action: "skip" }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("Skipped");
    expect(payload.summary).toMatchObject({ total: 2, skipped: 1, ready: 1 });
    expect(payload.message).toContain("No Raiser's Edge NXT data was changed");
    expect(sqlMock).toHaveBeenCalledTimes(4);
  });

  it("restores a manually skipped row to its prior review status", async () => {
    const { PATCH } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([
        makeRow({
          status: "Skipped",
          blackbaud_result: {
            type: "import_row_skipped",
            previousStatus: "Needs Review",
            previousBlackbaudResult: null,
          },
        }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Needs Review" }])
      .mockResolvedValueOnce([]);

    const response = await PATCH(makeRequest({ action: "restore" }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("Needs Review");
    expect(payload.summary).toMatchObject({ total: 1, needsReview: 1, skipped: 0 });
    expect(payload.message).toContain("Restored this record");
    expect(sqlMock).toHaveBeenCalledTimes(4);
  });

  it("does not allow an applied row to be skipped", async () => {
    const { PATCH } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([makeRow({ status: "Applied" })]);

    const response = await PATCH(makeRequest({ action: "skip" }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("have not been sent to NXT");
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
});
