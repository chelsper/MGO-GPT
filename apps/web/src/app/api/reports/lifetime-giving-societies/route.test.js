// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => Object.fromEntries(["auth", "user", "schema", "access", "read", "rules", "refresh", "transport", "metadata", "group", "record"].map(key => [key, vi.fn()])));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: m.user }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: m.schema }));
vi.mock("@/app/api/utils/reportAccess", () => ({ getReportAccessForUser: m.access }));
vi.mock("@/app/api/utils/lifetimeSocieties", async original => ({ ...await original(), readLifetimeState: m.read, readLifetimeRules: m.rules, refreshLifetimeHistory: m.refresh, lifetimeTransport: m.transport, updateLifetimeGroup: m.group, updateLifetimeRecord: m.record }));
import { GET, POST } from "./route";
import { lifetimeQueryFixture, lifetimeRules } from "../../../../../test/lifetimeQueryFixture";
const request = (body, headers) => new Request("https://app.example/api/reports/lifetime-giving-societies", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); m.auth.mockResolvedValue({ user: { email: "test@example.org" } });
  m.user.mockResolvedValue({ id: 1, role: "admin", active: true }); m.access.mockResolvedValue({ canView: true });
  m.read.mockResolvedValue({ revision: null, snapshot: null }); m.rules.mockResolvedValue(lifetimeRules);
  m.refresh.mockResolvedValue({ state: { revision: "updated", snapshot: null, updatedBy: 1 }, societies: lifetimeRules });
  m.group.mockResolvedValue({ state: { revision: "updated", snapshot: null, updatedBy: 1 }, societies: lifetimeRules });
  m.record.mockResolvedValue({ state: { revision: "updated", snapshot: null, updatedBy: 1 }, societies: lifetimeRules });
  m.transport.mockResolvedValue({ metadata: m.metadata }); m.metadata.mockResolvedValue(lifetimeQueryFixture());
});
it("requires login before database and NXT reads", async () => {
  m.auth.mockResolvedValue(null); expect((await GET()).status).toBe(401); expect((await POST(request({}))).status).toBe(401);
  expect(m.schema).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled(); expect(m.transport).not.toHaveBeenCalled();
});
it("serves shared viewers saved data only with private no-store headers", async () => {
  m.user.mockResolvedValue({ id: 2, role: "mgo", active: true }); const response = await GET();
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await response.json()).canManage).toBe(false); expect(m.transport).not.toHaveBeenCalled();
});
it.each(["mgo", "executive"])("does not let %s execute query jobs", async role => {
  m.user.mockResolvedValue({ id: 2, role, active: true });
  for (const operation of ["fields", "refresh", "confirm-group", "remove-group", "archive-record", "restore-record", "confirm-date", "reopen-date"]) expect((await POST(request({ operation, revision: null }))).status).toBe(403);
  expect(m.transport).not.toHaveBeenCalled(); expect(m.group).not.toHaveBeenCalled(); expect(m.record).not.toHaveBeenCalled();
});
it.each(["admin", "advancement_services"])("allows %s to manage saved records without NXT calls", async role => {
  m.user.mockResolvedValue({ id: 3, role, active: true });
  for (const operation of ["archive-record", "restore-record", "confirm-date", "reopen-date"]) {
    const body = { operation, revision: "a".repeat(36), [operation.endsWith("date") ? "milestoneKey" : "recordKey"]: "b".repeat(64) };
    const response = await POST(request(body)); expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.record).toHaveBeenLastCalledWith(expect.objectContaining(body));
  }
  expect(m.transport).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
});
it("rejects invented date values, extra identifiers, invalid keys and cross-origin saved-record mutations", async () => {
  const body = { operation: "confirm-date", revision: "a".repeat(36), milestoneKey: "b".repeat(64) };
  for (const invalid of [{ ...body, date: "1900-01-01" }, { ...body, recordKey: "c".repeat(64) }, { ...body, milestoneKey: "__proto__" },
    { ...body, operation: "archive-record" }, { ...body, operation: "fields" }]) expect((await POST(request(invalid))).status).toBe(400);
  expect((await POST(request(body, { origin: "https://untrusted.example" }))).status).toBe(403);
  expect((await POST(request({ ...body, revision: undefined }))).status).toBe(409);
  expect(m.record).not.toHaveBeenCalled(); expect(m.transport).not.toHaveBeenCalled();
});
it("rejects inactive or unshared viewers", async () => {
  m.user.mockResolvedValue({ id: 1, role: "admin", active: false }); expect((await GET()).status).toBe(403);
  m.user.mockResolvedValue({ id: 2, role: "mgo", active: true }); m.access.mockResolvedValue({ canView: false }); expect((await GET()).status).toBe(403);
});
it.each(["admin", "advancement_services"])("allows %s to inspect and refresh without leaking actor metadata", async role => {
  m.user.mockResolvedValue({ id: 3, role, active: true });
  const result = await POST(request({ operation: "fields" })); expect(result.status).toBe(200); expect((await result.json()).ready).toBe(true);
  expect(m.refresh).not.toHaveBeenCalled();
  const refreshed = await POST(request({ operation: "refresh", revision: null })); expect(refreshed.status).toBe(200);
  expect(await refreshed.json()).not.toHaveProperty("updatedBy");
});
it("rejects cross-origin, malformed, oversized and arbitrary-query requests", async () => {
  expect((await POST(request({}, { origin: "https://other.example" }))).status).toBe(403);
  expect((await POST(request({}, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  expect((await POST(request({ operation: "refresh" }))).status).toBe(409);
  expect((await POST(request({ operation: "fields", queryId: "999" }))).status).toBe(400);
  expect((await POST(request({ operation: "delete" }))).status).toBe(400);
  expect((await POST(request("x".repeat(1001)))).status).toBe(413);
  expect(m.transport).not.toHaveBeenCalled();
});
it("redacts provider/database errors", async () => {
  m.read.mockRejectedValue(new Error("secret donor URL")); const response = await GET();
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret");
});
it("allows app-only grouping without NXT calls and rejects fabricated group payloads", async () => {
  const body = { operation: "confirm-group", groupId: "a".repeat(64), revision: "a".repeat(36) };
  expect((await POST(request(body))).status).toBe(200);
  expect(m.group).toHaveBeenCalledWith(expect.objectContaining(body));
  expect(m.transport).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
  expect((await POST(request({ ...body, members: ["1", "2"] }))).status).toBe(400);
  expect((await POST(request({ ...body, groupId: "arbitrary" }))).status).toBe(400);
  expect((await POST(request({ ...body, operation: "refresh" }))).status).toBe(400);
  expect((await POST(request(body, { origin: "https://untrusted.example" }))).status).toBe(403);
});
