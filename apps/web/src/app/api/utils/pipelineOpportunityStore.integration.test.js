// Disposable Unix-socket database only. Never reads DATABASE_URL or calls NXT.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Papa from "papaparse";
const fixture = vi.hoisted(() => ({ query: null }));
vi.mock("./sql", () => ({ default: (parts, ...values) => fixture.query(parts, values) }));
import { claimPipelineChange, completePipelineChange, copySnapshot, getPipelineReceipt, loadPipelineCopies, rejectPipelineChange } from "./pipelineOpportunityStore";
const socket = process.env.PIPELINE_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/pipeline-change-pg\.[A-Za-z0-9]+$/.test(socket || "");
function execute(statement) {
  const output = execFileSync("/opt/homebrew/opt/postgresql@18/bin/psql", ["-X", "--no-password", "-q", "--csv", "-v", "ON_ERROR_STOP=1",
    "-h", socket, "-p", "55443", "-d", "postgres"], { input: `SET search_path = pipeline_change_fixture;\n${statement}`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  return output.trim() ? Papa.parse(output.trim(), { header: true }).data.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, value === "" ? null : ["copies", "patch", "before_remote"].includes(key) ? JSON.parse(value) : value]))) : [];
}
const literal = value => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const receiptId = "a303c1f0-b129-4acb-9004-cd4825e685cf";
const next = { title: "Updated", purpose: "Campaign", current_stage: "Solicitation", opportunity_status: "Active", estimated_amount: 2000,
  ask_date: null, expected_date: "2027-03-01", closed_amount: null, close_date: null };
async function receipt() {
  return { id: receiptId, opportunity_id: "1", nxt_id: "900", constituent_id: "100", actor_id: 10, operation: "edit",
    patch: { name: "Updated" }, before_remote: { name: "Original" }, copies: copySnapshot(await loadPipelineCopies("1")) };
}

describe.skipIf(!enabled)("pipeline PostgreSQL change transaction", () => {
  beforeAll(() => {
    fixture.query = async (parts, values) => execute(parts.reduce((query, part, index) => query + part + (index < values.length ? literal(values[index]) : ""), ""));
    execute("DROP SCHEMA IF EXISTS pipeline_change_fixture CASCADE; CREATE SCHEMA pipeline_change_fixture;");
    const schema = readFileSync("src/app/api/utils/ensureAppSchema.js", "utf8");
    execute(`CREATE TABLE users(id bigint PRIMARY KEY, blackbaud_summary_cache jsonb, blackbaud_summary_cache_key text, blackbaud_summary_cached_at timestamptz);
      CREATE TABLE constituents(id bigint PRIMARY KEY, blackbaud_constituent_id text);
      CREATE TABLE prospects(id bigint PRIMARY KEY, user_id bigint, constituent_id bigint, blackbaud_constituent_id text, status text, ask_amount numeric, closed_amount numeric, close_date date, priority_order int);
      CREATE TABLE prospect_opportunities(id bigint PRIMARY KEY, prospect_id bigint, constituent_id bigint, blackbaud_opportunity_id text, shared_opportunity_key text,
        title text, purpose text, current_stage text, opportunity_status text, estimated_amount numeric, ask_date date, expected_date date, closed_amount numeric, close_date date,
        latest_notes text, updated_at timestamptz, nxt_checked_at timestamptz, nxt_retry_after timestamptz, pipeline_change_id uuid);
      CREATE TABLE portfolio_constituent_snapshots(id bigint PRIMARY KEY, workspace_user_id bigint, constituent_id text, stale_after timestamptz, summary_payload jsonb);
      ${schema.match(/CREATE TABLE IF NOT EXISTS opportunity_change_receipts \([\s\S]*?\n      \)/)[0]};
      CREATE UNIQUE INDEX opportunity_change_pending_nxt ON opportunity_change_receipts(nxt_id) WHERE state = 'pending';
      ${schema.match(/CREATE OR REPLACE FUNCTION protect_pending_pipeline_change\(\)[\s\S]*?\$pipeline_guard\$ LANGUAGE plpgsql/)[0]};
      CREATE TRIGGER protect_pending_pipeline_change BEFORE UPDATE ON prospect_opportunities FOR EACH ROW EXECUTE FUNCTION protect_pending_pipeline_change();`);
  });
  beforeEach(() => {
    execute(`TRUNCATE users, constituents, prospects, prospect_opportunities, portfolio_constituent_snapshots, opportunity_change_receipts;
      INSERT INTO users(id,blackbaud_summary_cache) VALUES (10,'{}'), (20,'{}');
      INSERT INTO prospects VALUES (1,10,NULL,'100','Active',1000,NULL,NULL,3), (2,20,NULL,'100','Archived',1000,NULL,NULL,4), (3,20,NULL,'200','Active',7000,NULL,NULL,1);
      INSERT INTO prospect_opportunities(id,prospect_id,blackbaud_opportunity_id,shared_opportunity_key,title,current_stage,opportunity_status,estimated_amount,expected_date,latest_notes,updated_at)
        VALUES (1,1,'900','joint','Original','Cultivation','Active',1000,'2027-01-01','Keep notes','2026-09-01T00:00:00Z'),
          (2,2,NULL,'joint','Original','Cultivation','Active',1000,'2027-01-01','Other notes','2026-09-01T00:00:00Z'),
          (3,3,'999',NULL,'Unrelated','Cultivation','Active',7000,'2027-01-01','Private','2026-09-01T00:00:00Z');
      INSERT INTO portfolio_constituent_snapshots VALUES (1,10,'100','2099-01-01','{"saved":true}'), (2,20,'100','2099-01-01','{"saved":true}');`);
  });
  it("claims every explicit shared copy, persists intent, and atomically updates all copies and derived totals", async () => {
    const change = await receipt(); expect(change.copies).toHaveLength(2);
    await claimPipelineChange(change);
    expect((await getPipelineReceipt(receiptId)).state).toBe("pending");
    await completePipelineChange(change, next);
    expect(execute("SELECT title,blackbaud_opportunity_id,pipeline_change_id FROM prospect_opportunities ORDER BY id")).toEqual([
      { title: "Updated", blackbaud_opportunity_id: "900", pipeline_change_id: null },
      { title: "Updated", blackbaud_opportunity_id: "900", pipeline_change_id: null },
      { title: "Unrelated", blackbaud_opportunity_id: "999", pipeline_change_id: null },
    ]);
    expect(execute("SELECT ask_amount,status,priority_order FROM prospects ORDER BY id")).toEqual([
      { ask_amount: "2000", status: "Active", priority_order: "3" }, { ask_amount: "2000", status: "Archived", priority_order: "4" }, { ask_amount: "7000", status: "Active", priority_order: "1" },
    ]);
    expect(execute("SELECT latest_notes FROM prospect_opportunities WHERE id=2")[0].latest_notes).toBe("Other notes");
    expect(execute("SELECT COUNT(*) AS count FROM users WHERE blackbaud_summary_cache IS NULL")[0].count).toBe("2");
    expect(execute("SELECT COUNT(*) AS count FROM portfolio_constituent_snapshots WHERE stale_after <= NOW() AND summary_payload IS NOT NULL")[0].count).toBe("2");
    expect((await getPipelineReceipt(receiptId)).state).toBe("complete");
  });
  it("rejects a stale group as a whole with no partially claimed copies", async () => {
    const change = await receipt();
    execute("UPDATE prospect_opportunities SET updated_at=NOW() WHERE id=2");
    await expect(claimPipelineChange(change)).rejects.toThrow(/changed/);
    expect(execute("SELECT COUNT(*) AS count FROM opportunity_change_receipts")[0].count).toBe("0");
    expect(execute("SELECT COUNT(*) AS count FROM prospect_opportunities WHERE pipeline_change_id IS NOT NULL")[0].count).toBe("0");
  });
  it("rechecks workspace ownership even when opportunity timestamps did not change", async () => {
    const change = await receipt();
    execute("UPDATE prospects SET user_id=20 WHERE id=1");
    await expect(claimPipelineChange(change)).rejects.toThrow(/changed/);
    expect(execute("SELECT COUNT(*) AS count FROM opportunity_change_receipts")[0].count).toBe("0");
  });
  it("permits one outstanding change only and blocks legacy local overwrites", async () => {
    const change = await receipt(); await claimPipelineChange(change);
    await expect(claimPipelineChange({ ...change, id: "02d177d1-9706-41a8-91a8-cfe4a961fb2c" })).rejects.toThrow();
    expect(() => execute("UPDATE prospect_opportunities SET title='Concurrent edit' WHERE id=1")).toThrow(/pending pipeline change/);
    expect(execute("SELECT title FROM prospect_opportunities WHERE id=1")[0].title).toBe("Original");
    await rejectPipelineChange(change.id);
    expect((await getPipelineReceipt(change.id)).state).toBe("rejected");
    expect(execute("SELECT pipeline_change_id IS NULL AS released FROM prospect_opportunities WHERE id=1")[0].released).toBe("t");
  });
  it("archives without deleting history or preserving an active ask total", async () => {
    const change = { ...await receipt(), operation: "archive" }; await claimPipelineChange(change);
    await completePipelineChange(change, { ...next, opportunity_status: "Archived", closed_amount: 800, close_date: "2026-09-01" });
    expect(execute("SELECT opportunity_status,closed_amount FROM prospect_opportunities WHERE id=1")[0]).toEqual({ opportunity_status: "Archived", closed_amount: "800" });
    expect(execute("SELECT ask_amount FROM prospects WHERE id=1")[0].ask_amount).toBe("0");
    expect(execute("SELECT COUNT(*) AS count FROM prospect_opportunities")[0].count).toBe("3");
  });
  it("rolls back all local changes and keeps pending intent if derived updates fail", async () => {
    const change = await receipt(); await claimPipelineChange(change);
    execute("ALTER TABLE users ADD CONSTRAINT reject_cache_clear CHECK (blackbaud_summary_cache IS NOT NULL)");
    try { await expect(completePipelineChange(change, next)).rejects.toThrow(); }
    finally { execute("ALTER TABLE users DROP CONSTRAINT reject_cache_clear"); }
    expect(execute("SELECT title,pipeline_change_id FROM prospect_opportunities WHERE id=1")[0]).toEqual({ title: "Original", pipeline_change_id: receiptId });
    expect((await getPipelineReceipt(change.id)).state).toBe("pending");
    await completePipelineChange(change, next);
    expect((await getPipelineReceipt(change.id)).state).toBe("complete");
  });
});
