import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();

vi.mock("@/app/api/utils/saveImportVerification", () => ({
  saveImportVerification: async ({ row }) => ({ id: row.id, status: row.status }),
  refreshVerifiedImportSummary: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: getWorkspaceUserMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/app/api/utils/blackbaud", () => ({ blackbaudApiFetch: blackbaudApiFetchMock }));

function makeRequest(body) {
  return new Request("https://example.com/api/constituency-import/runs/42/reconcile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("constituency import reconciliation route", () => {
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

  it("rejects an empty verification batch before any NXT read", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(makeRequest({ rowIds: [] }), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Select at least one applied row to verify in NXT.");
    expect(sqlMock).not.toHaveBeenCalled();
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ city: "Tampa" }, 0], [{ postal_code: "33602" }, 0], [{ address_lines: ["100 Oak St", "Apt 3"] }, 0],
    [{ city: "" }, 0], [{ country: "Canada" }, 0], [{}, 1],
  ])("verifies the whole saved address rather than just line 1: %j", async (change, confirmed) => {
    const { POST } = await import("./route.js");
    const write = { type: "address", action: "replace", targetId: "address-1", addressLine1: "100 Oak Street", addressLine2: "Apt 2", city: "Jacksonville", state: "FL", postalCode: "32211", country: "US" };
    const row = { id: "9", run_id: "42", status: "Applied", applied_at: "2026-09-10", matched_blackbaud_constituent_id: "123", requested_writes: [write],
      blackbaud_result: { attempts: [{ results: [{ writeIndex: 0, status: "applied" }] }], results: [] } };
    sqlMock.mockResolvedValueOnce([{ id: "42" }]).mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    blackbaudApiFetchMock.mockResolvedValueOnce({ value: [{ id: "address-1", address_lines: ["100 Oak St", "Apt 2"], city: "Jacksonville", state: "FL", postal_code: "32211", country: "United States", ...change }] });
    const response = await POST(makeRequest({ rowIds: ["9"] }), { params: { id: "42" } });
    expect((await response.json()).reconciliationSummary).toMatchObject({ confirmed, needsReview: 1 - confirmed });
    expect(blackbaudApiFetchMock.mock.calls.every(([, options]) => !options.method || options.method === "GET")).toBe(true);
  });

  it.each(["2026-09-10", "2026-09-09"])("verifies the selected previous-address ID and end date: %s", async (date) => {
    const { POST } = await import("./route.js");
    const write = { type: "address", action: "mark_previous", targetId: "old", validTo: "2026-09-10" };
    sqlMock.mockResolvedValueOnce([{ id: "42" }]).mockResolvedValueOnce([{ id: "9", run_id: "42", status: "Applied", applied_at: "2026-09-10", matched_blackbaud_constituent_id: "123", requested_writes: [write], blackbaud_result: { results: [{ status: "applied", writeIndex: 0 }] } }]).mockResolvedValueOnce([]);
    blackbaudApiFetchMock.mockResolvedValueOnce({ value: [{ id: "old", type: "Previous Address", valid_to: date }] });
    const response = await POST(makeRequest({ rowIds: ["9"] }), { params: { id: "42" } });
    expect((await response.json()).reconciliationSummary.confirmed).toBe(date === write.validTo ? 1 : 0);
  });

  it("confirms an applied email address by re-reading the current NXT record", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "email_address",
      action: "add_if_new",
      address: "new.email@example.edu",
      emailType: "Preferred Email 1",
      makePrimary: true,
    };
    const row = {
      id: "9",
      run_id: "42",
      status: "Applied",
      applied_at: "2026-08-07T15:00:00Z",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      blackbaud_result: { results: [{ status: "applied", writeIndex: 0, type: "email_address" }] },
      preview: { writePlan: [write] },
    };

    sqlMock
      .mockResolvedValueOnce([{ id: "42" }])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([]);
    blackbaudApiFetchMock.mockResolvedValueOnce({
      value: [{ id: "email-1", address: "new.email@example.edu", primary: true }],
    });

    const response = await POST(makeRequest({ rowIds: ["9"] }), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith(
      "/constituent/v1/constituents/123/emailaddresses",
      { userId: 7, authUserId: 7, origin: "https://example.com" },
    );
    expect(payload.reconciliationSummary).toMatchObject({
      verifiedRows: 1,
      confirmed: 1,
      needsReview: 0,
    });
    expect(payload.rows[0].reconciliation.results[0]).toMatchObject({
      status: "confirmed",
      writeIndex: 0,
    });
  });

  it("confirms an applied primary addressee through the name format summary", async () => {
    const { POST } = await import("./route.js");
    const write = {
      type: "constituent_name_format",
      action: "update_primary",
      kind: "addressee",
      targetId: "primary-addressee-1",
      value: "Dr. Jane Dolphin",
    };
    const row = {
      id: "10",
      run_id: "42",
      status: "Applied",
      applied_at: "2026-08-07T15:00:00Z",
      matched_blackbaud_constituent_id: "123",
      requested_writes: [write],
      blackbaud_result: { results: [{ status: "applied", writeIndex: 0, type: "constituent_name_format" }] },
      preview: { writePlan: [write] },
    };

    sqlMock
      .mockResolvedValueOnce([{ id: "42" }])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([]);
    blackbaudApiFetchMock.mockResolvedValueOnce({
      primary_addressee: { id: "primary-addressee-1", formatted_name: "Dr. Jane Dolphin" },
    });

    const response = await POST(makeRequest({ rowIds: ["10"] }), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith(
      "/constituent/v1/constituents/123/nameformats/summary",
      { userId: 7, authUserId: 7, origin: "https://example.com" },
    );
    expect(payload.reconciliationSummary).toMatchObject({ confirmed: 1, needsReview: 0 });
  });

  it("returns a stale selection without reading NXT", async () => {
    const { POST } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([{ id: "42" }]).mockResolvedValueOnce([]);

    const response = await POST(makeRequest({ rowIds: ["9"] }), { params: { id: "42" } });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("no longer applied");
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });
});
