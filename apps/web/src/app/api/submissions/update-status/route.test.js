import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { sql, auth, getUser } = vi.hoisted(() => ({ sql: vi.fn(), auth: vi.fn(), getUser: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: sql }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: getUser }));
const row = { id: 78, status: "Pending", submission_type: "donor_update", interaction_type: "Cultivation", blackbaud_sync_status: "not_requested", blackbaud_sync_error: null };
const request = (body) => new Request("https://example.org/api/submissions/update-status", { method: "POST", body: JSON.stringify({ id: 78, ...body }) });

beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue({ user: { email: "reviewer@example.org" } });
  getUser.mockResolvedValue({ id: 1, role: "admin" });
  sql.mockResolvedValue([row]);
});

describe("submission review writes", () => {
  it.each(["Pending", "Approved", "Ready for CRM", "Needs Clarification"])("blocks an old tab from setting routine activity to %s", async (status) => {
    const response = await POST(request({ status }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("does not require approval");
    expect(sql).toHaveBeenCalledTimes(1);
  });
  it("also blocks reviewer-note writes to history-only activity", async () => {
    expect((await POST(request({ reviewerNotes: "Approved" }))).status).toBe(409);
    expect(sql).toHaveBeenCalledTimes(1);
  });
  it("blocks approval of synced records and unresolved sync failures", async () => {
    for (const blackbaud_sync_status of ["synced", "failed"]) {
      sql.mockResolvedValue([{ ...row, blackbaud_sync_status }]);
      expect((await POST(request({ status: "Approved" }))).status).toBe(409);
    }
    expect(sql).toHaveBeenCalledTimes(2);
  });
  it("allows notes on failures without changing status or calling NXT", async () => {
    sql.mockResolvedValue([{ ...row, blackbaud_sync_status: "failed" }]);
    expect((await POST(request({ reviewerNotes: "Investigating" }))).status).toBe(200);
    expect(sql).toHaveBeenCalledTimes(2);
    const [query, ...params] = sql.mock.calls[1];
    expect(query.join(" ")).toContain("status = COALESCE(");
    expect(params[0]).toBeUndefined();
    expect(params).toContain("Investigating");
  });
  it.each(["Data update", "Assignment request", "Add to top prospects"])("allows actual manual requests: %s", async (interaction_type) => {
    sql.mockResolvedValue([{ ...row, interaction_type }]);
    expect((await POST(request({ status: "Approved", reviewerNotes: "Reviewed" }))).status).toBe(200);
    expect(sql).toHaveBeenCalledTimes(2);
    expect(sql.mock.calls[1][0].join(" ")).toContain("blackbaud_sync_status IS NOT DISTINCT FROM");
  });
  it("rejects a record that changed after reading", async () => {
    sql.mockResolvedValueOnce([{ ...row, submission_type: "constituent_suggestion" }]).mockResolvedValueOnce([]);
    expect((await POST(request({ status: "Approved" }))).status).toBe(409);
  });
  it("retains authentication and reviewer-role checks", async () => {
    auth.mockResolvedValueOnce(null);
    expect((await POST(request({ status: "Approved" }))).status).toBe(401);
    getUser.mockResolvedValueOnce({ id: 1, role: "mgo" });
    expect((await POST(request({ status: "Approved" }))).status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });
});
