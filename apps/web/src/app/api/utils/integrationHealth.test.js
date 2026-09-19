import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sql, refreshUser } = vi.hoisted(() => ({ sql: vi.fn(), refreshUser: vi.fn() }));
vi.mock("./sql", () => ({ default: sql }));
vi.mock("./reportRefresh", () => ({ getReportRefreshUser: refreshUser }));
import { connectionHealth, portfolioHealth, readIntegrationHealth } from "./integrationHealth";

const now = Date.parse("2026-09-17T15:00:00Z");
const current = { has_mapping: true, has_portfolio: true, total: 10, summary_current: 10, giving_current: 10, summary_failed: 0 };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  vi.clearAllMocks();
  vi.stubEnv("PORTFOLIO_ACTIVITY_WORKSPACE_IDS", "7");
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "allowlist");
  vi.stubEnv("PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS", "");
  vi.stubEnv("PORTFOLIO_ACTIVITY_ORIGIN", "https://app.example");
  vi.stubEnv("VERCEL_ENV", "production");
  refreshUser.mockResolvedValue({ id: 7, name: "Service owner", email: "private@example.test" });
  sql.mockImplementation(async strings => {
    const text = strings.join(" ");
    if (text.includes("SELECT id, role, active")) return [{ id: 7, active: true, role: "mgo", has_portfolio: true }];
    if (text.includes("blackbaud_api_limit_state")) return [{ blocked_until: "2026-09-17T15:30:00Z", message: "private provider body" }];
    if (text.includes("FROM users u LEFT JOIN blackbaud_connections")) return [{ id: 7, name: "Service owner", has_access: true, has_refresh: true, total_rows: 1, access_token: "TOKEN", refresh_token: "SECRET", email: "private@example.test" }];
    if (text.includes("WITH workspaces")) return [{ ...current, id: 7, name: "Test MGO", total_rows: 1, last_error_message: "private donor" }];
    if (text.includes("WITH assigned")) return [{ total: 20, never_checked: 4, due: 6, connection_errors: 1, throttled: 2, other_errors: 0, last_checked_at: "2026-09-17T14:00:00Z" }];
    if (text.includes("FROM portfolio_activity_refresh_gates")) return [{ calls_today: 12 }];
    if (text.includes("FROM pending_action_nxt_receipts")) return [{ pending_action_id: 33, owner_user_id: 7, name: "Test MGO", active: true, state: "review", has_action_id: true, reminder_status: "Open", total_rows: 1, request_payload: { notes: "DONOR NOTES" }, constituent_id: "DONOR ID" }];
    throw new Error("Unexpected SQL");
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("saved status classifications", () => {
  it("does not call an expired renewable token a broken connection", () => {
    expect(connectionHealth({ has_access: true, has_refresh: true, expires_at: "2020-01-01" }, now).level).toBe("quiet");
    expect(connectionHealth({ has_access: true, has_refresh: false, expires_at: "2020-01-01" }, now).label).toBe("Reconnect needed");
    expect(connectionHealth({ has_access: false }, now).level).toBe("notice");
  });
  it("separates missing snapshots, mapping problems, backlogs and real current data", () => {
    expect(portfolioHealth(current, now).level).toBe("quiet");
    expect(portfolioHealth({ ...current, has_portfolio: false }, now).label).toBe("No assignment snapshot");
    expect(portfolioHealth({ ...current, has_mapping: false }, now).label).toBe("Fundraiser mapping needed");
    expect(portfolioHealth({ ...current, summary_current: 4 }, now).label).toBe("Refresh backlog");
    expect(portfolioHealth({ ...current, summary_failed: 1 }, now).level).toBe("review");
  });
  it("prioritizes an active cooldown and does not promise a worker heartbeat", () => {
    expect(portfolioHealth({ ...current, summary_failed: 5, paused_until: "2026-09-17T16:00:00Z" }, now).level).toBe("wait");
    expect(portfolioHealth({ ...current, job_status: "processing", job_updated_at: "2026-09-17T14:00:00Z" }, now).label).toBe("Progress needs checking");
    expect(portfolioHealth({ ...current, job_status: "queued", job_updated_at: "2026-09-17T14:59:00Z" }, now).label).toBe("Refresh in progress");
  });
});

describe("read-only health projection", () => {
  it("returns only allowlisted operational data, with no provider calls or writes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
      expect(result.sections.quota.paused).toBe(true);
      expect(result.sections.activity).toMatchObject({ enrollmentMode: "allowlist", workspaceCount: 1, awaitingAssignments: 0, due: 6, neverChecked: 4, total: 20, callsToday: 12, dailyBudget: 360 });
      expect(result.sections.verifications.items[0].href).toBe("/follow-ups?tab=next-steps&nextStepId=33&status=Open");
      const json = JSON.stringify(result);
      for (const value of ["TOKEN", "SECRET", "DONOR", "private", "request_payload", "access_token"]) expect(json).not.toContain(value);
      expect(fetchSpy).not.toHaveBeenCalled();
      for (const [strings] of sql.mock.calls) {
        const statement = strings.join(" ");
        expect(statement).toMatch(/^\s*(SELECT|WITH)\b/);
        expect(statement).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/);
      }
    } finally { fetchSpy.mockRestore(); }
  });
  it("preserves unknown sections on a read failure and still reads other sections", async () => {
    sql.mockRejectedValueOnce(new Error("secret provider body"));
    const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    expect(result.sections.quota).toEqual({ available: false });
    expect(result.sections.connections.available).toBe(true);
    expect(result.sections.verifications.available).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret provider body");
  });
  it.each(["https://other.example", "http://app.example"])("does not read activity from another origin (%s)", async origin => {
    const result = await readIntegrationHealth({ viewerId: 7, origin });
    expect(result.sections.activity).toEqual({ available: true, enabled: false });
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("WITH assigned"))).toBe(false);
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("SELECT id, role, active"))).toBe(false);
  });
  it("shows disabled for the preview environment without expanding the pilot", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    expect(result.sections.activity.enabled).toBe(false);
  });
  it("marks an absent portfolio unknown instead of a zero-record healthy portfolio", async () => {
    const original = sql.getMockImplementation();
    sql.mockImplementation((s, ...v) => s.join(" ").includes("WITH workspaces")
      ? [{ ...current, id: 7, name: "Test", has_portfolio: null, total_rows: 1 }]
      : original(s, ...v));
    const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    expect(result.sections.portfolios.items[0]).toMatchObject({ total: null, summaryDue: null, givingDue: null, failed: null });
  });
  it("scopes activity to currently assigned constituents and excludes successful receipts", async () => {
    await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    const activityCall = sql.mock.calls.find(([s]) => s.join(" ").includes("WITH assigned"));
    expect(activityCall.slice(1)).toEqual([["7"], "https://app.example"]);
    expect(activityCall[0].join(" ")).toContain("SELECT DISTINCT");
    const receipts = sql.mock.calls.find(([s]) => s.join(" ").includes("FROM pending_action_nxt_receipts"))[0].join(" ");
    expect(receipts).toContain("r.state IN ('review', 'processing')");
    expect(receipts).toContain("LIMIT 100");
  });
  it("reports automatic enrollment and setup gaps from local account metadata only", async () => {
    vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "active_mgos");
    vi.stubEnv("PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS", "10");
    const original = sql.getMockImplementation();
    sql.mockImplementation((s, ...v) => s.join(" ").includes("SELECT id, role, active")
      ? [{ id: 7, active: true, role: "mgo", has_portfolio: true }, { id: 12, active: true, role: "executive,mgo", has_portfolio: null }, { id: 10, active: true, role: "mgo", has_portfolio: true }]
      : original(s, ...v));
    const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    expect(result.sections.activity).toMatchObject({ enabled: true, enrollmentMode: "active_mgos", workspaceCount: 2, awaitingAssignments: 1, dailyBudget: 360 });
    expect(sql.mock.calls.find(([s]) => s.join(" ").includes("WITH assigned")).slice(1)).toEqual([["7", "12"], "https://app.example"]);
  });
  it("shows unknown rather than disabled or healthy when enrollment discovery fails", async () => {
    const original = sql.getMockImplementation();
    sql.mockImplementation((s, ...v) => s.join(" ").includes("SELECT id, role, active")
      ? Promise.reject(new Error("private data")) : original(s, ...v));
    const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    expect(result.sections.activity).toEqual({ available: false });
    expect(result.sections.verifications.available).toBe(true);
  });
});
