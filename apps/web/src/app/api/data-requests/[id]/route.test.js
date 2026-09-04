import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), sql: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: async () => {} }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
import { PATCH } from "./route";

beforeEach(() => {
  mocks.auth.mockResolvedValue({ user: { email: "test@example.org" } });
  mocks.sql.mockReset();
  mocks.sql.mockResolvedValue([{ id: 12, status: "In Progress" }]);
});
const request = (query = "?view=reviewer") => new Request(`https://example.com/api/data-requests/12${query}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "In Progress", reviewerNotes: "Working" }) });

describe("reviewer data request actions", () => {
  it("allows the session reviewer to act despite an old acting-user cookie", async () => {
    mocks.user.mockResolvedValue({ sessionUser: { id: 7, role: "admin" }, workspaceUser: { id: 44, role: "mgo" } });
    const response = await PATCH(request(), { params: { id: "12" } });
    expect(response.status).toBe(200);
    expect(mocks.sql.mock.calls[0].slice(1)).toContain(7);
    expect(mocks.sql.mock.calls[0].slice(1)).not.toContain(44);
  });

  it("does not broaden MGO mutation permissions", async () => {
    mocks.user.mockResolvedValue({ sessionUser: { id: 44, role: "mgo" }, workspaceUser: { id: 44, role: "mgo" } });
    expect((await PATCH(request(), { params: { id: "12" } })).status).toBe(403);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("preserves the non-reviewer-view restriction when impersonating", async () => {
    mocks.user.mockResolvedValue({ sessionUser: { id: 7, role: "admin" }, workspaceUser: { id: 44, role: "mgo" } });
    expect((await PATCH(request(""), { params: { id: "12" } })).status).toBe(403);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
