// Opt-in disposable Unix-socket database. Never uses DATABASE_URL or live NXT.
import { execFileSync } from "node:child_process";
import Papa from "papaparse";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn(), getBlackbaudConfig: origin => ({ clientId: "test", redirectUri: process.env.BLACKBAUD_REDIRECT_URI || `${origin}/api/blackbaud/callback`, subscriptionKey: "key" }) }));
import { advanceSocietyGivingSource, ensureSocietyGivingSchema, loadSocietyAnnualGifts } from "./societyGivingSource";
import { giftPriorityWindow, loadDashboardGifts } from "./dashboardGiftPriorities";

const socket = process.env.SOCIETY_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/society-source-pg\.[A-Za-z0-9]+$/.test(socket || "");
const literal = (v) => v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replaceAll("'", "''")}'`;
function execute(statement) {
  const output = execFileSync("/opt/homebrew/opt/postgresql@18/bin/psql", ["-X", "--no-password", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "55442", "-d", "postgres"], { input: statement, encoding: "utf8" });
  return output.trim() ? Papa.parse(output.trim(), { header: true }).data.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === "" ? null :
      ["active_metadata", "pending", "gifts", "reconcile_cursor", "previous", "payload", "summary_payload"].includes(key) ? JSON.parse(value) : value]))) : [];
}
async function db(parts, ...values) {
  return execute(typeof parts === "string"
    ? parts.replace(/\$(\d+)/g, (_, n) => literal(values[0][Number(n) - 1]))
    : parts.reduce((s, p, i) => s + p + (i < values.length ? literal(values[i]) : ""), ""));
}
const raw = { id: "100", constituent_id: "200", type: "Donation", date: "2026-09-17", amount: { value: 10342 },
  gift_splits: [{ fund_id: "500" }], soft_credits: [{ id: "300", constituent_id: "401", amount: { value: 10342 } }] };
const definitions = [{ key: "presidents", name: "President's Society", basis: "annual", periodBasis: "calendar_year", minimumAmount: 10000, countSources: ["received_revenue", "recognition_credit"], active: true }];
const context = { db, authUserId: 1, origin: "https://test", societyDefinitions: definitions };
const api = vi.fn();
const advance = () => advanceSocietyGivingSource({ ...context, apiFetch: api });
const load = () => loadSocietyAnnualGifts({ ...context, constituentId: "401", startDate: "2026-01-01", endDate: "2026-12-31" });
const state = () => execute("SELECT * FROM society_giving_sources")[0];

describe.skipIf(!enabled)("society source PostgreSQL lifecycle", () => {
  beforeAll(async () => {
    execute(`DROP TABLE IF EXISTS society_giving_source_pages, society_giving_sources, portfolio_giving_snapshots, portfolio_constituent_snapshots, blackbaud_connections, users CASCADE;
      CREATE TABLE users(id bigint PRIMARY KEY, active boolean DEFAULT TRUE, blackbaud_portfolio_cached_at timestamptz, blackbaud_portfolio_cache jsonb);
      CREATE TABLE blackbaud_connections(id bigint PRIMARY KEY, user_id bigint, connected_at timestamptz);
      CREATE TABLE portfolio_giving_snapshots(workspace_user_id bigint, constituent_id text, payload jsonb);
      CREATE TABLE portfolio_constituent_snapshots(workspace_user_id bigint, constituent_id text, summary_payload jsonb);`);
    await ensureSocietyGivingSchema(db);
  });
  beforeEach(() => {
    execute(`TRUNCATE society_giving_source_pages, society_giving_sources, users, blackbaud_connections, portfolio_giving_snapshots, portfolio_constituent_snapshots;
      INSERT INTO users(id) VALUES (1);
      INSERT INTO blackbaud_connections VALUES (1,1,'2026-01-01');
      INSERT INTO portfolio_giving_snapshots VALUES (7,'401','{"mapped":{"annualGivingSocieties":{"combinedAnnualGiving":0,"societies":[{"basis":"lifetime","label":"1934 Club","hierarchy":5}],"lifetimeSocieties":[{"basis":"lifetime","label":"1934 Club","hierarchy":5}],"lifetimeGiving":{"committedTotal":130692}},"contact":"keep"},"currentFyGiving":{"received":8}}');
      INSERT INTO portfolio_constituent_snapshots SELECT workspace_user_id, constituent_id, payload FROM portfolio_giving_snapshots;`);
    api.mockReset().mockImplementation(async (path) => path.includes("/fundraising/")
      ? { count: 1, value: [{ id: "500", description: "Scholarship" }] }
      : { count: 1, value: [raw] });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("shares one completed source with the dashboard across deployments without another NXT scan", async () => {
    vi.stubEnv("AUTH_URL", "https://example.app/"); vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("BLACKBAUD_REDIRECT_URI", "");
    const currentDate = giftPriorityWindow(new Date()).end;
    execute(`UPDATE users SET blackbaud_portfolio_cached_at=NOW(), blackbaud_portfolio_cache='{"leadSolicitor":[{"constituentId":"200","name":"Synthetic Donor"}]}' WHERE id=1`);
    api.mockImplementation(async path => path.includes("/fundraising/")
      ? { count: 1, value: [{ id: "500", description: "Scholarship" }] }
      : { count: 1, value: [{ ...raw, date: currentDate }] });
    const dashboard = origin => loadDashboardGifts({ workspaceId: 1, origin, db, refreshUser: async () => ({ id: 1, role: "admin" }) });
    expect((await dashboard("https://www.example.app")).coverage.status).toBe("unavailable");
    expect(await advanceSocietyGivingSource({ ...context, origin: "https://first-deploy.vercel.app", apiFetch: api })).toMatchObject({ status: "published", calls: 2 });
    const generation = state().active_generation;
    const result = await dashboard("https://www.example.app");
    expect(result.coverage.status).toBe("ready");
    expect(result.items.map(item => item.giftId)).toEqual(["100"]);
    expect(await advanceSocietyGivingSource({ ...context, origin: "https://next-deploy.vercel.app", apiFetch: api })).toMatchObject({ status: "reconciling" });
    expect(state().active_generation).toBe(generation);
    expect(execute("SELECT COUNT(*) AS count FROM society_giving_sources")[0].count).toBe("1");
    expect(api).toHaveBeenCalledTimes(2);
    vi.stubEnv("AUTH_URL", "https://sandbox.example.app");
    expect((await dashboard("https://sandbox.example.app")).coverage.status).toBe("unavailable");
    vi.stubEnv("AUTH_URL", "https://example.app"); vi.stubEnv("VERCEL_ENV", "preview");
    expect((await dashboard("https://preview.vercel.app")).coverage.status).toBe("unavailable");
    expect(api).toHaveBeenCalledTimes(2);
  });
  it("publishes complete credit data and reconciles badges without touching other saved fields", async () => {
    expect(await advance()).toMatchObject({ status: "published", calls: 2 });
    expect((await load()).gifts[0].soft_credits[0].constituent_id).toBe("401");
    expect(await advance()).toMatchObject({ status: "reconciling", reconciled: 1 });
    const payload = execute("SELECT payload FROM portfolio_giving_snapshots")[0].payload;
    expect(payload.mapped.annualGivingSocieties.societies.map((s) => s.label)).toEqual(["President's Society", "1934 Club"]);
    expect(payload.mapped.contact).toBe("keep");
    expect(payload.currentFyGiving).toEqual({ received: 8 });
    expect(execute("SELECT summary_payload FROM portfolio_constituent_snapshots")[0].summary_payload).toEqual(payload);
    expect(await advance()).toMatchObject({ status: "current" });
    expect(api).toHaveBeenCalledTimes(2);
    expect(api.mock.calls.every(([, options]) => !options.method && options.maxRetries === 0)).toBe(true);
  });
  it("keeps last good data and resumes from a quota checkpoint without restarting the fund directory", async () => {
    await advance();
    const oldGeneration = state().active_generation;
    execute("UPDATE society_giving_sources SET reconciled_at=NOW(), active_metadata=jsonb_set(active_metadata,'{checkedAt}',to_jsonb((NOW()-INTERVAL '21 hours')::text))");
    let giftCalls = 0;
    api.mockImplementation(async (path) => {
      if (path.includes("/fundraising/")) return { value: [{ id: "500", description: "Scholarship" }] };
      giftCalls += 1;
      if (giftCalls === 1) return { count: 2, value: [raw], next_link: "/gift/v1/gifts?offset=1" };
      throw Object.assign(new Error("Quota exceeded"), { httpStatus: 429, retryAfterMs: 60000 });
    });
    expect(await advance()).toMatchObject({ status: "paused", quotaPaused: true });
    expect(state().active_generation).toBe(oldGeneration);
    expect(state().pending.next).toContain("offset=1");
    expect((await load()).gifts).toHaveLength(1);
    expect(await advance()).toMatchObject({ status: "waiting" });
    execute("UPDATE society_giving_sources SET retry_after=NOW()-INTERVAL '1 minute'");
    api.mockResolvedValueOnce({ count: 2, value: [{ ...raw, id: "101" }] });
    expect(await advance()).toMatchObject({ status: "published", calls: 1 });
    expect((await load()).gifts).toHaveLength(2);
  });
  it("rejects malformed or truncated data without publishing a partial source", async () => {
    await advance();
    const generation = state().active_generation;
    execute("UPDATE society_giving_sources SET reconciled_at=NOW(), active_metadata=jsonb_set(active_metadata,'{checkedAt}',to_jsonb((NOW()-INTERVAL '21 hours')::text))");
    api.mockImplementation(async (path) => path.includes("/fundraising/") ? { value: [{ id: "500", description: "Scholarship" }] } : { count: 2, value: [raw] });
    expect(await advance()).toMatchObject({ status: "paused" });
    expect(state().active_generation).toBe(generation);
    expect(state().pending).toBeNull();
  });
  it("has a five-call budget and persists a restartable checkpoint", async () => {
    let page = 0;
    api.mockImplementation(async (path) => path.includes("/fundraising/") ? { value: [{ id: "500", description: "Scholarship" }] }
      : { value: [{ ...raw, id: String(100 + page++) }], next_link: `/gift/v1/gifts?offset=${page}` });
    expect(await advance()).toEqual({ status: "processing", calls: 5 });
    expect(state().active_generation).toBeNull();
    expect(state().pending.rows).toBe(4);
    await expect(load()).rejects.toThrow(/pending/);
    api.mockResolvedValueOnce({ value: [{ ...raw, id: "104" }] });
    expect(await advance()).toMatchObject({ status: "published", calls: 1 });
  });
  it("prevents overlapping workers and stale-lease publication", async () => {
    let finish;
    api.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const first = advance();
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(await advance()).toEqual({ status: "waiting" });
    execute("UPDATE society_giving_sources SET lease_token='other-worker'");
    finish({ value: [{ id: "500", description: "Scholarship" }] });
    await first;
    expect(state().active_generation).toBeNull();
    expect(state().lease_token).toBe("other-worker");
  });
  it("reconnecting cannot reuse the former connection's completed gifts", async () => {
    await advance();
    execute("UPDATE blackbaud_connections SET connected_at=NOW()");
    await expect(load()).rejects.toThrow(/pending/);
  });
  it("retains a newer concurrently saved society result during reconciliation", async () => {
    await advance();
    execute(`UPDATE portfolio_giving_snapshots SET payload=jsonb_set(payload,'{mapped,annualGivingSocieties}',
      '{"recognitionSource":{"checkedAt":"2099-01-01"},"combinedAnnualGiving":20000}'::jsonb)`);
    await advance();
    expect(execute("SELECT payload FROM portfolio_giving_snapshots")[0].payload.mapped.annualGivingSocieties.combinedAnnualGiving).toBe(20000);
  });
  it("reconciles changed thresholds from the complete source without another NXT scan", async () => {
    await advance(); await advance(); await advance();
    const result = await advanceSocietyGivingSource({ ...context, apiFetch: api,
      societyDefinitions: [{ ...definitions[0], minimumAmount: 20000 }] });
    expect(result.status).toBe("reconciling");
    expect(api).toHaveBeenCalledTimes(2);
    const annual = execute("SELECT payload FROM portfolio_giving_snapshots")[0].payload.mapped.annualGivingSocieties;
    expect(annual.annualSocieties).toEqual([]);
    expect(annual.lifetimeSocieties[0].label).toBe("1934 Club");
  });
});
