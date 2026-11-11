import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sql, refreshUser } = vi.hoisted(() => ({ sql: vi.fn(), refreshUser: vi.fn() }));
vi.mock("./sql", () => ({ default: sql }));
vi.mock("./reportRefresh", () => ({ getReportRefreshUser: refreshUser }));
import { connectionHealth, portfolioHealth, portfolioJobFailureCounts, readIntegrationHealth } from "./integrationHealth";

const now = Date.parse("2026-09-17T15:00:00Z");
const current = { has_mapping: true, has_portfolio: true, total: 10, summary_current: 10, giving_current: 10, summary_failed: 0 };
const scheduled = { available: true, enabled: true, initialized: true, dayCalls: 360, nightCalls: 100 };
const quietJob = { ...current, job_mode: "nightly", job_status: "queued", job_updated_at: "2026-09-17T14:00:00Z" };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  vi.clearAllMocks();
  vi.stubEnv("PORTFOLIO_ACTIVITY_WORKSPACE_IDS", "7");
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "allowlist");
  vi.stubEnv("PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS", "");
  vi.stubEnv("PORTFOLIO_ACTIVITY_ORIGIN", "https://app.example");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("PORTFOLIO_ACTIVITY_CATCHUP_ENABLED", "");
  vi.stubEnv("PORTFOLIO_MAINTENANCE_CONTINUATION_ENABLED", "");
  refreshUser.mockResolvedValue({ id: 7, name: "Service owner", email: "private@example.test" });
  sql.mockImplementation(async (strings, ...values) => {
    const text = strings.join(" ");
    if (text.includes("SELECT id, role, active")) return [{ id: 7, active: true, role: "mgo", has_portfolio: true }];
    if (text.includes("blackbaud_api_limit_state")) return [{ blocked_until: "2026-09-17T15:30:00Z", message: "private provider body" }];
    if (text.includes("FROM users u LEFT JOIN blackbaud_connections")) return [{ id: 7, name: "Service owner", has_access: true, has_refresh: true, total_rows: 1, access_token: "TOKEN", refresh_token: "SECRET", email: "private@example.test" }];
    if (text.includes("WITH workspaces")) return [{ ...current, id: 7, name: "Test MGO", total_rows: 1, last_error_message: "private donor" }];
    if (text.includes("WITH capacity_workspaces")) return [{ workspace_count: 1, unknown_workspaces: 0, assignments_due: 0,
      assignment_slots: 10, unique_constituents: 10, due_slots: 4, giving_due: 3, summary_due: 2,
      never_checked: 1, giving_over_48_hours: 0, giving_checked_24_hours: 9 }];
    if (text.includes("WITH enrolled_workspaces")) return [{ workspace_count: values[0].length, awaiting_assignments: values[0].includes("12") ? 1 : 0,
      total: 20, never_checked: 4, due: 6, connection_errors: 1, throttled: 2, other_errors: 0, last_checked_at: "2026-09-17T14:00:00Z", items: [] }];
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
    expect(portfolioHealth({ ...current, summary_current: 4 }, now).label).toBe("Updates pending");
    expect(portfolioHealth({ ...current, summary_failed: 1 }, now).level).toBe("review");
    expect(portfolioHealth({ ...current, job_status: "completed_with_failures", failed_count: 1 }, now).level).toBe("review");
  });
  it("shows a routine cooldown neutrally without hiding confirmed errors or unexplained delays", () => {
    expect(portfolioHealth({ ...quietJob, paused_until: "2026-09-17T16:00:00Z" }, now).level).toBe("wait");
    expect(portfolioHealth({ ...quietJob, summary_failed: 5, paused_until: "2026-09-17T16:00:00Z" }, now).level).toBe("review");
    expect(portfolioHealth(quietJob, now).label).toBe("Update timing needs a check");
    expect(portfolioHealth({ ...current, job_status: "queued", job_updated_at: "2026-09-17T14:59:00Z" }, now).label).toBe("Update in progress");
  });
  it("keeps recovered job attempts as history rather than current errors", () => {
    const recovered = { ...current, job_status: "completed_with_failures", failed_count: 3,
      failed_item_count: 3, recovered_failed_count: 3 };
    expect(portfolioJobFailureCounts(recovered)).toEqual({ failed: 3, recoveredFailed: 3, unresolvedFailed: 0 });
    expect(portfolioHealth(recovered, now).label).toBe("Saved data current");
    expect(portfolioHealth({ ...recovered, summary_current: 9 }, now).label).toBe("Updates pending");
    expect(portfolioHealth({ ...recovered, giving_current: 8 }, now).label).toBe("Updates pending");
    expect(portfolioHealth({ ...recovered, summary_failed: 1 }, now).label).toBe("Refresh needs investigation");
    expect(portfolioHealth({ ...recovered, recovered_failed_count: 2 }, now).level).toBe("review");
    expect(portfolioHealth({ ...recovered, job_status: "processing", job_updated_at: "2026-09-17T14:59:00Z" }, now).label).toBe("Update in progress");
    expect(portfolioHealth({ ...recovered, job_status: "processing", job_updated_at: "2026-09-17T14:00:00Z" }, now).label).toBe("Update timing needs a check");
    expect(portfolioHealth({ ...recovered, job_status: "paused", paused_until: "2026-09-17T16:00:00Z" }, now).label).toBe("Updates temporarily paused");
  });
  it("explains a confirmed scheduled budget wait without calling it a failure", () => {
    expect(portfolioHealth(quietJob, now, { maintenance: scheduled })).toMatchObject({ level: "notice", label: "Scheduled update pending" });
    expect(portfolioHealth(quietJob, now, { maintenance: scheduled }).guidance).toContain("No manual retry is needed");
    expect(portfolioHealth({ ...current, giving_current: 9 }, now, { maintenance: scheduled }).label).toBe("Scheduled update pending");
    expect(portfolioHealth({ ...quietJob, job_updated_at: "2026-09-17T14:59:00Z" }, now,
      { maintenance: { ...scheduled, dayCalls: 359 } }).label).toBe("Updating automatically");
  });
  it.each([
    { available: false }, { ...scheduled, enabled: false }, { ...scheduled, initialized: false },
    { ...scheduled, dayCalls: null }, { ...scheduled, dayCalls: undefined },
    { ...scheduled, dayCalls: "360" }, { ...scheduled, dayCalls: -1 }, { ...scheduled, dayCalls: 359 },
  ])("does not explain away a quiet job with missing or inadequate budget evidence: %j", maintenance => {
    expect(portfolioHealth(quietJob, now, { maintenance }).label).toBe("Update timing needs a check");
  });
  it.each(["stale", "full", null])("does not apply scheduled budget excuses to manual/unknown mode %s", job_mode => {
    expect(portfolioHealth({ ...quietJob, job_mode }, now, { maintenance: scheduled }).level).toBe("delayed");
  });
  it.each([
    ["2026-09-17T04:59:00Z", 360, 0, "Scheduled update pending"],
    ["2026-09-17T05:00:00Z", 360, 0, "Update timing needs a check"],
    ["2026-09-17T10:59:00Z", 0, 2160, "Scheduled update pending"],
    ["2026-09-17T11:00:00Z", 0, 2160, "Update timing needs a check"],
    ["2026-11-01T05:30:00Z", 0, 2160, "Scheduled update pending"],
    ["2026-11-01T06:30:00Z", 0, 2160, "Scheduled update pending"],
  ])("uses the worker's Eastern budget window at %s", (timestamp, dayCalls, nightCalls, label) => {
    expect(portfolioHealth({ ...quietJob, job_updated_at: "2026-09-16T12:00:00Z" }, Date.parse(timestamp),
      { maintenance: { ...scheduled, dayCalls, nightCalls } }).label).toBe(label);
  });
  it("keeps material delays and current errors visible even during intentional waits", () => {
    const delayed = portfolioHealth({ ...quietJob, delayed_count: 1 }, now, { maintenance: scheduled });
    expect(delayed).toMatchObject({ level: "delayed", label: "Some information is delayed" });
    expect(delayed.guidance).toContain("next background request allowance");
    expect(portfolioHealth({ ...quietJob, summary_failed: 1 }, now, { maintenance: scheduled }).level).toBe("review");
    expect(portfolioHealth({ ...quietJob, failed_count: 1 }, now, { maintenance: scheduled }).level).toBe("review");
  });
  it("uses a confirmed shared pause without inventing one from unknown or expired evidence", () => {
    const quota = { available: true, paused: true, blockedUntil: "2026-09-17T16:00:00Z" };
    expect(portfolioHealth(quietJob, now, { quota, maintenance: scheduled }).label).toBe("Updates temporarily paused");
    expect(portfolioHealth(quietJob, now, { quota: { ...quota, available: false } }).level).toBe("delayed");
    expect(portfolioHealth(quietJob, now, { quota: { ...quota, blockedUntil: "2026-09-17T14:00:00Z" } }).level).toBe("delayed");
    expect(portfolioHealth(current, now, { quota }).label).toBe("Saved data current");
  });
  it.each([
    [{ failed_count: 2 }, { failed: 2, recoveredFailed: 0, unresolvedFailed: 2 }],
    [{ failed_count: 2, recovered_failed_count: 2 }, { failed: 2, recoveredFailed: 0, unresolvedFailed: 2 }],
    [{ failed_count: 3, failed_item_count: 2, recovered_failed_count: 2 }, { failed: 3, recoveredFailed: 2, unresolvedFailed: 1 }],
    [{ failed_count: 0, failed_item_count: 2, recovered_failed_count: 1 }, { failed: 2, recoveredFailed: 1, unresolvedFailed: 1 }],
  ])("keeps missing evidence or a lagging job counter conservative: %j", (row, expected) => {
    expect(portfolioJobFailureCounts(row)).toEqual(expected);
    expect(portfolioHealth({ ...current, ...row }, now).level).toBe("review");
  });
});

describe("read-only health projection", () => {
  it("returns recovery counts without changing history or making extra portfolio reads", async () => {
    const original = sql.getMockImplementation();
    sql.mockImplementation((s, ...v) => s.join(" ").includes("WITH workspaces")
      ? [{ ...current, id: 7, name: "Test", total_rows: 1, job_status: "completed_with_failures",
        processed_count: 10, job_total: 10, success_count: 7, failed_count: 3,
        failed_item_count: 3, recovered_failed_count: 3 }]
      : original(s, ...v));
    const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    expect(result.sections.portfolios.items[0]).toMatchObject({ level: "quiet", failed: 0,
      job: { processed: 10, total: 10, completed: 7, failed: 3, recoveredFailed: 3, unresolvedFailed: 0 } });
    expect(sql.mock.calls.filter(([s]) => s.join(" ").includes("WITH workspaces"))).toHaveLength(1);
  });
  it("keeps portfolio status unavailable when the recovery evidence cannot be read", async () => {
    const original = sql.getMockImplementation();
    sql.mockImplementation((s, ...v) => s.join(" ").includes("WITH workspaces")
      ? Promise.reject(new Error("private query failure")) : original(s, ...v));
    const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    expect(result.sections.portfolios).toEqual({ available: false });
    expect(result.sections.verifications.available).toBe(true);
  });
  it("reads maintenance budgets and fair turns without exposing tokens or initializing schema", async () => {
    vi.stubEnv("PORTFOLIO_MAINTENANCE_CONTINUATION_ENABLED", "true");
    vi.stubEnv("PORTFOLIO_MAINTENANCE_ORIGIN", "https://app.example");
    const original = sql.getMockImplementation();
    sql.mockImplementation((s, ...v) => {
      const query = s.join(" ");
      if (query.includes("to_regclass('portfolio_maintenance_gate')")) return [{ has_gate: true, has_schedule: true }];
      if (query.includes("FROM portfolio_maintenance_gate WHERE")) return [{ day_calls: 15, night_calls: 100, lease_token: "PRIVATE-TOKEN" }];
      if (query.includes("FROM portfolio_maintenance_schedule")) return [{ id: 7, name: "Test MGO", last_result: "queued", lease_token: "PRIVATE-TOKEN" }];
      return original(s, ...v);
    });
    const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    expect(result.sections.maintenance).toMatchObject({ enabled: true, initialized: true, dayCalls: 15, nightCalls: 100, dayLimit: 360, nightLimit: 2160,
      turns: [{ id: "7", name: "Test MGO", result: "queued" }] });
    expect(JSON.stringify(result)).not.toContain("PRIVATE-TOKEN");
    const gateRead = sql.mock.calls.find(([s]) => s.join(" ").includes("FROM portfolio_maintenance_gate WHERE"));
    expect(gateRead[0].join(" ")).toContain("AND origin =");
    expect(gateRead.slice(1)).toEqual(["https://app.example"]);
    expect(sql.mock.calls.map(([s]) => s.join(" ")).join(" ")).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/);
    sql.mockClear();
    expect((await readIntegrationHealth({ viewerId: 7, origin: "https://other.example" })).sections.maintenance.enabled).toBe(false);
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("portfolio_maintenance"))).toBe(false);
  });
  it("reuses saved maintenance evidence before classifying portfolios, with no extra reads or writes", async () => {
    vi.stubEnv("PORTFOLIO_MAINTENANCE_CONTINUATION_ENABLED", "true");
    vi.stubEnv("PORTFOLIO_MAINTENANCE_ORIGIN", "https://app.example");
    const original = sql.getMockImplementation();
    sql.mockImplementation((s, ...v) => {
      const query = s.join(" ");
      if (query.includes("blackbaud_api_limit_state")) return [];
      if (query.includes("to_regclass('portfolio_maintenance_gate')")) return [{ has_gate: true, has_schedule: true }];
      if (query.includes("FROM portfolio_maintenance_gate WHERE")) return [{ day_calls: 360, night_calls: 100 }];
      if (query.includes("FROM portfolio_maintenance_schedule")) return [];
      if (query.includes("WITH workspaces")) return [{ ...quietJob, id: 7, name: "Test MGO", total_rows: 1 }];
      return original(s, ...v);
    });
    const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    expect(result.sections.portfolios.items[0]).toMatchObject({ label: "Scheduled update pending", level: "notice" });
    expect(sql.mock.calls.filter(([s]) => s.join(" ").includes("FROM portfolio_maintenance_gate WHERE"))).toHaveLength(1);
    expect(sql.mock.calls.filter(([s]) => s.join(" ").includes("WITH workspaces"))).toHaveLength(1);
    expect(sql.mock.calls.map(([s]) => s.join(" ")).join(" ")).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/);
  });
  it("returns only allowlisted operational data, with no provider calls or writes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
      expect(result.sections.quota.paused).toBe(true);
      expect(result.sections.capacity).toMatchObject({ available: true, slots: 10, due: 4, itemsPerNight: 360 });
      expect(result.sections.activity.capacity).toMatchObject({ callsPerNight: 288, minimumSweepNights: 1 });
      expect(result.sections.activity).toMatchObject({ catchupEnabled: false, catchupCallsToday: null });
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
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("WITH enrolled_workspaces"))).toBe(false);
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
    const activityCall = sql.mock.calls.find(([s]) => s.join(" ").includes("WITH enrolled_workspaces"));
    expect(activityCall.slice(1)).toEqual([["7"], "https://app.example", 100]);
    expect(activityCall[0].join(" ")).toContain("SELECT DISTINCT");
    const receipts = sql.mock.calls.find(([s]) => s.join(" ").includes("FROM pending_action_nxt_receipts"))[0].join(" ");
    expect(receipts).toContain("r.state IN ('review', 'processing')");
    expect(receipts).toContain("r.state = 'saved' AND r.local_finalized_at IS NULL");
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
    expect(sql.mock.calls.find(([s]) => s.join(" ").includes("WITH enrolled_workspaces")).slice(1)).toEqual([["7", "12"], "https://app.example", 100]);
  });
  it("shows unknown rather than disabled or healthy when enrollment discovery fails", async () => {
    const original = sql.getMockImplementation();
    sql.mockImplementation((s, ...v) => s.join(" ").includes("SELECT id, role, active")
      ? Promise.reject(new Error("private data")) : original(s, ...v));
    const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    expect(result.sections.activity).toEqual({ available: false });
    expect(result.sections.verifications.available).toBe(true);
  });
  it("keeps a failed coverage read unknown without issuing per-workspace fallbacks", async () => {
    const original = sql.getMockImplementation();
    sql.mockImplementation((s, ...v) => s.join(" ").includes("WITH enrolled_workspaces")
      ? Promise.reject(new Error("private data")) : original(s, ...v));
    const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    expect(result.sections.activity).toEqual({ available: false });
    expect(result.sections.verifications.available).toBe(true);
    expect(sql.mock.calls.filter(([s]) => s.join(" ").includes("WITH enrolled_workspaces"))).toHaveLength(1);
  });
  it("does not turn a failed capacity read into zero backlog or hide other sections", async () => {
    const original = sql.getMockImplementation();
    sql.mockImplementation((s, ...v) => s.join(" ").includes("WITH capacity_workspaces")
      ? Promise.reject(new Error("private data")) : original(s, ...v));
    const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    expect(result.sections.capacity).toEqual({ available: false });
    expect(result.sections.portfolios.available).toBe(true);
    expect(result.sections.verifications.available).toBe(true);
  });
  it("shows catch-up reservations as part of the unchanged daily allowance", async () => {
    vi.stubEnv("PORTFOLIO_ACTIVITY_CATCHUP_ENABLED", "true");
    const original = sql.getMockImplementation();
    sql.mockImplementation((s, ...v) => s.join(" ").includes("FROM portfolio_activity_refresh_gates")
      ? [{ calls_today: 304, catchup_calls_today: 16 }] : original(s, ...v));
    const result = await readIntegrationHealth({ viewerId: 7, origin: "https://app.example" });
    expect(result.sections.activity).toMatchObject({ catchupEnabled: true, catchupCallsToday: 16, callsToday: 304,
      dailyBudget: 360, capacity: { callsPerNight: 288, catchupCallsPerDay: 72, callsPerDay: 360 } });
  });
});
