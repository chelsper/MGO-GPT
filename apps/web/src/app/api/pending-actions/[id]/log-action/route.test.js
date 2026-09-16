import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => Object.fromEntries(["auth", "context", "sql", "read", "receipt", "claim", "complete", "constituent", "fundraisers", "create", "get", "patch"].map(key => [key, vi.fn()])));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.context }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/pendingActionQuickAction", () => ({ default: mocks.complete }));
vi.mock("@/app/api/utils/actionFundraisers", () => ({ resolveActionFundraiserIds: mocks.fundraisers }));
vi.mock("@/utils/standingsPeriods", () => ({ getStandingsPeriods: () => ({ asOf: "2026-09-16" }) }));
vi.mock("@/app/api/utils/pendingActionNxt", async importOriginal => ({ ...await importOriginal(), readNextStepAction: mocks.read,
  readNextStepActionReceipt: mocks.receipt, claimNextStepAction: mocks.claim }));
vi.mock("@/app/api/utils/blackbaud", async importOriginal => ({ ...await importOriginal(),
  getBlackbaudConstituentById: mocks.constituent, createBlackbaudAction: mocks.create, getBlackbaudAction: mocks.get, updateBlackbaudAction: mocks.patch }));
import { GET, POST } from "./route";

const params = { params: { id: "40" } };
const token = "2026-09-15 12:30:10.123456+00";
const body = { expectedWorkspaceId: 7, sourceToken: "source", actionDate: "2026-09-16", actionCategory: "Meeting",
  interactionType: "Stewardship", summary: "Thank donor", notes: "Discussed impact", completeReminder: true };
const call = (extra = {}) => POST(new Request("https://example.com/api/pending-actions/40/log-action", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ...extra }),
}), params);
const savedAction = { id: "500", constituent_id: "123", date: "2026-09-16T00:00:00Z", completed: true,
  summary: "Thank donor", description: "Notes: Discussed impact", category: "Meeting", type: "Stewardship", fundraisers: ["99"], opportunity_id: "333" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "admin@example.com" } });
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, name: "Admin Author", role: "admin" }, workspaceUser: { id: 7, name: "Selected MGO", role: "mgo" }, isActing: true });
  mocks.read.mockResolvedValue({ id: 40, status: "Open", title: "Thank donor", category: "Stewardship", details: "Discussed impact", source_token: "source", updated_at: token,
    constituentId: "123", constituent_name: "Example Donor", prospect_id: 20, blackbaud_opportunity_id: "333", opportunity_title: "Gift" });
  mocks.receipt.mockResolvedValue(null);
  mocks.claim.mockResolvedValue(true);
  mocks.constituent.mockResolvedValue({ raw: { id: "123" } });
  mocks.fundraisers.mockResolvedValue(["99"]);
  mocks.create.mockResolvedValue({ id: "500" });
  mocks.get.mockResolvedValue(savedAction);
  mocks.patch.mockResolvedValue({});
  mocks.complete.mockResolvedValue({ found: true, item: { id: 40, status: "Done" } });
  mocks.sql.mockResolvedValue([]);
});

it("loads saved context on demand without any NXT calls", async () => {
  const response = await GET(new Request("https://example.com/api/pending-actions/40/log-action?workspaceId=7"), params);
  expect(response.status).toBe(200);
  expect((await response.json()).task).toMatchObject({ constituentId: "123", sourceToken: "source", willLinkOpportunity: true });
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(mocks.constituent).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("logs once with selected-MGO credit, admin authorship and no create retries; verifies before completion", async () => {
  const response = await call();
  expect(response.status).toBe(200);
  expect((await response.json()).receipt).toMatchObject({ state: "saved", actionId: "500", reminderCompleted: true });
  expect(mocks.fundraisers).toHaveBeenCalledWith(expect.objectContaining({ currentUser: expect.objectContaining({ id: 2 }), primaryFundraiserUser: expect.objectContaining({ id: 7 }), requirePrimaryFundraiser: true }));
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ userId: 7, authUserId: 2, maxRetries: 0,
    payload: expect.objectContaining({ constituent_id: "123", fundraisers: ["99"], author: "Admin Author", opportunity_id: "333" }) }));
  expect(mocks.patch).toHaveBeenCalledWith(expect.objectContaining({ actionId: "500", payload: expect.objectContaining({ type: "Stewardship" }) }));
  expect(mocks.complete).toHaveBeenCalledExactlyOnceWith({ id: "40", ownerUserId: 7, action: "complete", expectedUpdatedAt: token });
  expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
  expect(mocks.get.mock.invocationCallOrder[1]).toBeLessThan(mocks.complete.mock.invocationCallOrder[0]);
  const sqlText = mocks.sql.mock.calls.map(([parts]) => parts.join("?")).join("\n");
  expect(sqlText).toContain("INSERT INTO prospect_updates");
  expect(sqlText).not.toContain("discussion_items");
  expect(sqlText).not.toContain("blackbaud_portfolio_cache");
});
it("can log without completing the reminder", async () => {
  const response = await call({ completeReminder: false });
  expect((await response.json()).receipt).toMatchObject({ state: "saved", reminderCompleted: false });
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("keeps an edited primary plan unchanged when completion conflicts", async () => {
  mocks.complete.mockResolvedValue({ found: true, item: null });
  const receipt = (await (await call()).json()).receipt;
  expect(receipt).toMatchObject({ state: "saved", reminderCompleted: false });
  expect(receipt.message).toMatch(/next step changed/);
  expect(mocks.create).toHaveBeenCalledOnce();
});
it("does not misreport an NXT success when local completion fails", async () => {
  mocks.complete.mockRejectedValue(new Error("database unavailable"));
  expect((await (await call()).json()).receipt).toMatchObject({ state: "saved", reminderCompleted: false, message: expect.stringContaining("Do not log this action again") });
});
it("leaves an ambiguous create held for review without completing or retrying", async () => {
  mocks.create.mockRejectedValue(new Error("timeout"));
  const response = await call();
  expect(response.status).toBe(202);
  expect((await response.json()).receipt.state).toBe("review");
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.complete).not.toHaveBeenCalled();
  expect(mocks.patch).not.toHaveBeenCalled();
});
it("persists the created action ID before any verification or metadata failure", async () => {
  mocks.patch.mockRejectedValue(new Error("metadata rejected"));
  expect((await (await call()).json()).receipt).toMatchObject({ actionId: "500", state: "review", reminderCompleted: false });
  expect(mocks.sql.mock.calls[0].slice(1)).toContain("500");
  expect(mocks.sql.mock.invocationCallOrder[0]).toBeLessThan(mocks.patch.mock.invocationCallOrder[0]);
  expect(mocks.complete).not.toHaveBeenCalled();
});
it.each([{}, { id: "500" }, { ...savedAction, constituent_id: "999" }, { ...savedAction, id: "999" }])("never patches or completes an unverified action identity %j", async action => {
  mocks.get.mockResolvedValue(action);
  expect((await (await call()).json()).receipt.state).toBe("review");
  expect(mocks.complete).not.toHaveBeenCalled();
  expect(mocks.patch).not.toHaveBeenCalled();
});
it.each([{ completed: false }, { type: "Cultivation" }, { fundraisers: [] }, { date: "2025-01-01" }, { opportunity_id: "999" }, { summary: "Different action" }, { description: "" }, { category: "Email" }])("never completes without confirming required fields %j", async changes => {
  mocks.get.mockResolvedValueOnce(savedAction).mockResolvedValue({ ...savedAction, ...changes });
  expect((await (await call()).json()).receipt.state).toBe("review");
  expect(mocks.complete).not.toHaveBeenCalled();
});
it.each(["processing", "review", "saved"])("returns a durable %s receipt without a second NXT write, even after reopening", async state => {
  mocks.read.mockResolvedValue({ status: "Done" });
  mocks.receipt.mockResolvedValue({ state, blackbaud_action_id: "500", constituent_id: "123" });
  expect((await (await call()).json()).receipt.state).toBe(state);
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.constituent).not.toHaveBeenCalled();
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("loses a concurrent claim safely", async () => {
  mocks.claim.mockResolvedValue(false);
  mocks.receipt.mockResolvedValueOnce(null).mockResolvedValue({ state: "processing", constituent_id: "123" });
  expect((await (await call()).json()).receipt.state).toBe("processing");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("rejects a changed task between preflight and claim", async () => {
  mocks.claim.mockResolvedValue(false);
  expect((await call()).status).toBe(409);
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each([{ sourceToken: "old" }, { expectedWorkspaceId: 99 }])("rejects stale context before NXT reads %j", async changes => {
  expect((await call(changes)).status).toBe(409);
  expect(mocks.constituent).not.toHaveBeenCalled();
});
it("blocks missing or conflicting constituent links", async () => {
  mocks.read.mockResolvedValue({ status: "Open", source_token: "source", constituentId: null });
  expect((await call()).status).toBe(409);
  expect(mocks.constituent).not.toHaveBeenCalled();
});
it("does not accept a client helper's fallback ID as live constituent verification", async () => {
  mocks.constituent.mockResolvedValue({ blackbaudConstituentId: "123", raw: {} });
  expect((await call()).status).toBe(409);
  expect(mocks.claim).not.toHaveBeenCalled();
});
it("allows a safe retry for pre-write connection or attribution failures", async () => {
  mocks.fundraisers.mockRejectedValue(new Error("mapping unavailable"));
  expect((await call()).status).toBe(502);
  expect(mocks.claim).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each(["NXT_FUNDRAISER_MAPPING_REQUIRED", "NXT_FUNDRAISER_MAPPING_INVALID"])("identifies a mapping problem separately from connection failure: %s", async code => {
  mocks.fundraisers.mockRejectedValue(Object.assign(new Error("private provider details"), { code }));
  const response = await call();
  expect(response.status).toBe(409);
  const { error } = await response.json();
  expect(error).toMatch(/mapping/);
  expect(error).not.toContain("private provider details");
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.claim).not.toHaveBeenCalled();
});
it.each(["constituent", "fundraisers", "claim"])("identifies the failed pre-write stage without exposing provider data: %s", async stage => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks[stage].mockRejectedValue(Object.assign(new Error("secret-token private notes"), { httpStatus: 403 }));
    const response = await call();
    expect(response.status).toBe(502);
    const { error } = await response.json();
    expect(error).not.toMatch(/secret-token|private notes/);
    expect(error).toContain(stage === "claim" ? "app could not prepare" : stage === "constituent" ? "read this constituent" : "read the selected MGO");
    expect(log).toHaveBeenCalledWith("Next-step NXT action failed", {
      stage: stage === "fundraisers" ? "fundraiser" : stage, claimed: false, httpStatus: 403, mappingError: false,
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});
it.each([{ actionDate: "2026-02-30" }, { actionDate: "2026-09-17" }, { actionCategory: "Other" }, { interactionType: "Invalid" }, { summary: " " }, { summary: "x".repeat(256) }, { notes: null }, { completeReminder: "true" }, { title: "Change reminder" }])("rejects invalid or unapproved fields %j", async changes => {
  expect((await call(changes)).status).toBe(400);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("requires authentication", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await call()).status).toBe(401);
});
it("keeps acting executive workspaces read-only", async () => {
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role: "executive" }, workspaceUser: { id: 7, role: "mgo" }, isActing: true });
  expect((await call()).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("does not reveal another owner's reminder", async () => {
  mocks.read.mockResolvedValue(null);
  expect((await call()).status).toBe(404);
  expect(mocks.receipt).not.toHaveBeenCalled();
});
