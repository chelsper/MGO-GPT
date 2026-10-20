// @vitest-environment node
// Separate real PostgreSQL connections; never uses DATABASE_URL or NXT.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeEach, afterAll, describe, expect, it } from "vitest";
import pipelineChangeGuardSchema from "./pipelineChangeGuardSchema";

const socket = process.env.PIPELINE_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/pipeline-change-pg\.[A-Za-z0-9]+$/.test(socket || "");
const schema = `pipeline_startup_${process.pid}`;
let initialized = false;
let statement;
await pipelineChangeGuardSchema(async (parts) => { statement = parts.join(""); });
const legacy = readFileSync(new URL("./fixtures/pipeline-guard-before-2026-10-20.sql", import.meta.url), "utf8");

function query(text, { timeout = 20_000 } = {}) {
  if (!enabled) throw new Error("An isolated local pipeline test socket is required.");
  return new Promise((resolve, reject) => {
    const child = execFile("/opt/homebrew/opt/postgresql@18/bin/psql", [
      "-X", "--no-password", "-qAt", "-v", "ON_ERROR_STOP=1",
      "-h", socket, "-p", "55443", "-d", "postgres",
    ], { timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout.trim());
    });
    child.stdin.end(`SET search_path TO ${schema};\n${text}`);
  });
}
async function install() { return query(`${statement}; SELECT pg_backend_pid();`); }
async function catalog() {
  return JSON.parse(await query(`SELECT json_build_object(
    'function_oid', p.oid, 'function_xmin', p.xmin::text,
    'trigger_oid', t.oid, 'trigger_xmin', t.xmin::text,
    'trigger_count', (SELECT count(*) FROM pg_trigger WHERE tgrelid='prospect_opportunities'::regclass AND NOT tgisinternal))
    FROM pg_proc p JOIN pg_trigger t ON t.tgfoid=p.oid
    WHERE p.oid='protect_pending_pipeline_change()'::regprocedure
      AND t.tgrelid='prospect_opportunities'::regclass;`));
}
const receipt = "a303c1f0-b129-4acb-9004-cd4825e685cf";

describe.skipIf(!enabled)("pipeline startup guard on independent PostgreSQL sessions", () => {
  beforeEach(async () => {
    await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema};
      SET search_path TO ${schema};
      CREATE TABLE prospect_opportunities (
        id bigint PRIMARY KEY, title text, pipeline_change_id uuid,
        nxt_retry_after timestamptz, updated_at timestamptz
      );
      INSERT INTO prospect_opportunities VALUES
        (1,'Pending fictional opportunity','${receipt}',NULL,'2026-10-20'),
        (2,'Ordinary fictional opportunity',NULL,NULL,'2026-10-20');`);
    initialized = true;
  });
  afterAll(async () => { if (initialized) await query(`DROP SCHEMA ${schema} CASCADE;`); });

  it("serializes simultaneous first installs across 16 independent sessions", async () => {
    const pids = await Promise.all(Array.from({ length: 16 }, install));
    expect(new Set(pids).size).toBe(16);
    expect(await catalog()).toMatchObject({ trigger_count: 1 });
    expect(await query("SELECT count(*) FROM prospect_opportunities")).toBe("2");
  });
  it("leaves the already-deployed definition and trigger untouched across repeated cold starts", async () => {
    await query(legacy);
    const before = await catalog();
    await Promise.all(Array.from({ length: 16 }, install));
    expect(await catalog()).toEqual(before);
  });
  it("repairs an older function body once without replacing its trigger or records", async () => {
    await query(`CREATE FUNCTION protect_pending_pipeline_change() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER protect_pending_pipeline_change BEFORE UPDATE ON prospect_opportunities
        FOR EACH ROW EXECUTE FUNCTION protect_pending_pipeline_change();`);
    const before = await catalog();
    await Promise.all(Array.from({ length: 16 }, install));
    const after = await catalog();
    expect(after.function_oid).toBe(before.function_oid);
    expect(after.function_xmin).not.toBe(before.function_xmin);
    expect(after.trigger_oid).toBe(before.trigger_oid);
    expect(after.trigger_xmin).toBe(before.trigger_xmin);
    await install();
    expect(await catalog()).toEqual(after);
  });
  it("blocks stale edits and allows no-ops and retry-only updates while a receipt is pending", async () => {
    await install();
    await expect(query("UPDATE prospect_opportunities SET title='Lost update' WHERE id=1")).rejects.toThrow("pending pipeline change");
    await query("UPDATE prospect_opportunities SET title=title WHERE id=1");
    await query("UPDATE prospect_opportunities SET nxt_retry_after=NOW() WHERE id=1");
    await expect(query("UPDATE prospect_opportunities SET nxt_retry_after=NOW(),updated_at=NOW() WHERE id=1")).rejects.toThrow("pending pipeline change");
    expect(await query("SELECT title FROM prospect_opportunities WHERE id=1")).toBe("Pending fictional opportunity");
    await query("UPDATE prospect_opportunities SET title='Normal edit' WHERE id=2");
  });
  it("still permits atomic receipt completion and later ordinary edits", async () => {
    await install();
    await query("UPDATE prospect_opportunities SET pipeline_change_id=NULL,title='Verified completion' WHERE id=1");
    await query("UPDATE prospect_opportunities SET title='Later edit' WHERE id=1");
    expect(await query("SELECT title FROM prospect_opportunities WHERE id=1")).toBe("Later edit");
  });
  it("recreates a missing trigger without rewriting an already-current function", async () => {
    await query(legacy);
    const before = await catalog();
    await query("DROP TRIGGER protect_pending_pipeline_change ON prospect_opportunities");
    await install();
    expect((await catalog()).function_xmin).toBe(before.function_xmin);
    await expect(query("UPDATE prospect_opportunities SET title='Lost update' WHERE id=1")).rejects.toThrow("pending pipeline change");
  });
  it("fails closed for a disabled trigger and recovers without a stuck advisory lock", async () => {
    await query(legacy);
    await query("ALTER TABLE prospect_opportunities DISABLE TRIGGER protect_pending_pipeline_change");
    await expect(install()).rejects.toThrow("needs administrator review");
    await query("ALTER TABLE prospect_opportunities ENABLE TRIGGER protect_pending_pipeline_change");
    await install();
    expect(await catalog()).toMatchObject({ trigger_count: 1 });
  });
  it("rolls back a partial function replacement when a mismatched trigger is found", async () => {
    await query(`CREATE FUNCTION different_guard() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER protect_pending_pipeline_change BEFORE UPDATE ON prospect_opportunities
        FOR EACH ROW EXECUTE FUNCTION different_guard();`);
    await expect(install()).rejects.toThrow("needs administrator review");
    expect(await query("SELECT to_regprocedure('protect_pending_pipeline_change()') IS NULL")).toBe("t");
    await query("DROP TRIGGER protect_pending_pipeline_change ON prospect_opportunities");
    await install();
  });
  it("actually waits for another database session's transaction lock", async () => {
    const holder = query("BEGIN; SELECT pg_advisory_xact_lock(734019,8); SELECT pg_sleep(1); COMMIT;");
    let waiter;
    try {
      let locked = false;
      for (let attempt = 0; attempt < 20 && !locked; attempt += 1) {
        locked = (await query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=734019 AND objid=8 AND granted)")) === "t";
      }
      expect(locked).toBe(true);
      waiter = install();
      let waiting = false;
      for (let attempt = 0; attempt < 20 && !waiting; attempt += 1) {
        waiting = (await query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=734019 AND objid=8 AND NOT granted)")) === "t";
      }
      expect(waiting).toBe(true);
      await holder;
      await waiter;
    } finally {
      await Promise.allSettled([holder, waiter]);
    }
  });
  it("bounds lock contention and allows a fresh attempt after the holder finishes", async () => {
    const holder = query("BEGIN; SELECT pg_advisory_xact_lock(734019,8); SELECT pg_sleep(6); COMMIT;");
    try {
      let locked = false;
      for (let attempt = 0; attempt < 20 && !locked; attempt += 1) {
        locked = (await query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=734019 AND objid=8 AND granted)")) === "t";
      }
      expect(locked).toBe(true);
      await expect(install()).rejects.toThrow("lock timeout");
      expect(await query("SELECT to_regprocedure('protect_pending_pipeline_change()') IS NULL")).toBe("t");
    } finally {
      await holder;
    }
    await install();
    expect(await catalog()).toMatchObject({ trigger_count: 1 });
  }, 15_000);
});
