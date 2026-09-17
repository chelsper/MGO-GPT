import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, sql, read } = vi.hoisted(() => ({ auth: vi.fn(), sql: vi.fn(), read: vi.fn() }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/app/api/utils/sql", () => ({ default: sql }));
vi.mock("@/app/api/utils/integrationHealth", () => ({ readIntegrationHealth: read }));
import { GET } from "./route";

const request = () => new Request("https://app.example/api/admin/integration-health?userId=999&force=1", {
  headers: { cookie: "workspace_acting_user_id=999" },
});
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { email: "admin@example.test", role: "admin" } });
  sql.mockResolvedValue([{ id: 7, role: "admin", active: true }]);
  read.mockResolvedValue({ viewerId: "7", sections: {}, readAt: "2026-09-17T12:00:00Z" });
});

describe("integration health authorization", () => {
  it("requires sign-in before database reads", async () => {
    auth.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it.each(["mgo", "executive", "executive_admin", "advancement_services", "reviewer", "advancement_admin", ""])("rejects actual role %s even with an Admin session claim or acting cookie", async role => {
    sql.mockResolvedValue([{ id: 7, role, active: true }]);
    expect((await GET(request())).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });
  it.each([false, null, undefined])("rejects inactive/missing active flag %s", async active => {
    sql.mockResolvedValue([{ id: 7, role: "admin", active }]);
    expect((await GET(request())).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });
  it("does not provision a missing user", async () => {
    sql.mockResolvedValue([]);
    expect((await GET(request())).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
    expect(sql.mock.calls[0][0].join(" ")).toMatch(/^SELECT/);
  });
  it("uses the active actual Admin and request origin, never a caller-selected workspace", async () => {
    sql.mockResolvedValue([{ id: 7, role: "mgo,admin", active: true }]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(read).toHaveBeenCalledWith({ viewerId: 7, origin: "https://app.example" });
    expect(sql.mock.calls[0].slice(1)).toEqual(["admin@example.test"]);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });
  it("does not leak database/provider details on failure", async () => {
    sql.mockRejectedValueOnce(new Error("secret database URL and donor payload"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret database");
    expect(read).not.toHaveBeenCalled();
  });
});
