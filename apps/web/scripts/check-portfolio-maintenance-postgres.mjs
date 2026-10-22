// Opt-in integration test against a disposable local database only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const host = process.env.MAINTENANCE_TEST_PGHOST;
if (!host?.startsWith("/private/tmp/") && !host?.startsWith("/tmp/")) throw Error("Use a disposable local PostgreSQL socket under /tmp.");
const schema = `maintenance_test_${randomUUID().replaceAll("-", "")}`;
const quote = value => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const run = query => new Promise((resolve, reject) => {
  const child = spawn(process.env.MAINTENANCE_TEST_PSQL || "psql", ["-XqAt", "-h", host,
    "-p", process.env.MAINTENANCE_TEST_PGPORT || "55439", "-U", process.env.USER,
    "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
  let output = "", error = "";
  child.stdout.on("data", data => output += data);
  child.stderr.on("data", data => error += data);
  child.on("error", reject);
  child.on("close", code => code ? reject(Error(error)) : resolve(output.trim()));
  child.stdin.end(`SET search_path TO ${schema};\n${query}`);
});
let now = "2026-09-30T16:00:00Z";
const sql = async (parts, ...values) => {
  let query = parts.reduce((text, part, i) => text + part + (i < values.length ? quote(values[i]) : ""), "");
  query = query.replaceAll("NOW()", `${quote(now)}::timestamptz`);
  if (query.includes("RETURNING")) return JSON.parse(await run(`WITH t AS (${query}) SELECT COALESCE(json_agg(t), '[]'::json) FROM t`));
  await run(query); return [];
};
const source = readFileSync(new URL("../src/app/api/utils/portfolioMaintenanceStore.js", import.meta.url), "utf8")
  .replace(/^import[\s\S]*?;\n/gm, "").replaceAll("export async function", "async function");
const store = new Function("sql", "randomUUID", "MAINTENANCE_DAYTIME_CALLS", "MAINTENANCE_NIGHT_CALLS", "MAINTENANCE_BATCH_CALLS", "MAINTENANCE_LEASE_SECONDS",
  `${source}\nreturn { ensureMaintenanceGate, claimMaintenanceGate, reserveMaintenanceCall, releaseMaintenanceGate };`)(sql, randomUUID, 360, 2160, 60, 240);
const schedulerSource = readFileSync(new URL("../src/app/api/utils/portfolioMaintenanceScheduler.js", import.meta.url), "utf8")
  .replace(/^import[\s\S]*?;\n/gm, "").replaceAll("export async function", "async function");
const scheduler = new Function("sql", "randomUUID", `${schedulerSource}\nreturn { claimPortfolioTurn, finishPortfolioTurn };`)(sql, randomUUID);
const origin = "https://example.org";
try {
  await run(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
    CREATE TABLE users (id bigint PRIMARY KEY, active boolean, role text DEFAULT 'mgo', blackbaud_constituent_id text DEFAULT '123',
      blackbaud_portfolio_cache jsonb, blackbaud_portfolio_cached_at timestamptz);
    CREATE TABLE blackbaud_api_limit_state (state_key text PRIMARY KEY, blocked_until timestamptz);
    CREATE TABLE portfolio_refresh_jobs (id bigint PRIMARY KEY, workspace_user_id bigint, mode text,
      cancel_requested boolean DEFAULT FALSE, status text, paused_until timestamptz,
      created_at timestamptz DEFAULT '2026-09-29', updated_at timestamptz DEFAULT '2026-09-29');
    CREATE TABLE portfolio_refresh_items (job_id bigint, constituent_id text, status text, updated_at timestamptz);
    CREATE TABLE portfolio_constituent_snapshots (workspace_user_id bigint, constituent_id text, data_complete boolean,
      summary_payload jsonb, last_error_stage text, stale_after timestamptz);
    CREATE TABLE portfolio_giving_snapshots (workspace_user_id bigint, constituent_id text, payload jsonb, stale_after timestamptz);
    INSERT INTO users (id,active) VALUES (7,TRUE),(8,FALSE);
    INSERT INTO portfolio_refresh_jobs (id,workspace_user_id,mode,status) VALUES (1,7,'nightly','queued'),(2,7,'full','queued');
    INSERT INTO portfolio_refresh_items VALUES (1,'123','pending','2026-01-01');`);
  await Promise.all(Array.from({ length: 8 }, () => store.ensureMaintenanceGate()));
  const claims = await Promise.all(Array.from({ length: 8 }, () => store.claimMaintenanceGate(origin, "1")));
  const gate = claims.find(Boolean);
  assert.equal(claims.filter(Boolean).length, 1);
  const identity = { ...gate, workspaceUserId: "7", constituentId: "123" };
  await run("UPDATE portfolio_refresh_jobs SET status='processing' WHERE id=1; UPDATE portfolio_refresh_items SET status='processing' WHERE job_id=1;");
  await run("UPDATE portfolio_maintenance_gate SET call_count=359;");
  const calls = await Promise.all(Array.from({ length: 12 }, () => store.reserveMaintenanceCall(identity)));
  assert.equal(calls.filter(Boolean).length, 1);
  assert.equal(await run("SELECT call_count FROM portfolio_maintenance_gate"), "360");
  console.log("PASS concurrent migration, single owner, and exact daily call cap.");

  await run("UPDATE portfolio_maintenance_gate SET call_count=0,batch_calls=59;");
  const batch = await Promise.all(Array.from({ length: 8 }, () => store.reserveMaintenanceCall(identity)));
  assert.equal(batch.filter(Boolean).length, 1);
  console.log("PASS exact per-batch cap under concurrent reservations.");

  await run("UPDATE portfolio_maintenance_gate SET batch_calls=0,call_day='2026-09-29',call_count=360;");
  assert.equal(await store.reserveMaintenanceCall(identity), true);
  assert.equal(await run("SELECT call_count FROM portfolio_maintenance_gate"), "1");
  for (const changed of [{ token: "wrong" }, { origin: "https://other.example.org" }, { workspaceUserId: "8" }, { constituentId: "999" }]) {
    assert.equal(await store.reserveMaintenanceCall({ ...identity, ...changed }), false);
  }
  await run("UPDATE users SET active=FALSE WHERE id=7;");
  assert.equal(await store.reserveMaintenanceCall(identity), false);
  await run("UPDATE users SET active=TRUE WHERE id=7; UPDATE portfolio_refresh_jobs SET cancel_requested=TRUE WHERE id=1;");
  assert.equal(await store.reserveMaintenanceCall(identity), false);
  await run("UPDATE portfolio_refresh_jobs SET cancel_requested=FALSE WHERE id=1;");
  console.log("PASS Eastern day rollover, scope fencing, inactive users, and cancellation.");

  await run("INSERT INTO blackbaud_api_limit_state VALUES ('subscription','2026-10-01T00:00:00Z');");
  assert.equal(await store.reserveMaintenanceCall(identity), false);
  await run("DELETE FROM blackbaud_api_limit_state;");
  now = "2026-09-30T16:02:41Z";
  assert.equal(await store.reserveMaintenanceCall(identity), false);
  now = "2026-09-30T16:05:00Z";
  assert.equal(await store.reserveMaintenanceCall(identity), false);
  console.log("PASS subscription cooldown, work deadline, and expired lease.");

  now = "2026-09-30T16:00:00Z";
  await store.releaseMaintenanceGate({ ...gate, token: "wrong" });
  assert.equal(await store.claimMaintenanceGate(origin, "1"), null);
  await store.releaseMaintenanceGate(gate);
  assert.equal(await store.claimMaintenanceGate(origin, "1"), null);
  await run("UPDATE portfolio_refresh_items SET status='pending'; UPDATE portfolio_refresh_jobs SET status='queued';");
  now = "2026-09-30T16:01:01Z";
  assert.equal(await store.claimMaintenanceGate(origin, "2"), null);
  assert(await store.claimMaintenanceGate(origin, "1"));
  console.log("PASS token-fenced release, spacing, and no manual/full-job continuation.");

  await run("UPDATE portfolio_maintenance_gate SET lease_until=NULL,next_allowed_at='2026-01-01';");
  for (const time of ["2026-09-30T05:00:00Z", "2026-09-30T10:59:59Z", "2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"]) {
    now = time;
    const nightGate = await store.claimMaintenanceGate(origin, "1");
    assert(nightGate);
    await run("UPDATE portfolio_maintenance_gate SET lease_until=NULL,next_allowed_at='2026-01-01';");
  }
  now = "2026-11-01T12:00:00Z";
  const winterGate = await store.claimMaintenanceGate(origin, "1");
  assert(winterGate);
  await run("UPDATE portfolio_refresh_jobs SET status='processing' WHERE id=1; UPDATE portfolio_refresh_items SET status='processing';");
  assert.equal(await store.reserveMaintenanceCall({ ...winterGate, workspaceUserId: "7", constituentId: "123" }), true);
  console.log("PASS database clock enforces night/day boundaries through DST.");

  now = "2026-11-02T06:10:00Z";
  await run("UPDATE portfolio_maintenance_gate SET lease_until=NULL,next_allowed_at='2026-01-01';");
  const membershipGate = await store.claimMaintenanceGate(origin, null, { workspaceUserId: "7" });
  assert(membershipGate);
  const membership = { ...membershipGate, constituentId: null };
  await run("UPDATE portfolio_maintenance_gate SET call_day='2026-11-02',night_call_count=2159,call_count=360;");
  const nightCalls = await Promise.all(Array.from({ length: 8 }, () => store.reserveMaintenanceCall(membership)));
  assert.equal(nightCalls.filter(Boolean).length, 1);
  assert.equal(await run("SELECT night_call_count || ':' || call_count FROM portfolio_maintenance_gate"), "2160:360");
  await run("UPDATE portfolio_maintenance_gate SET night_call_count=0;");
  assert.equal(await store.reserveMaintenanceCall({ ...membership, workspaceUserId: "8" }), false);
  assert.equal(await store.reserveMaintenanceCall({ ...membership, constituentId: "123" }), false);
  now = "2026-11-02T12:00:00Z";
  assert.equal(await store.reserveMaintenanceCall(membership), false);
  await run("UPDATE portfolio_maintenance_gate SET lease_until=NULL,next_allowed_at='2026-01-01';");
  assert.equal(await store.claimMaintenanceGate(origin, null, { workspaceUserId: "7" }), null);
  console.log("PASS independent night/day ceilings and night-only scoped membership reads.");

  now = "2026-11-03T06:00:00Z";
  await run(`DELETE FROM portfolio_refresh_items; DELETE FROM portfolio_refresh_jobs; DELETE FROM users;
    INSERT INTO users (id,active,blackbaud_portfolio_cache,blackbaud_portfolio_cached_at) VALUES
      (1,TRUE,'{"leadSolicitor":[{"constituentId":"101"}]}','2026-11-03T05:00:00Z'),
      (2,TRUE,NULL,NULL),(3,FALSE,NULL,NULL),(4,TRUE,'{"leadSolicitor":[{"constituentId":"104"}]}','2026-11-03T05:00:00Z');
    INSERT INTO portfolio_refresh_jobs (id,workspace_user_id,mode,status) VALUES (10,1,'nightly','queued');
    INSERT INTO portfolio_constituent_snapshots VALUES (4,'104',TRUE,'{}',NULL,'2026-11-10');
    INSERT INTO portfolio_giving_snapshots VALUES (4,'104','{}','2026-11-04');`);
  const first = await scheduler.claimPortfolioTurn();
  assert.equal(first.workspaceUserId, 2);
  assert.equal(first.refreshAssignments, true);
  const second = await scheduler.claimPortfolioTurn();
  assert.equal(second.workspaceUserId, 1);
  assert.equal(second.job.id, 10);
  assert.equal(await scheduler.claimPortfolioTurn(), null);
  await scheduler.finishPortfolioTurn(first, "failed");
  await scheduler.finishPortfolioTurn(second, "queued");
  now = "2026-11-03T06:20:00Z";
  const next = await scheduler.claimPortfolioTurn();
  assert.equal(next.workspaceUserId, 1);
  await scheduler.finishPortfolioTurn(next, "queued");
  assert.equal(await scheduler.claimPortfolioTurn(), null);
  now = "2026-11-03T07:10:00Z";
  const recovered = await scheduler.claimPortfolioTurn();
  assert.equal(recovered.workspaceUserId, 2);
  await scheduler.finishPortfolioTurn({ ...recovered, turnToken: "wrong" }, "completed");
  assert.equal(await run("SELECT last_result FROM portfolio_maintenance_schedule WHERE workspace_user_id=2"), "running");
  await scheduler.finishPortfolioTurn(recovered, "completed");
  console.log("PASS new MGO enrollment, fair turns, current-data skipping, failure backoff and token fencing.");

  await run(`UPDATE users SET blackbaud_portfolio_cache='{"leadSolicitor":[{"constituentId":"102"}]}',blackbaud_portfolio_cached_at='2026-11-03T07:00:00Z' WHERE id=2;
    UPDATE portfolio_refresh_jobs SET status='paused',paused_until='2026-11-04' WHERE id=10;
    UPDATE portfolio_maintenance_schedule SET next_attempt_at='2026-01-01',lease_until=NULL;
    INSERT INTO users (id,active,role) VALUES (5,TRUE,'admin'),(6,TRUE,'admin,mgo');`);
  const concurrentTurns = await Promise.all(Array.from({ length: 8 }, () => scheduler.claimPortfolioTurn()));
  assert.deepEqual(concurrentTurns.filter(Boolean).map(t => t.workspaceUserId).sort(), [2,6]);
  now = "2026-11-03T17:00:00Z";
  assert.equal(await scheduler.claimPortfolioTurn(true), null);
  await run("UPDATE portfolio_refresh_jobs SET paused_until=NULL,status='queued' WHERE id=10; UPDATE portfolio_maintenance_schedule SET next_attempt_at='2026-01-01',lease_until=NULL;");
  assert.equal((await scheduler.claimPortfolioTurn(true)).workspaceUserId, 1);
  await run("INSERT INTO blackbaud_api_limit_state VALUES ('subscription','2026-11-04'); UPDATE portfolio_maintenance_schedule SET next_attempt_at='2026-01-01',lease_until=NULL;");
  assert.equal(await scheduler.claimPortfolioTurn(), null);
  await run("DELETE FROM blackbaud_api_limit_state; UPDATE portfolio_refresh_jobs SET mode='full' WHERE id=10;");
  assert.equal(await scheduler.claimPortfolioTurn(true), null);
  console.log("PASS concurrent fair claiming, paused portfolio bypass, role scope, cooldown and manual-job isolation.");
} finally {
  await run(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}
