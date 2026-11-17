// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => Object.fromEntries(["auth", "user", "schema", "access", "read", "rules", "refresh", "transport", "metadata", "group", "record", "gifts", "csv", "linked"].map(key => [key, vi.fn()])));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: m.user }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: m.schema }));
vi.mock("@/app/api/utils/reportAccess", () => ({ getReportAccessForUser: m.access }));
vi.mock("@/app/api/utils/lifetimeLinkedReports", () => ({ checkLifetimeLinkedHistory: m.linked }));
vi.mock("@/app/api/utils/lifetimeSocieties", async original => ({ ...await original(), readLifetimeState: m.read, readLifetimeRules: m.rules, refreshLifetimeHistory: m.refresh, lifetimeTransport: m.transport, updateLifetimeGroup: m.group, updateLifetimeRecord: m.record, savedLifetimeGiftReview: m.gifts, savedLifetimeReconciliationCsv: m.csv }));
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
  m.linked.mockResolvedValue({ state: { revision: "updated", snapshot: null, updatedBy: 1 }, societies: lifetimeRules });
  m.gifts.mockReturnValue({ available: false, items: [] });
  m.csv.mockReturnValue('"Gift system record ID"\r\n"101"');
  m.transport.mockResolvedValue({ metadata: m.metadata }); m.metadata.mockResolvedValue(lifetimeQueryFixture());
});
const giftRequest = suffix => new Request(`https://app.example/api/reports/lifetime-giving-societies?milestoneKey=${"b".repeat(64)}&revision=${"a".repeat(36)}${suffix || ""}`);
it("allows authorized viewers to read one page of saved evidence with no NXT transport or mutations", async () => {
  m.user.mockResolvedValue({ id: 2, role: "mgo", active: true }); m.access.mockResolvedValue({ canView: true });
  const response = await GET(giftRequest("&page=2&view=review"));
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(m.gifts).toHaveBeenCalledWith(expect.anything(), lifetimeRules, { milestoneKey: "b".repeat(64), revision: "a".repeat(36), page: 2, view: "review" });
  expect(m.transport).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled(); expect(m.record).not.toHaveBeenCalled();
});
it("rejects unsupported evidence query parameters before reading any saved gift data", async () => {
  for (const suffix of ["&page=-1", "&page=1.2", "&page=1000000", "&view=anything", "&amount=10", "&milestoneKey=another", "&revision=other",
    "&format=all", "&format=", "&format=reconciliation-csv&format=reconciliation-csv", "&format=reconciliation-csv&page=0", "&format=reconciliation-csv&view=all"])
    expect((await GET(giftRequest(suffix))).status).toBe(400);
  expect((await GET(new Request("https://app.example/api/reports/lifetime-giving-societies?milestoneKey=bad"))).status).toBe(400);
  expect(m.read).not.toHaveBeenCalled(); expect(m.gifts).not.toHaveBeenCalled();
});
it("exports the full selected recipient's reconciliation CSV for shared viewers, with private attachment headers and no provider calls", async () => {
  m.user.mockResolvedValue({ id: 2, role: "mgo", active: true });
  const response = await GET(giftRequest("&format=reconciliation-csv"));
  expect(response.status).toBe(200); expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="lifetime-gift-reconciliation.csv"');
  expect(await response.text()).toContain('"101"');
  expect(m.csv).toHaveBeenCalledWith(expect.anything(), lifetimeRules, { milestoneKey: "b".repeat(64), revision: "a".repeat(36) });
  expect(m.gifts).not.toHaveBeenCalled(); expect(m.transport).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled(); expect(m.record).not.toHaveBeenCalled();
});
it("enforces authentication, active account and report sharing before exporting", async () => {
  m.auth.mockResolvedValue(null); expect((await GET(giftRequest("&format=reconciliation-csv"))).status).toBe(401);
  m.auth.mockResolvedValue({ user: { email: "fictional@example.test" } });
  m.user.mockResolvedValue({ role: "admin", active: false }); expect((await GET(giftRequest("&format=reconciliation-csv"))).status).toBe(403);
  m.user.mockResolvedValue({ role: "mgo", active: true }); m.access.mockResolvedValue({ canView: false });
  expect((await GET(giftRequest("&format=reconciliation-csv"))).status).toBe(403);
  expect(m.read).not.toHaveBeenCalled(); expect(m.csv).not.toHaveBeenCalled();
});
it("enforces login, active account and sharing on evidence reads, not just the report summary", async () => {
  m.auth.mockResolvedValue(null); expect((await GET(giftRequest())).status).toBe(401);
  m.auth.mockResolvedValue({ user: { email: "fictional@example.test" } }); m.user.mockResolvedValue({ active: false, role: "admin" });
  expect((await GET(giftRequest())).status).toBe(403);
  m.user.mockResolvedValue({ id: 2, active: true, role: "mgo" }); m.access.mockResolvedValue({ canView: false });
  expect((await GET(giftRequest())).status).toBe(403);
  expect(m.gifts).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
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
  for (const operation of ["fields", "refresh", "confirm-group", "remove-group", "archive-record", "restore-record", "confirm-date", "reopen-date", "check-linked", "restart-linked"]) expect((await POST(request({ operation, revision: null }))).status).toBe(403);
  expect(m.transport).not.toHaveBeenCalled(); expect(m.group).not.toHaveBeenCalled(); expect(m.record).not.toHaveBeenCalled();
  expect(m.linked).not.toHaveBeenCalled();
});
const linkedBody = { operation:"check-linked",revision:"a".repeat(36),milestoneKey:"b".repeat(64),giftId:"101" };
it.each(["admin","advancement_services"])("allows %s to explicitly checkpoint linked history without executing the query",async role=>{
  m.user.mockResolvedValue({id:3,role,active:true});
  m.gifts.mockReturnValue({available:true,linkedCheck:{seed:"101",status:"running",reads:5,message:null}});
  for(const operation of ["check-linked","restart-linked"]) {
    const response=await POST(request({...linkedBody,operation}));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body=await response.json(); expect(body.linkedCheck).toMatchObject({status:"running",reads:5});
    expect(body).not.toHaveProperty("updatedBy");
    expect(m.linked).toHaveBeenLastCalledWith({...linkedBody,operation,user:{id:3,role,active:true},origin:"https://app.example"});
    expect(m.gifts).toHaveBeenLastCalledWith(expect.anything(),lifetimeRules,{milestoneKey:linkedBody.milestoneKey,revision:"updated"});
  }
  expect(m.transport).not.toHaveBeenCalled(); expect(m.refresh).not.toHaveBeenCalled();
});
it("rejects arbitrary linked targets, evidence, cross-origin requests, anonymous and inactive users",async()=>{
  for(const change of [{giftId:"../101"},{giftId:"0"},{giftId:101},{giftId:undefined},{milestoneKey:undefined},{groupId:"b".repeat(64)},
    {recordKey:"b".repeat(64)},{data:{}},{path:"https://other.example"},{operation:"refresh"}])
    expect((await POST(request({...linkedBody,...change}))).status).toBe(400);
  expect((await POST(request(linkedBody,{origin:"https://untrusted.example"}))).status).toBe(403);
  expect((await POST(request(linkedBody,{"sec-fetch-site":"cross-site"}))).status).toBe(403);
  expect((await POST(request({...linkedBody,revision:undefined}))).status).toBe(409);
  m.user.mockResolvedValue({role:"admin",active:false}); expect((await POST(request(linkedBody))).status).toBe(403);
  m.auth.mockResolvedValue(null); expect((await POST(request(linkedBody))).status).toBe(401);
  expect(m.linked).not.toHaveBeenCalled(); expect(m.transport).not.toHaveBeenCalled();
});
it("redacts unexpected linked-check failures without exposing provider evidence",async()=>{
  m.linked.mockRejectedValueOnce(new Error("private raw donor payload"));
  const response=await POST(request(linkedBody)); expect(response.status).toBe(503);
  expect(await response.text()).not.toMatch(/private|payload|donor/);
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
