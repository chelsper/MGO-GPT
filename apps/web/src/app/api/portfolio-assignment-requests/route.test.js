import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), save: vi.fn(), notify: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/portfolioAssignmentRequests", () => ({ savePortfolioAssignmentRequest: mocks.save }));
vi.mock("@/app/api/utils/sendSubmissionEmail", () => ({ sendAdvancementServicesNotification: mocks.notify }));
import { POST } from "./route";
const user = { id: 7, name: "Demo MGO", email: "demo@example.test", role: "mgo", active: true };
const saved = { id: 1, status: "Open", request_note: "Advancement Services must review. No NXT changes." };
const body = { constituentId: "123", constituentName: "Example Donor", expectedUserId: "7", action: "submit", reason: "Met recently." };
const request = (value = body, headers = {}) => new Request("https://example.test/api/portfolio-assignment-requests", {
  method: "POST", headers: { "Content-Type": "application/json", origin: "https://example.test", ...headers }, body: JSON.stringify(value),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No NXT call allowed"); }));
  mocks.auth.mockResolvedValue({ user: { email: user.email } });
  mocks.user.mockResolvedValue(user);
  mocks.save.mockResolvedValue({ request: saved, created: true });
  mocks.notify.mockResolvedValue({ status: "sent" });
});
afterEach(() => vi.unstubAllGlobals());
it("sends a local Advancement Services request for the signed-in user without requiring an NXT mapping or writing NXT", async () => {
  const response = await POST(request(body, { cookie: "workspace_acting_user_id=99" }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toMatchObject({ status: "requested", requestId: "1", reviewStatus: "Open", message: expect.stringContaining("No portfolio or NXT assignment has been changed") });
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ user, constituentId: "123", verifyOnly: false, reason: "Met recently." }));
  expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ title: "Portfolio assignment request", text: expect.stringContaining("Advancement Services > Data Updates") }));
  expect(fetch).not.toHaveBeenCalled();
});
it("does not let the caller supply another requester or an assignment status", async () => {
  expect((await POST(request({ ...body, userId: 99 }))).status).toBe(400);
  expect((await POST(request({ ...body, status: "Completed" }))).status).toBe(400);
  expect((await POST(request({ ...body, expectedUserId: "99" }))).status).toBe(409);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("rejects unauthenticated, inactive, unprivileged and cross-site requests", async () => {
  expect((await POST(request(body, { origin: "https://other.test" }))).status).toBe(403);
  expect((await POST(request(body, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  mocks.auth.mockResolvedValueOnce(null);
  expect((await POST(request())).status).toBe(401);
  mocks.user.mockResolvedValueOnce({ ...user, active: false });
  expect((await POST(request())).status).toBe(403);
  mocks.user.mockResolvedValueOnce({ ...user, role: "advancement_services" });
  expect((await POST(request())).status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
});
it.each([null, {}, { ...body, constituentId: "ABC-lookup" }, { ...body, constituentName: "" }, { ...body, reason: "a".repeat(2001) }, { ...body, action: "assign" }])("rejects invalid input %j", async value => {
  expect((await POST(request(value))).status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("checks status without sending duplicate notifications", async () => {
  mocks.save.mockResolvedValue({ request: saved, created: false });
  const response = await POST(request({ ...body, action: "verify" }));
  expect(await response.json()).toMatchObject({ status: "requested", message: expect.stringContaining("No duplicate") });
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ verifyOnly: true }));
  expect(mocks.notify).not.toHaveBeenCalled();
});
it("validates optional fields on status checks before trimming or querying", async () => {
  expect((await POST(request({ ...body, action: "verify", constituentName: {} }))).status).toBe(400);
  expect((await POST(request({ ...body, action: "verify", reason: 123 }))).status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("lets the user retry explicitly only after a status check finds no saved request", async () => {
  mocks.save.mockResolvedValue({ request: null, created: false });
  expect(await (await POST(request({ ...body, action: "verify" }))).json()).toMatchObject({ status: "not_submitted" });
  expect(mocks.notify).not.toHaveBeenCalled();
});
it("preserves a queued request when email delivery fails", async () => {
  mocks.notify.mockRejectedValue(new Error("email unavailable"));
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "requested", notificationWarning: expect.stringContaining("saved in the queue") });
});
it("does not expose raw errors or notify before persistence", async () => {
  mocks.save.mockRejectedValue(new Error("private database response"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private database");
  expect(mocks.notify).not.toHaveBeenCalled();
});
