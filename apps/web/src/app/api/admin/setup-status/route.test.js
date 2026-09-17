import { beforeEach, expect, it, vi } from "vitest";

const { auth, sql, read } = vi.hoisted(() => ({
  auth: vi.fn(),
  sql: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/app/api/utils/sql", () => ({ default: sql }));
vi.mock("@/app/api/utils/setupStatus", () => ({ readSetupStatus: read }));
import * as route from "./route";

const request = () =>
  new Request(
    "https://app.example/api/admin/setup-status?userId=999&refresh=1",
    {
      headers: { cookie: "workspace_acting_user_id=999" },
    },
  );
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    user: { email: "manager@example.test", role: "admin" },
  });
  sql.mockResolvedValue([{ id: 7, role: "admin", active: true }]);
  read.mockResolvedValue({ viewerId: "7", sections: {} });
});

it("exposes only a read endpoint and requires sign-in before any saved reads", async () => {
  expect(Object.keys(route)).toEqual(["GET"]);
  auth.mockResolvedValue(null);
  const response = await route.GET(request());
  expect(response.status).toBe(401);
  expect(sql).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});

it.each(["mgo", "executive", "executive_admin", "mgo,executive", ""])(
  "rejects actual role %s despite Admin session claims or acting cookies",
  async (role) => {
    sql.mockResolvedValue([{ id: 7, role, active: true }]);
    expect((await route.GET(request())).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  },
);

it.each([false, null, undefined])(
  "rejects accounts without an active flag: %s",
  async (active) => {
    sql.mockResolvedValue([{ id: 7, role: "admin", active }]);
    expect((await route.GET(request())).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  },
);

it("never provisions an unknown account", async () => {
  sql.mockResolvedValue([]);
  expect((await route.GET(request())).status).toBe(403);
  expect(read).not.toHaveBeenCalled();
  expect(sql.mock.calls[0][0].join(" ")).toMatch(/^SELECT/);
});

it.each([
  ["admin", true],
  ["mgo,admin", true],
  ["advancement_services", false],
  ["reviewer", false],
  ["advancement_admin", false],
  ["mgo,advancement_services", false],
])(
  "allows actual role %s, without granting extra Admin tools",
  async (role, isAdmin) => {
    sql.mockResolvedValue([{ id: 7, role, active: true }]);
    const response = await route.GET(request());
    expect(response.status).toBe(200);
    expect(read).toHaveBeenCalledWith({ viewerId: 7, isAdmin });
    expect(sql.mock.calls[0].slice(1)).toEqual(["manager@example.test"]);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("Vary")).toBe("Cookie");
  },
);

it("does not leak database details on failure", async () => {
  sql.mockRejectedValueOnce(new Error("secret database URL"));
  const response = await route.GET(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret database");
  expect(read).not.toHaveBeenCalled();
});
