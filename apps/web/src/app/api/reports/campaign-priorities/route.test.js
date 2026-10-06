// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => Object.fromEntries(["auth","user","schema","access","read","save","edit","advance","transport","metadata","sql"].map(key => [key,vi.fn()])));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/reportAccess", () => ({ getReportAccessForUser: mocks.access }));
vi.mock("@/app/api/utils/campaignPriorityStore", () => ({ campaignRead: mocks.read, saveCampaignConfig: mocks.save, editCampaign: mocks.edit }));
vi.mock("@/app/api/utils/campaignPriorityRefresh", () => ({ advanceCampaignRefresh: mocks.advance }));
vi.mock("@/app/api/utils/campaignPriorityQuery", async original => ({ ...await original(), campaignTransport: mocks.transport }));
import { GET, POST } from "./route";
const url = "https://app.example/api/reports/campaign-priorities";
const request = (body, headers = {}) => new Request(url,{ method: "POST",headers: { "Content-Type": "application/json", ...headers },body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { email: "fictional@example.org" } }); mocks.user.mockResolvedValue({ id: 1, role: "admin", active: true });
  mocks.access.mockResolvedValue({ canView: true }); mocks.read.mockResolvedValue({ version: 1 }); mocks.edit.mockResolvedValue(2); mocks.save.mockResolvedValue(2); mocks.advance.mockResolvedValue({ stage: "waiting" });
  mocks.transport.mockResolvedValue({ connectionKey: "fixture-connection", metadata: mocks.metadata });
  mocks.metadata.mockResolvedValue({ id: "27460", name: "Campaign", type: "Gift", select_fields: ["Gift","Fund ID","Fund","Amount"].map(name => ({ query_field: { selected_field_name: name } })) });
});
describe("campaign dashboard authorization and read/write boundaries", () => {
  it("authenticates before database or NXT access", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(new Request(url))).status).toBe(401); expect((await POST(request({}))).status).toBe(401);
    expect(mocks.schema).not.toHaveBeenCalled(); expect(mocks.transport).not.toHaveBeenCalled();
  });
  it("loads a shared snapshot without making NXT calls", async () => {
    mocks.user.mockResolvedValue({ id: 2, role: "mgo", active: true });
    expect((await GET(new Request(url))).status).toBe(200); expect(mocks.read).toHaveBeenCalledWith(expect.any(URLSearchParams),false);
    expect(mocks.transport).not.toHaveBeenCalled();
  });
  it.each(["mgo","executive"])("prevents %s from editing, refreshing, loading query metadata or reading audit history", async role => {
    mocks.user.mockResolvedValue({ id: 2, role, active: true });
    for (const operation of ["fields","source","funds","override","start","continue","cancel"]) expect((await POST(request({ operation,version: 1 }))).status).toBe(403);
    expect((await GET(new Request(`${url}?history=10:1`))).status).toBe(403);
    expect(mocks.transport).not.toHaveBeenCalled(); expect(mocks.edit).not.toHaveBeenCalled(); expect(mocks.sql).not.toHaveBeenCalled();
  });
  it.each(["admin","advancement_services"])("permits %s to make a local allocation edit", async role => {
    const user = { id: 3,role,active: true }; mocks.user.mockResolvedValue(user);
    const input = { itemKey: "10:1", amount: "50", priority: null, reason: "Approved adjustment" };
    expect((await POST(request({ operation: "override",version: 1,runId: "run",input }))).status).toBe(200);
    expect(mocks.edit).toHaveBeenCalledWith(user,1,"run","override",input); expect(mocks.transport).not.toHaveBeenCalled();
  });
  it("blocks inactive users and unshared viewers", async () => {
    mocks.user.mockResolvedValue({ id: 1,role: "admin",active: false }); expect((await GET(new Request(url))).status).toBe(403);
    mocks.user.mockResolvedValue({ id: 2,role: "mgo",active: true }); mocks.access.mockResolvedValue({ canView: false }); expect((await GET(new Request(url))).status).toBe(403);
  });
  it("rejects cross-origin, forged-user and oversized payloads", async () => {
    expect((await POST(request({}, { origin: "https://other.example" }))).status).toBe(403);
    expect((await POST(request({ operation: "funds",version: 1,userId: 5 }))).status).toBe(400);
    expect((await POST(request({ input: "x".repeat(17000) }))).status).toBe(413);
    expect(mocks.edit).not.toHaveBeenCalled(); expect(mocks.transport).not.toHaveBeenCalled();
  });
  it("binds verified source settings to the shared connection", async () => {
    const response = await POST(request({ operation: "source",version: 1,input: { queryId: "27460",queryName: "Campaign",mode: "gift",columns: { giftId: "Gift",fundId: "Fund ID",fundName: "Fund",amount: "Amount" },confirmed: true } }));
    expect(response.status).toBe(200); expect(mocks.save.mock.calls[0][2]).toMatchObject({ connectionKey: "fixture-connection",sourceKey: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(mocks.advance).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation to run the campaign query", async () => {
    expect((await POST(request({ operation: "start",version: 1 }))).status).toBe(400); expect(mocks.advance).not.toHaveBeenCalled();
  });
  it("does not leak unexpected database or NXT details", async () => {
    mocks.read.mockRejectedValue(new Error("secret signed URL or private SQL")); const result = await GET(new Request(url));
    expect(result.status).toBe(503); expect(await result.text()).not.toContain("secret");
  });
});
