import { beforeEach, describe, expect, it, vi } from "vitest";
const { auth, schema, workspace, sql } = vi.hoisted(() => ({ auth: vi.fn(), schema: vi.fn(), workspace: vi.fn(), sql: vi.fn() }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: schema }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: workspace }));
vi.mock("@/app/api/utils/sql", () => ({ default: sql }));
import { GET, POST, PUT, DELETE } from "./route";
const configuration = { name: "New people", mappings: { firstName: "First", lastName: "Last", email: "Email" }, defaults: { importIntent: "new", updateEmailFields: true } };
const request = (method, body) => new Request("https://example.test/api/constituency-import/setups", { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { email: "reviewer@example.test" } });
  workspace.mockResolvedValue({ sessionUser: { id: 7, role: "reviewer", active: true }, workspaceUser: { id: 99, role: "admin", active: true } });
  sql.mockResolvedValue([{ id: "1", revision: 1, configuration }]);
});
describe("personal import setups API", () => {
  it("rejects signed-out, inactive and non-reviewer accounts", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(request("GET"))).status).toBe(401);
    expect(schema).not.toHaveBeenCalled();
    auth.mockResolvedValue({ user: { email: "user@example.test" } });
    for (const user of [{ id: 7, active: false, role: "admin" }, { id: 7, active: true, role: "mgo" }]) {
      workspace.mockResolvedValue({ sessionUser: user, workspaceUser: { id: 99, active: true, role: "admin" } });
      for (const [method, handler] of [["GET", GET], ["POST", POST], ["PUT", PUT], ["DELETE", DELETE]]) expect((await handler(request(method, method === "GET" ? undefined : { configuration }))).status).toBe(403);
    }
    expect(sql).not.toHaveBeenCalled();
  });
  it("lists only the authenticated user's setups, not the acting workspace", async () => {
    const response = await GET(request("GET"));
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect((await response.json()).setups[0].id).toBe("1");
    expect(sql.mock.calls[0].slice(1)).toEqual([7]);
    expect(sql.mock.calls[0][0].join("?")).toMatch(/WHERE user_id = \?/);
  });
  it("blocks cross-site configuration changes", async () => {
    for (const [method, handler] of [["POST", POST], ["PUT", PUT], ["DELETE", DELETE]]) {
      for (const headers of [{ origin: "https://other.test" }, { "sec-fetch-site": "cross-site" }]) {
        const input = request(method, { configuration, id: "1", revision: 1 });
        for (const [key, value] of Object.entries(headers)) input.headers.set(key, value);
        expect((await handler(input)).status).toBe(403);
      }
    }
    expect(sql).not.toHaveBeenCalled();
  });
  it("creates sanitized configuration without donor data or approvals", async () => {
    const response = await POST(request("POST", { configuration: { ...configuration, rows: [{ name: "Secret" }], defaults: { ...configuration.defaults, approved: true, targetId: "123" } }, userId: 99 }));
    expect(response.status).toBe(201);
    const values = sql.mock.calls[0].slice(1);
    expect(values[0]).toBe(7);
    const stored = JSON.parse(values[2]);
    expect(stored.defaults.updateEmailFields).toBe(true);
    expect(JSON.stringify(stored)).not.toMatch(/Secret|approved|targetId/);
  });
  it("uses owner and revision guards for updates and removal", async () => {
    for (const [method, handler] of [["PUT", PUT], ["DELETE", DELETE]]) {
      sql.mockClear();
      sql.mockResolvedValue([]);
      const response = await handler(request(method, { id: "23", revision: 2, configuration, userId: 99 }));
      expect(response.status).toBe(409);
      expect(sql.mock.calls[0][0].join("?")).toMatch(/WHERE id = \? AND user_id = \? AND revision = \?/);
      expect(sql.mock.calls[0].slice(-3)).toEqual(["23", 7, 2]);
    }
  });
  it("returns success for a current revision without touching saved import runs", async () => {
    expect((await PUT(request("PUT", { id: "1", revision: 1, configuration }))).status).toBe(200);
    expect((await DELETE(request("DELETE", { id: "1", revision: 1 }))).status).toBe(200);
    expect(sql.mock.calls.every((call) => !call[0].join("").includes("constituency_import_runs"))).toBe(true);
  });
  it("handles duplicate names and unavailable storage without leaking provider errors", async () => {
    sql.mockRejectedValueOnce({ code: "23505" });
    expect((await POST(request("POST", { configuration }))).status).toBe(409);
    sql.mockRejectedValueOnce(new Error("secret connection string"));
    const response = await GET(request("GET"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
  it("rejects malformed, oversized and invalid writes before SQL", async () => {
    expect((await POST(new Request("https://example.test", { method: "POST", body: "{bad" }))).status).toBe(400);
    expect((await POST(request("POST", { padding: "x".repeat(21000) }))).status).toBe(413);
    expect((await PUT(request("PUT", { id: "1", configuration }))).status).toBe(400);
    expect((await POST(request("POST", { configuration: { ...configuration, mappings: { targetId: "bad" } } }))).status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });
});
