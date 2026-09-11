import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), workspace: vi.fn(), sql: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.workspace }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/blackbaud", async (importOriginal) => ({
  ...await importOriginal(), getBlackbaudOpportunity: mocks.read, updateBlackbaudOpportunity: mocks.write,
}));
import { POST } from "./route";

const local = { id: 9, prospect_id: 1, blackbaud_opportunity_id: "90", blackbaud_constituent_id: "100", current_stage: "Solicitation", opportunity_status: "Active", expected_date: "2026-06-30", updated_at: "2026-09-01T12:00:00Z", revision: "2026-09-01 12:00:00.123456+00" };
const live = { id: "90", constituent_id: "100", status: "Solicitation", expected_date: "2026-06-30T00:00:00Z" };
function request(body = {}) {
  return POST(new Request("https://example.com/api/prospects/opportunities/9/rollover", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmed: true, fiscalYear: "FY27", expectedDate: "2026-06-30", ...body }),
  }), { params: { id: "9" } });
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-08T18:00:00Z"));
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "mgo@example.com" } });
  mocks.workspace.mockResolvedValue({ workspaceUser: { id: 7 }, sessionUser: { id: 7 }, isActing: false });
  mocks.sql.mockResolvedValueOnce([local]).mockResolvedValue([{ ...local, expected_date: "2027-06-30" }]);
  mocks.read.mockResolvedValueOnce(live).mockResolvedValue({ ...live, expected_date: "2027-06-30T00:00:00Z" });
  mocks.write.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe("confirmed opportunity fiscal-year rollover", () => {
  it("lets an Admin roll forward the selected MGO's opportunity with the Admin connection", async () => {
    mocks.workspace.mockResolvedValue({
      sessionUser: { id: 2, role: "admin" },
      workspaceUser: { id: 7, role: "mgo" },
      isActing: true,
    });
    expect((await request()).status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, authUserId: 2 }));
    expect(mocks.sql.mock.calls[0].at(-1)).toBe(7);
  });
  it("patches only expected_date, verifies NXT, then saves locally with a checkpoint", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ authUserId: 7, opportunityId: "90", payload: { expected_date: "2027-06-30T00:00:00Z" } }));
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.sql.mock.calls[0][0].join("?")).toContain("p.user_id =");
    expect(mocks.sql.mock.calls[1][0].join("?")).toContain("updated_at::text IS NOT DISTINCT FROM");
    expect(mocks.sql.mock.calls[1]).toContain(local.revision);
    expect(mocks.sql.mock.invocationCallOrder[1]).toBeGreaterThan(mocks.read.mock.invocationCallOrder[1]);
  });
  it("requires authentication", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("rejects read-only viewing as another MGO", async () => {
    mocks.workspace.mockResolvedValue({ workspaceUser: { id: 7 }, isActing: true });
    expect((await request()).status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each([{ confirmed: false }, { fiscalYear: "FY26" }, { expectedDate: null }])("requires current explicit confirmation %j", async (body) => {
    expect((await request(body)).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("does not reveal or change another workspace's opportunity", async () => {
    mocks.sql.mockReset().mockResolvedValue([]);
    expect((await request()).status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each(["Funded", "Withdrawn", "Qualification", "Stewardship"])("rechecks NXT status %s", async (status) => {
    mocks.read.mockReset().mockResolvedValue({ ...live, status });
    expect((await request()).status).toBe(409);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it.each([{ constituent_id: "999" }, { expected_date: "2026-05-31" }, { id: "999" }])("rejects changed NXT identity/date %j", async (changes) => {
    mocks.read.mockReset().mockResolvedValue({ ...live, ...changes });
    expect((await request()).status).toBe(409);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("rejects a changed local expected date", async () => {
    mocks.sql.mockReset().mockResolvedValue([{ ...local, expected_date: "2026-05-01" }]);
    expect((await request()).status).toBe(409);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("does not claim both systems updated on NXT write failure", async () => {
    mocks.write.mockRejectedValue(new Error("private response body"));
    const response = await request();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private response body");
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it("retains the local date if NXT readback does not verify the update", async () => {
    mocks.read.mockReset().mockResolvedValue(live);
    expect((await request()).status).toBe(409);
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it("reconciles a previous NXT success without another PATCH", async () => {
    mocks.read.mockReset().mockResolvedValue({ ...live, expected_date: "2027-06-30" });
    expect((await request()).status).toBe(200);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });
  it("reports a partial success if the local save fails", async () => {
    mocks.sql.mockReset().mockResolvedValueOnce([local]).mockRejectedValue(new Error("DB failed"));
    const response = await request();
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("retry to reconcile safely");
  });
  it("does not overwrite concurrent local edits", async () => {
    mocks.sql.mockReset().mockResolvedValueOnce([local]).mockResolvedValue([]);
    const response = await request();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("other fields were not overwritten");
  });
});
