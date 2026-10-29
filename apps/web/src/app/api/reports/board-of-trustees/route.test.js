// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => Object.fromEntries(["auth", "user", "schema", "access", "read", "refresh", "transport", "metadata"].map(key => [key, vi.fn()])));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: m.user }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: m.schema }));
vi.mock("@/app/api/utils/reportAccess", () => ({ getReportAccessForUser: m.access }));
vi.mock("@/app/api/utils/boardTrustees", async original => ({ ...await original(), readBoardState: m.read, refreshBoardYear: m.refresh, boardTransport: m.transport }));
import { GET, POST } from "./route";
import { BOARD_INITIAL_SOURCE as source } from "@/utils/boardTrustees";
import { boardQueryFixture } from "../../../../../test/boardQueryFixture";
const url = "https://app.example/api/reports/board-of-trustees";
const request = (body, headers) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); m.auth.mockResolvedValue({ user: { email: "test@example.org" } });
  m.user.mockResolvedValue({ id: 1, role: "admin", active: true }); m.access.mockResolvedValue({ canView: true });
  m.read.mockResolvedValue({ revision: null, years: [] }); m.refresh.mockResolvedValue({ revision: "updated", years: [{ source, snapshot: { trusteeCount: 1 }, updatedBy: 1 }] });
  m.transport.mockResolvedValue({ metadata: m.metadata }); m.metadata.mockResolvedValue(boardQueryFixture());
});
it("authenticates before reading donor data or connecting to NXT", async () => {
  m.auth.mockResolvedValue(null);
  expect((await GET()).status).toBe(401); expect((await POST(request({}))).status).toBe(401);
  expect(m.schema).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled(); expect(m.transport).not.toHaveBeenCalled();
});
it("serves private saved results to shared viewers without NXT calls", async () => {
  m.user.mockResolvedValue({ id: 2, role: "mgo", active: true });
  const response = await GET(); expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await response.json()).canManage).toBe(false); expect(m.transport).not.toHaveBeenCalled();
});
it.each(["mgo", "executive"])("rejects %s configuration, inspection and refresh", async role => {
  m.user.mockResolvedValue({ id: 2, role, active: true });
  for (const operation of ["fields", "refresh"]) expect((await POST(request({ operation, input: source, revision: null }))).status).toBe(403);
  expect(m.transport).not.toHaveBeenCalled();
});
it("rejects inactive and unshared viewers", async () => {
  m.user.mockResolvedValue({ id: 1, role: "admin", active: false }); expect((await GET()).status).toBe(403);
  m.user.mockResolvedValue({ id: 2, role: "mgo", active: true }); m.access.mockResolvedValue({ canView: false }); expect((await GET()).status).toBe(403);
});
it.each(["admin", "advancement_services"])("allows %s to inspect and refresh, without leaking internal actors", async role => {
  m.user.mockResolvedValue({ id: 3, role, active: true });
  const inspected = await POST(request({ operation: "fields", input: source }));
  expect(inspected.status).toBe(200); expect((await inspected.json()).fields).toEqual(Object.values(source.columns));
  expect(m.refresh).not.toHaveBeenCalled();
  const result = await POST(request({ operation: "refresh", input: source, revision: null }));
  expect(result.status).toBe(200); expect((await result.json()).years[0]).not.toHaveProperty("updatedBy");
});
it("validates payloads and origin before any provider request", async () => {
  expect((await POST(request({ operation: "refresh", input: { ...source, fiscalYear: 27 }, revision: null }))).status).toBe(400);
  expect((await POST(request({ operation: "refresh", input: source }))).status).toBe(409);
  expect((await POST(request({}, { origin: "https://other.example" }))).status).toBe(403);
  expect((await POST(request({}, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  expect((await POST(request({ operation: "fields", input: source, userId: 3 }))).status).toBe(400);
  expect((await POST(request({ operation: "delete" }))).status).toBe(400);
  expect((await POST(request({ input: "x".repeat(8001) }))).status).toBe(413);
  expect(m.transport).not.toHaveBeenCalled();
});
it("sanitizes unexpected provider and database errors", async () => {
  m.read.mockRejectedValue(new Error("secret signed donor URL")); const response = await GET();
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret");
});
