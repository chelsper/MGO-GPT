// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => Object.fromEntries(["auth", "user", "schema", "access", "read", "refresh", "transport", "metadata"].map(k => [k, vi.fn()])));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: m.user }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: m.schema }));
vi.mock("@/app/api/utils/reportAccess", () => ({ getReportAccessForUser: m.access }));
vi.mock("@/app/api/utils/fyRevenueGoals", async original => ({ ...await original(), readRevenueState: m.read, refreshRevenue: m.refresh, revenueTransport: m.transport }));
import { GET, POST } from "./route";
const url = "https://app.example/api/reports/fy-revenue-goals";
const request = (body, headers) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const input = { queryId: "31074", queryName: "Eligible gifts", columns: { giftId: "System Record ID", amount: "Gift Amount" }, projection: "remaining", confirmed: true };
beforeEach(() => {
  vi.clearAllMocks(); m.auth.mockResolvedValue({ user: { email: "test@example.org" } });
  m.user.mockResolvedValue({ id: 1, role: "admin", active: true }); m.access.mockResolvedValue({ canView: true });
  m.read.mockResolvedValue({ revision: null, source: null, snapshot: null, updatedBy: 3 });
  m.refresh.mockResolvedValue({ revision: "updated", source: input, snapshot: { receivedCents: 1000 } });
  m.transport.mockResolvedValue({ metadata: m.metadata });
  m.metadata.mockResolvedValue({ id: "31074", name: input.queryName, type: "Gift", select_fields: ["System Record ID", "Gift Amount"].map(name => ({ query_field: { selected_field_name: name } })) });
});
describe("FY Revenue Goals access and side effects", () => {
  it("authenticates before DB and NXT access", async () => {
    m.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401); expect((await POST(request({}))).status).toBe(401);
    expect(m.schema).not.toHaveBeenCalled(); expect(m.transport).not.toHaveBeenCalled();
  });
  it("serves shared saved results without querying NXT or returning internal provenance", async () => {
    m.user.mockResolvedValue({ id: 2, role: "mgo", active: true });
    const response = await GET(); expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("updatedBy");
    expect(m.transport).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
  });
  it.each(["mgo", "executive"])("prevents %s from refreshing or reading metadata", async role => {
    m.user.mockResolvedValue({ id: 2, role, active: true });
    for (const operation of ["fields", "refresh"]) expect((await POST(request({ operation, input, revision: null }))).status).toBe(403);
    expect(m.transport).not.toHaveBeenCalled();
  });
  it("rejects inactive and unshared viewers", async () => {
    m.user.mockResolvedValue({ id: 2, role: "admin", active: false }); expect((await GET()).status).toBe(403);
    m.user.mockResolvedValue({ id: 2, role: "mgo", active: true }); m.access.mockResolvedValue({ canView: false }); expect((await GET()).status).toBe(403);
  });
  it.each(["admin", "advancement_services"])("allows %s to inspect fields without executing queries", async role => {
    m.user.mockResolvedValue({ id: 3, role, active: true });
    expect((await POST(request({ operation: "fields" }))).status).toBe(200); expect(m.refresh).not.toHaveBeenCalled();
  });
  it("requires confirmation and valid mappings before provider access", async () => {
    expect((await POST(request({ operation: "refresh", input: { ...input, confirmed: false }, revision: null }))).status).toBe(400);
    expect(m.transport).not.toHaveBeenCalled();
    expect((await POST(request({ operation: "refresh", input, revision: null }))).status).toBe(200);
    expect(m.refresh).toHaveBeenCalledWith(expect.objectContaining({ input, revision: null }));
  });
  it("rejects cross-origin, oversized, forged-user and unknown requests", async () => {
    expect((await POST(request({}, { origin: "https://other.example" }))).status).toBe(403);
    expect((await POST(request({ operation: "fields", userId: 2 }))).status).toBe(400);
    expect((await POST(request({ operation: "delete" }))).status).toBe(400);
    expect((await POST(request({ input: "x".repeat(8001) }))).status).toBe(413);
    expect(m.transport).not.toHaveBeenCalled();
  });
  it("does not expose SQL, donor data, or signed result URLs in unexpected failures", async () => {
    m.read.mockRejectedValue(new Error("secret signed URL")); const response = await GET();
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret");
  });
});
