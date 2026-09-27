// Opt-in disposable local PostgreSQL only; never uses DATABASE_URL or NXT.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import Papa from "papaparse";
import { readDashboardPriorities, savePriorityPreference } from "./dashboardPriorities";
import { ensureSocietyGivingSchema } from "./societyGivingSource";
import { buildGiftPriorities, readSavedPortfolioGifts } from "./dashboardGiftPriorities";
const socket = process.env.PRIORITIES_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/dashboard-priorities-pg\.[A-Za-z0-9]+$/.test(socket || "");
const now = new Date("2026-09-27T14:00:00Z");
function execute(statement) {
  const output = execFileSync("/opt/homebrew/opt/postgresql@18/bin/psql", ["-X", "--no-password", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "55447", "-d", "postgres"],
    { input: `SET search_path = dashboard_priority_fixture;\n${statement}`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  return output.trim() ? Papa.parse(output.trim(), { header: true }).data.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === "" ? null : ["gifts", "active_metadata"].includes(key) ? JSON.parse(value) : key === "truncated" ? value === "t" : value]))) : [];
}
const literal = value => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const sqlClient = async (parts, ...values) => execute(parts.reduce((query, part, index) => query + part + (index < values.length ? literal(values[index]) : ""), ""));
const load = (viewerId = 7, workspaceId = 10, at = now) => readDashboardPriorities(viewerId, workspaceId, at, sqlClient);
const save = (item, action, viewerId = 7, workspaceId = 10) => savePriorityPreference({ item, action, days: 1, viewerId, workspaceId, now, sqlClient });

describe.skipIf(!enabled)("dashboard priority PostgreSQL persistence", () => {
  beforeAll(async () => {
    execute(`DROP SCHEMA IF EXISTS dashboard_priority_fixture CASCADE; CREATE SCHEMA dashboard_priority_fixture; SET search_path=dashboard_priority_fixture;
      CREATE TABLE users(id bigint PRIMARY KEY, active boolean DEFAULT TRUE, blackbaud_portfolio_cache jsonb, blackbaud_portfolio_cached_at timestamptz);
      CREATE TABLE organization_settings(id int PRIMARY KEY);
      CREATE TABLE constituents(id bigint PRIMARY KEY, name text);
      CREATE TABLE prospects(id bigint PRIMARY KEY, user_id bigint, prospect_name text, status text, blackbaud_constituent_id text);
      CREATE TABLE pending_actions(id bigint PRIMARY KEY, owner_user_id bigint, prospect_id bigint, constituent_id bigint, title text, details text, due_date date, status text, updated_at timestamptz);
      CREATE TABLE prospect_opportunities(id bigint PRIMARY KEY, prospect_id bigint, title text, current_stage text, opportunity_status text, blackbaud_opportunity_id text, shared_opportunity_key text,
        expected_date date, estimated_amount numeric, closed_amount numeric, close_date date, updated_at timestamptz, nxt_checked_at timestamptz, pipeline_change_id uuid);`);
    const ddl = readFileSync("src/app/api/utils/ensureAppSchema.js", "utf8").match(/DO \$organization_audit_schema\$[\s\S]*?\$organization_audit_schema\$/)[0];
    execute(ddl); execute(ddl);
    await ensureSocietyGivingSchema(sqlClient);
  });
  beforeEach(() => {
    execute(`TRUNCATE users, organization_settings_audits, dashboard_priority_preferences, prospects, pending_actions, prospect_opportunities CASCADE;
      INSERT INTO users(id) VALUES (7),(8),(10),(20);
      INSERT INTO prospects VALUES (1,10,'Sample Donor','Active','100'),(2,20,'Other Workspace','Active','200');
      INSERT INTO pending_actions VALUES (1,10,1,NULL,'Call donor','Saved note','2026-09-27','Open','2026-09-20'),
        (2,20,2,NULL,'Private to other workspace',NULL,'2026-09-26','Open','2026-09-20'),
        (3,10,NULL,NULL,'Standalone follow-up',NULL,'2026-09-28','Open','2026-09-20');
      INSERT INTO prospect_opportunities(id,prospect_id,title,current_stage,opportunity_status,blackbaud_opportunity_id,expected_date,estimated_amount,updated_at)
        VALUES (1,1,'Scholarships','Cultivation','Active','900','2026-10-01',25000,'2026-09-20'),
          (2,2,'Private opportunity','Cultivation','Active','901','2026-10-01',10000,'2026-09-20');`);
  });
  it("executes real bounded source queries with owner isolation, including standalone follow-ups", async () => {
    const result = await load();
    expect(result.items.map(item => item.title)).toEqual(["Call donor", "Standalone follow-up", "Scholarships"]);
    expect(result.truncated).toBe(false);
    expect((await load(7, 20)).items.map(item => item.title)).toEqual(["Private to other workspace", "Private opportunity"]);
  });
  it("persists preferences per viewer/workspace without changing any source record", async () => {
    const item = (await load()).items[0];
    const before = execute("SELECT * FROM pending_actions ORDER BY id");
    await save(item, "dismiss");
    expect((await load()).hidden).toHaveLength(1);
    expect((await load(8)).hidden).toHaveLength(0);
    expect((await load(7, 20)).hidden).toHaveLength(0);
    expect(execute("SELECT * FROM pending_actions ORDER BY id")).toEqual(before);
    await save(item, "restore");
    expect((await load()).hidden).toHaveLength(0);
  });
  it("upserts repeated choices without duplicates and expires a snooze the next Eastern day", async () => {
    const item = (await load()).items[0];
    await save(item, "dismiss"); await save(item, "snooze"); await save(item, "snooze");
    expect(execute("SELECT count(*) FROM dashboard_priority_preferences")[0].count).toBe("1");
    expect((await load()).hidden[0]).toMatchObject({ hiddenReason: "snoozed", snoozeUntil: "2026-09-28" });
    expect((await load(7, 10, new Date("2026-09-28T04:01:00Z"))).hidden).toHaveLength(0);
  });
  it("resurfaces changed facts, ignores stale restores, and removes completed records", async () => {
    const oldItem = (await load()).items[0]; await save(oldItem, "dismiss");
    execute("UPDATE pending_actions SET title='New plan' WHERE id=1");
    const currentItem = (await load()).items.find(item => item.key === oldItem.key);
    expect(currentItem.title).toBe("New plan");
    await save(currentItem, "dismiss"); await save(oldItem, "restore");
    expect((await load()).hidden).toHaveLength(1);
    execute("UPDATE pending_actions SET status='Done' WHERE id=1");
    expect((await load()).hidden).toHaveLength(0);
  });
  it("collapses a newer funded duplicate instead of surfacing its stale open copy", async () => {
    execute(`INSERT INTO prospect_opportunities(id,prospect_id,title,current_stage,opportunity_status,blackbaud_opportunity_id,expected_date,updated_at)
      VALUES (3,1,'Scholarships','Funded','Funded','900','2026-10-01','2026-09-25');`);
    expect((await load()).items.filter(item => item.kind === "opportunity")).toHaveLength(0);
  });

  const gift = (id = "900", constituentId = "100", amount = 2500) => ({ id, constituent_id: constituentId, type: "Donation", date: "2026-09-25", amount: { value: amount }, soft_credits: [] });
  const metadata = { version: 1, checkedAt: "2026-09-27T06:00:00Z", startDate: "2026-01-01", endDate: "2026-09-27" };
  function seedGifts(gifts = [gift()]) {
    execute(`UPDATE users SET blackbaud_portfolio_cached_at='2026-09-27T05:00:00Z',
      blackbaud_portfolio_cache='{"leadSolicitor":[{"constituentId":"100","name":"Sample Donor"}],"supportingSolicitor":[{"constituentId":"100","name":"Sample Donor"}]}' WHERE id=10;
      UPDATE users SET blackbaud_portfolio_cached_at='2026-09-27T05:00:00Z',
      blackbaud_portfolio_cache='{"leadSolicitor":[{"constituentId":"200","name":"Other Donor"}]}' WHERE id=20;
      INSERT INTO society_giving_sources(scope_key,auth_user_id,active_generation,active_metadata) VALUES ('scope',7,'published',${literal(JSON.stringify(metadata))}::jsonb);
      INSERT INTO society_giving_source_pages VALUES ('scope','published',0,${literal(JSON.stringify(gifts))}::jsonb);`);
  }
  const loadGifts = async (workspaceId = 10, scopeKey = "scope") => buildGiftPriorities(await readSavedPortfolioGifts({ workspaceId, scopeKey, now, db: sqlClient }), now);

  it("reads current portfolio direct donors only, not soft-credit spouses or another workspace", async () => {
    seedGifts([gift(), gift("901", "200"), { ...gift("902", "300"), soft_credits: [{ constituent_id: "100", amount: { value: 2500 } }] }]);
    expect((await loadGifts()).items.map(item => item.key)).toEqual(["gift:900"]);
    expect((await loadGifts(20)).items.map(item => item.key)).toEqual(["gift:901"]);
    expect((await loadGifts(10, "old-connection")).items).toEqual([]);
    execute("UPDATE users SET blackbaud_portfolio_cache='{}' WHERE id=10");
    expect((await loadGifts()).items).toEqual([]);
  });
  it("reads only published pages and withholds a conflicting gift even if another copy belongs to a different donor", async () => {
    seedGifts([gift(), gift("900", "300")]);
    execute(`INSERT INTO society_giving_source_pages VALUES ('scope','pending',1,${literal(JSON.stringify([gift("901")]))}::jsonb)`);
    expect((await loadGifts()).items).toEqual([]);
    execute(`UPDATE society_giving_source_pages SET gifts=${literal(JSON.stringify([gift()]))}::jsonb WHERE generation='published'`);
    expect((await loadGifts()).items.map(item => item.key)).toEqual(["gift:900"]);
  });
  it("bounds high-value gift candidates without letting small gifts consume the limit", async () => {
    seedGifts([...Array.from({ length: 240 }, (_, i) => gift(String(1000 + i), "100", 10)),
      ...Array.from({ length: 205 }, (_, i) => gift(String(2000 + i)))]);
    const result = await loadGifts();
    expect(result.items).toHaveLength(200); expect(result.truncated).toBe(true);
  });
  it("persists gift dismissal without mutating the source and stays hidden after the next publication", async () => {
    seedGifts();
    const giftData = await loadGifts(); const item = giftData.items[0];
    await save(item, "dismiss");
    expect((await readDashboardPriorities(7, 10, now, sqlClient, giftData)).hidden.map(item => item.key)).toEqual(["gift:900"]);
    expect((await readDashboardPriorities(8, 10, now, sqlClient, giftData)).hidden).toEqual([]);
    execute(`INSERT INTO society_giving_source_pages SELECT scope_key,'new-published',page_number,gifts FROM society_giving_source_pages;
      UPDATE society_giving_sources SET active_generation='new-published', active_metadata=jsonb_set(active_metadata,'{checkedAt}','"2026-09-27T12:00:00Z"');`);
    expect((await readDashboardPriorities(7, 10, now, sqlClient, await loadGifts())).hidden.map(item => item.key)).toEqual(["gift:900"]);
    expect(execute("SELECT count(*) FROM pending_actions")[0].count).toBe("3");
  });
  it("handles an organization-sized saved source while returning only this portfolio's gifts", async () => {
    seedGifts();
    execute(`INSERT INTO society_giving_source_pages(scope_key,generation,page_number,gifts)
      SELECT 'scope','published',1 + ((n-1)/500), jsonb_agg(jsonb_build_object('id',(10000+n)::text,
        'constituent_id','999','type','Donation','date','2026-09-25','amount',jsonb_build_object('value',5000)))
      FROM generate_series(1,90000) n GROUP BY ((n-1)/500);`);
    const start = performance.now();
    const result = await loadGifts();
    console.info(`Synthetic 90,001-gift saved-source read: ${Math.round(performance.now() - start)}ms (local PostgreSQL, not a production benchmark)`);
    expect(result.items.map(item => item.key)).toEqual(["gift:900"]);
    expect(result.truncated).toBe(false);
  });
});
