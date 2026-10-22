import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), sql: vi.fn(), schema: vi.fn(), nxt: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/blackbaud", () => ({ blackbaudApiFetch: mocks.nxt }));
import { GET, POST } from "./route";

const run = { id: 42, defaults: { updateEmailFields: false }, mappings: { email: "Email", emailType: "Type", emailMakePrimary: "Primary" } };
const row = { id: 9, row_number: 1, status: "Applied", created_blackbaud_constituent_id: "123", matched_blackbaud_constituent_id: "123",
  raw_row: { Email: "alex@example.com", Type: "Personal", Primary: "yes" },
  preview: { input: { firstName: "Alex", lastName: "Example" }, match: { blackbaudConstituentId: "123", name: "Alex Example" } },
  requested_writes: [{ type: "constituent_code" }], blackbaud_result: { results: [{ writeIndex: 0, type: "constituent_code", status: "applied" }] },
};
const params = { params: { id: "42" } };
const request = (body = { confirmed: true, rowIds: ["9"] }) => new Request("https://example.com/api/constituency-import/runs/42/contact-recovery", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
function source(sourceRun = run, sourceRows = [row]) {
  mocks.sql.mockResolvedValueOnce([sourceRun]).mockResolvedValueOnce(sourceRows);
}

describe("contact recovery route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    mocks.user.mockResolvedValue({ sessionUser: { id: 7, role: "admin" } });
  });
  it("loads saved contact values without NXT requests or database writes", async () => {
    source();
    const response = await GET(new Request("https://example.com"), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).rows[0]).toMatchObject({ targetId: "123", eligible: true });
    expect(mocks.sql).toHaveBeenCalledTimes(2);
    expect(mocks.nxt).not.toHaveBeenCalled();
  });
  it("atomically links an update-only correction without touching original row results", async () => {
    source();
    mocks.sql.mockResolvedValueOnce([{ id: 77, row_count: 1 }]);
    const response = await POST(request({ confirmed: true, rowIds: ["9"], targetId: "wrong", rows: [{ forged: true }] }), params);
    expect(await response.json()).toMatchObject({ runId: "77", reused: false, rowCount: 1 });
    const [strings, ...values] = mocks.sql.mock.calls[2];
    const query = strings.join(" ");
    expect(query).toContain("WITH allocated AS");
    expect(query).toContain("contactRecoveryRuns");
    expect(query).toContain("IS NOT DISTINCT FROM");
    expect(query).toContain("ORDER BY s.id FOR UPDATE");
    expect(query).toContain("INSERT INTO constituency_import_rows");
    expect(query).not.toContain("UPDATE constituency_import_rows");
    const draft = values.filter((value) => typeof value === "string").map((value) => { try { return JSON.parse(value); } catch { return null; } }).find((value) => Array.isArray(value) && value[0]?.targetId);
    expect(draft[0]).toMatchObject({ targetId: "123", preview: { importIntent: "updates", input: { emailUpdates: [{ address: "alex@example.com", makePrimary: true }] } } });
    expect(draft[0].preview.input).not.toHaveProperty("targetConstituency");
    expect(mocks.nxt).not.toHaveBeenCalled();
  });
  it("reopens the saved correction after a repeated click or lost response", async () => {
    source({ ...run, defaults: { contactRecoveryRuns: { 9: "77" } } });
    const response = await POST(request(), params);
    expect(await response.json()).toMatchObject({ runId: "77", reused: true });
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });
  it("rejects a concurrent source change instead of creating a second batch", async () => {
    source();
    mocks.sql.mockResolvedValueOnce([]);
    expect((await POST(request(), params)).status).toBe(409);
    expect(mocks.nxt).not.toHaveBeenCalled();
  });
  it.each([null, "mgo", "executive"])("does not authorize %s through an acting workspace", async (role) => {
    if (!role) mocks.auth.mockResolvedValue(null);
    else mocks.user.mockResolvedValue({ sessionUser: { id: 2, role }, workspaceUser: { role: "admin" } });
    expect((await POST(request(), params)).status).toBe(role ? 403 : 401);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it.each([
    { rowIds: ["9"] }, { confirmed: true, rowIds: [] }, { confirmed: true, rowIds: ["9", "9"] },
    { confirmed: true, rowIds: [9] }, { confirmed: true, rowIds: ["9"], defaults: { emailType: { bad: true } } },
  ])("requires explicit valid preparation: %j", async (body) => {
    source();
    expect((await POST(request(body), params)).status).toBe(400);
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });
  it.each([
    { created_blackbaud_constituent_id: null }, { status: "Applying" }, { quick_create_status: "uncertain" },
    { matched_blackbaud_constituent_id: "999" }, { requested_writes: [{ type: "email_address" }] },
    { blackbaud_result: { results: [{ writeIndex: 0, status: "unconfirmed" }] } },
    { raw_row: { ...row.raw_row, Email: "invalid" } },
  ])("holds unsafe source rows: %j", async (change) => {
    source(run, [{ ...row, ...change }]);
    expect((await POST(request(), params)).status).toBe(409);
    expect(mocks.sql).toHaveBeenCalledTimes(2);
    expect(mocks.nxt).not.toHaveBeenCalled();
  });
  it("supports missing type defaults without replacing saved mapped types", async () => {
    source(run, [{ ...row, raw_row: { ...row.raw_row, Type: "" } }]);
    mocks.sql.mockResolvedValueOnce([{ id: 77 }]);
    expect((await POST(request({ confirmed: true, rowIds: ["9"], defaults: { emailType: "Personal" } }), params)).status).toBe(200);
  });
  it("does not fork a recovery batch", async () => {
    mocks.sql.mockResolvedValueOnce([{ ...run, defaults: { contactRecoverySourceRunId: "1" } }]);
    expect((await POST(request(), params)).status).toBe(409);
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it("preserves original history if atomic persistence fails", async () => {
    source();
    mocks.sql.mockRejectedValueOnce(new Error("database details must not leak"));
    const response = await POST(request(), params);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("database details");
    expect(mocks.sql).toHaveBeenCalledTimes(3);
    expect(mocks.nxt).not.toHaveBeenCalled();
  });
});
