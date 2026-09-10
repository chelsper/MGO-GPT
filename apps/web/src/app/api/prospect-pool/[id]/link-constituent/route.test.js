import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), sql: vi.fn(), nxt: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/blackbaud", () => ({ blackbaudApiFetch: mocks.nxt }));

const entry = { id: 149, assigned_user_id: 44, constituent_id: 88, blackbaud_constituent_id: null, local_blackbaud_constituent_id: null, note: "Keep this note", assigned_at: "2026-09-10T15:28:00Z" };
const request = (body = { blackbaudConstituentId: "123", confirmLink: true }, origin = "https://example.com") => POST(new Request("https://example.com/api/prospect-pool/149/link-constituent", {
  method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
}), { params: { id: "149" } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "reviewer@example.com" } });
  mocks.user.mockResolvedValue({ id: 7, role: "reviewer", active: true });
  mocks.sql.mockResolvedValueOnce([entry]).mockResolvedValue([{ ...entry, blackbaud_constituent_id: "123", nxt_status_sync_state: "pending" }]);
  mocks.nxt.mockResolvedValue({ id: "123", name: "Test Prospect" });
});

it("verifies the selected live identity and links only the pool entry without an NXT write", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toMatchObject({ blackbaud_constituent_id: "123", linked_blackbaud_constituent_id: "123", nxt_status_sync_state: "pending", assigned_user_id: 44, note: entry.note, assigned_at: entry.assigned_at });
  expect(mocks.nxt).toHaveBeenCalledExactlyOnceWith("/constituent/v1/constituents/123", { userId: 7, authUserId: 7, origin: "https://example.com", method: "GET" });
  const query = mocks.sql.mock.calls[1][0].join("?");
  const setClause = query.split("SET")[1].split("WHERE")[0];
  expect(setClause).not.toMatch(/\b(assigned_user_id|constituent_id|note|email|phone|solicitor_requested)\s*=/);
  expect(query).not.toMatch(/UPDATE constituents|INSERT INTO/);
  expect(query).toContain("pp.blackbaud_constituent_id IS NULL");
  expect(query).toContain("pp.assigned_user_id =");
  expect(query).toContain("COALESCE(other.blackbaud_constituent_id, c.blackbaud_constituent_id)");
});

it.each(["mgo", "executive"])("does not allow %s users to link pool identities", async (role) => {
  mocks.user.mockResolvedValue({ id: 44, role });
  expect((await request()).status).toBe(403);
  expect(mocks.sql).not.toHaveBeenCalled();
  expect(mocks.nxt).not.toHaveBeenCalled();
});

it("requires authentication", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await request()).status).toBe(401);
  expect(mocks.sql).not.toHaveBeenCalled();
});

it("rejects a cross-origin mutation", async () => {
  expect((await request(undefined, "https://untrusted.example")).status).toBe(403);
  expect(mocks.sql).not.toHaveBeenCalled();
});

it.each([{ blackbaudConstituentId: "123" }, { blackbaudConstituentId: "../123", confirmLink: true }, { blackbaudConstituentId: "123", confirmLink: "true" }])("requires a selected ID and explicit confirmation: %j", async (body) => {
  expect((await request(body)).status).toBe(400);
  expect(mocks.sql).not.toHaveBeenCalled();
});

it.each([{ blackbaud_constituent_id: "456" }, { local_blackbaud_constituent_id: "456" }, { solicitor_assignment_sync_state: "success" }, { assigned_user_id: null }])("does not replace an existing identity or archived assignment: %j", async (extra) => {
  mocks.sql.mockReset().mockResolvedValue([{ ...entry, ...extra }]);
  expect((await request()).status).toBe(409);
  expect(mocks.nxt).not.toHaveBeenCalled();
  expect(mocks.sql).toHaveBeenCalledTimes(1);
});

it.each([{ id: "456", name: "Wrong record" }, { id: "123" }, null])("does not link unverified or malformed NXT data: %j", async (identity) => {
  mocks.nxt.mockResolvedValue(identity);
  expect((await request()).status).toBe(422);
  expect(mocks.sql).toHaveBeenCalledTimes(1);
});

it("leaves the entry unchanged on throttling or connection failure", async () => {
  mocks.nxt.mockRejectedValue(new Error("429 throttled; private diagnostic"));
  const response = await request();
  expect(response.status).toBe(502);
  expect(JSON.stringify(await response.json())).not.toContain("private diagnostic");
  expect(mocks.sql).toHaveBeenCalledTimes(1);
});

it("requires reload if a concurrent change or duplicate blocks the conditional update", async () => {
  mocks.sql.mockReset().mockResolvedValueOnce([entry]).mockResolvedValueOnce([]);
  const response = await request();
  expect(response.status).toBe(409);
  expect((await response.json()).error).toMatch(/Reload the pool/);
});
