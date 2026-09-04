import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
import { DELETE, GET, PATCH, POST } from "./route";

const dashboard = {
  report_key: "demo",
  title: "Demo",
  description: "Description",
  active: false,
  visibility: "specific_users",
  specific_user_ids: [],
  data_configuration: { version: 1, panels: [] },
  revision: "1",
};
const builtin = {
  report_key: "alumni-family-engagement",
  title: "Alumni",
  visibility: "specific_users",
  specific_user_ids: [1],
  data_configuration: {},
};
const request = (body) =>
  new Request("https://example.test/api/reports/configurations", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("report configuration API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { email: "manager@example.test" } });
    mocks.user.mockResolvedValue({ id: 1, active: true, role: "admin" });
    mocks.sql.mockImplementation(async (strings, ...params) => {
      const query = strings.join("?");
      if (query.includes("INSERT INTO report_configurations"))
        return [params[0] === "alumni-family-engagement" ? builtin : dashboard];
      if (query.includes("UPDATE report_configurations")) return [dashboard];
      if (query.includes("configuration_kind = 'dashboard'"))
        return [dashboard];
      if (query.includes("FROM report_configurations")) return [builtin];
      if (query.includes("FROM users"))
        return [{ id: 1, role: "admin", name: "Manager" }];
      return [];
    });
  });
  it("lists disabled drafts only for managers and exposes canonical metadata", async () => {
    const response = await GET();
    const payload = await response.json();
    expect(
      payload.configurations.find((item) => item.key === "demo"),
    ).toMatchObject({
      active: false,
      canPreview: true,
      canView: false,
      adapterKey: "query-count-dashboard",
      configurationSchema: "query-count-dashboard-v1",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    mocks.user.mockResolvedValue({ id: 1, active: true, role: "mgo" });
    expect(
      (await (await GET()).json()).configurations.find(
        (item) => item.key === "demo",
      ),
    ).toBeUndefined();
  });
  it("creates disabled private drafts from title/description/schema only", async () => {
    const response = await POST(
      request({
        title: "Demo",
        description: "Description",
        dataConfiguration: dashboard.data_configuration,
      }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).configuration).toMatchObject({
      active: false,
      specificUserIds: [],
      canView: false,
    });
  });
  it("rejects attempts to create an already-active report", async () => {
    const response = await POST(
      request({ title: "Demo", active: true, specificUserIds: [1] }),
    );
    expect(response.status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("PATCH dispatches generic configuration and preserves absent access fields", async () => {
    const response = await PATCH(
      request({ reportKey: "demo", title: "Retitled" }),
    );
    expect(response.status).toBe(200);
    const update = mocks.sql.mock.calls.find(([strings]) =>
      strings.join(" ").includes("UPDATE report_configurations"),
    );
    expect(update[0].join(" ")).toMatch(/active = CASE WHEN/);
    expect(update[0].join(" ")).toMatch(/specific_user_ids = CASE WHEN/);
  });
  it("built-in configure-only PATCH preserves omitted access columns", async () => {
    const response = await PATCH(
      request({ reportKey: "alumni-family-engagement", title: "Renamed" }),
    );
    expect(response.status).toBe(200);
    const insert = mocks.sql.mock.calls.find(([strings]) =>
      strings.join(" ").includes("INSERT INTO report_configurations"),
    );
    const fragments = insert[0];
    expect(fragments.join(" ")).toMatch(/visibility = CASE WHEN/);
    const visibilityFlag = fragments.findIndex((part) =>
      part.includes("visibility = CASE WHEN"),
    );
    const usersFlag = fragments.findIndex((part) =>
      part.includes("specific_user_ids = CASE WHEN"),
    );
    expect(insert[visibilityFlag + 1]).toBe(false);
    expect(insert[usersFlag + 1]).toBe(false);
  });
  it("rejects non-managers, inactive users, malformed JSON and anonymous callers", async () => {
    mocks.user.mockResolvedValue({ id: 1, active: true, role: "mgo" });
    expect((await POST(request({ title: "Demo" }))).status).toBe(403);
    expect((await PATCH(request({ reportKey: "demo" }))).status).toBe(403);
    mocks.user.mockResolvedValue({ id: 1, active: false, role: "admin" });
    expect((await GET()).status).toBe(403);
    mocks.user.mockResolvedValue({ id: 1, active: true, role: "admin" });
    expect(
      (
        await POST(
          new Request("https://example.test", { method: "POST", body: "{" }),
        )
      ).status,
    ).toBe(400);
    mocks.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it("deletes only a user-created dashboard and its cached snapshot", async () => {
    const response = await DELETE(request({ reportKey: "demo" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ deletedReportKey: "demo" });
    const deleteCalls = mocks.sql.mock.calls.filter(([strings]) =>
      strings.join(" ").includes("DELETE FROM"),
    );
    expect(deleteCalls).toHaveLength(2);
    expect(deleteCalls[0][0].join(" ")).toContain("report_configurations");
    expect(deleteCalls[1][0].join(" ")).toContain("report_snapshots_cache");
    expect(deleteCalls[1][1]).toBe("report:dashboard:demo");
  });
  it("protects built-in reports from deletion", async () => {
    const response = await DELETE(
      request({ reportKey: "alumni-family-engagement" }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/cannot be deleted/i);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
