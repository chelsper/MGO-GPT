// Optional integration test. Requires a disposable local PostgreSQL Unix socket.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const host = process.env.ACTIVITY_TEST_PGHOST;
if (!host?.startsWith("/private/tmp/") && !host?.startsWith("/tmp/")) throw new Error("Use an explicit disposable local PostgreSQL socket under /tmp.");
const schema = `activity_test_${randomUUID().replaceAll("-", "")}`;
const root = fileURLToPath(new URL("../src/", import.meta.url));
const quote = value => value == null ? "NULL" : Array.isArray(value)
  ? `ARRAY[${value.map(quote).join(",")}]` : typeof value === "boolean" || typeof value === "number"
    ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const run = query => new Promise((resolve, reject) => {
  const child = spawn(process.env.ACTIVITY_TEST_PSQL || "psql", ["-XqAt", "-h", host,
    "-p", process.env.ACTIVITY_TEST_PGPORT || "55433", "-U", process.env.USER,
    "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
  let output = "", error = "";
  child.stdout.on("data", data => output += data);
  child.stderr.on("data", data => error += data);
  child.on("error", reject);
  child.on("close", code => code ? reject(new Error(error)) : resolve(output.trim()));
  child.stdin.end(`SET search_path TO ${schema};\n${query}`);
});
const sql = async (parts, ...values) => {
  const query = parts.reduce((text, part, i) => text + part + (i < values.length ? quote(values[i]) : ""), "").trim();
  if (query.startsWith("SELECT") || query.startsWith("WITH eligible AS")) return JSON.parse(await run(`SELECT COALESCE(json_agg(t), '[]'::json) FROM (${query}) t`));
  if (query.includes("RETURNING")) return JSON.parse(await run(`WITH t AS (${query}) SELECT COALESCE(json_agg(t), '[]'::json) FROM t`));
  await run(query);
  return [];
};
const activityKey = (origin, id, kind) => `prospect-activity-v1|${kind}|${createHash("sha256").update(JSON.stringify([origin, id])).digest("hex")}`;
const loader = await createServer({ configFile: false, resolve: { alias: { "@": root } }, server: { middlewareMode: true, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
const { portfolioActivityDetailsEnvelope, savedPortfolioActivity } = await loader.ssrLoadModule(`${root}utils/portfolioActivity.js`);
const { ACTIVITY_QUEUE_LIMIT, activityNextCheckAt, selectActivityRows } = await loader.ssrLoadModule(`${root}app/api/utils/portfolioActivitySchedule.js`);
await loader.close();
const source = readFileSync(`${root}app/api/utils/portfolioActivityStore.js`, "utf8").replace(/^import .*;\n/gm, "").replaceAll("export async function", "async function");
const store = new Function("sql", "randomUUID", "prospectActivityCacheKey", "ACTIVITY_DAILY_CALLS", "activityOrigin", "activityWorkspaceIds", "portfolioActivityDetailsEnvelope", "ACTIVITY_QUEUE_LIMIT", "activityNextCheckAt", "selectActivityRows", `${source}\nreturn {claimActivityGate,reserveActivityCall,releaseActivityGate,seedActivityQueue,dueActivityRows,saveActivityResult,deferActivityRow,readActivitySeed,requestPortfolioActionRefresh};`)(
  sql, randomUUID, activityKey, 360, () => "https://example.com", () => ["7"], portfolioActivityDetailsEnvelope, ACTIVITY_QUEUE_LIMIT, activityNextCheckAt, selectActivityRows,
);
const ddl = readFileSync(`${root}app/api/utils/ensureAppSchema.js`, "utf8").match(/DO \$activity_schema\$[\s\S]*?\$activity_schema\$/)[0];
const origin = "https://example.com";
try {
  await run(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
    CREATE TABLE users (id bigint PRIMARY KEY, active boolean, blackbaud_portfolio_cache jsonb);
    CREATE TABLE blackbaud_constituent_summary_cache(workspace_user_id bigint, auth_user_id bigint, constituent_id text, cache_key text, payload jsonb, updated_at timestamptz);
    CREATE TABLE portfolio_constituent_snapshots(workspace_user_id bigint, constituent_id text, summary_payload jsonb, last_refreshed_at timestamptz);
    INSERT INTO users VALUES (7,TRUE,'{"leadSolicitor":[{"constituentId":"100"},{"constituentId":"100"},{"constituentId":"101"}]}'),
      (8,TRUE,'{"leadSolicitor":[{"constituentId":"800"}]}'), (9,FALSE,'{"leadSolicitor":[{"constituentId":"900"}]}'), (99,TRUE,NULL);`);
  await run(ddl.replace("ALTER TABLE portfolio_activity_snapshots ADD COLUMN IF NOT EXISTS activity_details JSONB;", "")
    .replace("ALTER TABLE portfolio_activity_snapshots ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;", ""));
  await run("INSERT INTO portfolio_activity_snapshots(workspace_user_id,origin,constituent_id,kind,record_id,activity_date,checked_at) VALUES (7,'https://example.com','100','gift','legacy','2020-01-01',NOW())");
  await Promise.all(Array.from({ length: 12 }, () => run(ddl)));
  const migrated = JSON.parse(await run("SELECT row_to_json(t) FROM portfolio_activity_snapshots t"));
  assert.equal(migrated.record_id, "legacy");
  assert.equal(migrated.activity_date, "2020-01-01");
  assert.equal(migrated.activity_details, null);
  assert.equal(migrated.last_attempt_at, null);
  await run("UPDATE portfolio_activity_snapshots SET checked_at=NULL");
  console.log("PASS: 12 concurrent additive schema migrations preserve a legacy date-only row.");
  await store.seedActivityQueue(["7", "9"], origin);
  let rows = await store.dueActivityRows(["7", "9"], origin);
  assert.equal(rows.length, 4);
  assert(rows.every(row => row.workspace_user_id === 7));
  await store.seedActivityQueue(["7"], origin);
  assert.equal((await store.dueActivityRows(["7"], origin)).length, 4);
  const gates = await Promise.all(Array.from({ length: 12 }, () => store.claimActivityGate(origin)));
  const gate = gates.find(Boolean);
  assert.equal(gates.filter(Boolean).length, 1);
  await run("UPDATE portfolio_activity_refresh_gates SET call_count = 359");
  const calls = await Promise.all(Array.from({ length: 12 }, () => store.reserveActivityCall(gate)));
  assert.equal(calls.filter(Boolean).length, 1);
  await run("UPDATE portfolio_activity_refresh_gates SET call_day = CURRENT_DATE - 2");
  assert.equal(await store.reserveActivityCall(gate), true);
  await store.releaseActivityGate({ ...gate, token: "wrong" });
  assert.equal(await store.claimActivityGate(origin), null);
  console.log("PASS: one durable worker, atomic daily cap, day rollover, token-fenced release.");
  const row = rows.find(row => row.kind === "gift" && row.constituent_id === "100");
  const old = new Date(Date.now() - 3600000).toISOString();
  const recent = new Date(Date.now() - 1000).toISOString();
  const entry = { id: "g", date: "2020-01-01", checkedAt: recent, amount: 1250.75 };
  assert.equal(await store.saveActivityResult(row, entry, 99, gate), true);
  assert.equal(await store.saveActivityResult(row, { ...entry, checkedAt: old }, 99, gate), false);
  assert.equal(await store.saveActivityResult(row, entry, 99, { ...gate, token: "lost" }), false);
  await store.deferActivityRow(row, { error: "throttled", delayMs: 60000 }, gate);
  const preserved = JSON.parse(await run("SELECT row_to_json(t) FROM portfolio_activity_snapshots t WHERE constituent_id='100' AND kind='gift'"));
  assert.equal(preserved.activity_date, "2020-01-01");
  assert.equal(Date.parse(preserved.checked_at), Date.parse(recent));
  assert.deepEqual(preserved.activity_details, portfolioActivityDetailsEnvelope(entry, "gift"));
  assert(Number.isFinite(Date.parse(preserved.last_attempt_at)));
  const actionRow = rows.find(row => row.kind === "action" && row.constituent_id === "100");
  await store.requestPortfolioActionRefresh({ origin, constituentId: "100" });
  await store.saveActivityResult(actionRow, { id: "a", date: "2020-01-01", checkedAt: old, summary: "Saved call" }, 99, gate);
  assert((await store.dueActivityRows(["7"], origin)).some(row => row.constituent_id === "100" && row.kind === "action"));
  console.log("PASS: out-of-order and lost-lease saves rejected, last-good dates survive failures, concurrent write hints stay due.");
  await run(`INSERT INTO blackbaud_constituent_summary_cache VALUES
    (7,99,'100',${quote(activityKey(origin,"100","gift"))},'{"version":1,"data":{"id":"g","date":"2020-01-01"}}',NOW()),
    (7,8,'100',${quote(activityKey(origin,"100","gift"))},'{"private":"wrong connection"}',NOW());`);
  assert.equal((await store.readActivitySeed(row, 99)).version, 1);
  const route = readFileSync(`${root}app/api/blackbaud/portfolio/route.js`, "utf8");
  const query = route.match(/WITH saved_contacts AS \([\s\S]*?\n  `/)[0].slice(0, -1)
    .replaceAll('${workspaceUserId}', "7").replaceAll('${authUserId}', "55")
    .replaceAll('${constituentIds}', "ARRAY['100']").replaceAll('${origin}', quote(origin))
    .replaceAll('${rawActivityKeys}', `ARRAY[${quote(activityKey(origin,"100","gift"))},${quote(activityKey(origin,"100","action"))}]`)
    .replaceAll('${constituentIds.map(id => portfolioContactCacheKey(origin || "", id))}', "ARRAY['unused-contact-key']");
  const projected = JSON.parse(await run(`SELECT json_agg(t) FROM (${query}) t`));
  assert.equal(projected.length, 2);
  assert(projected.every(row => row.activity_cache_key.startsWith("portfolio-activity-v1|https://example.com|")));
  assert.equal(projected.find(row => row.activity_cache_key.includes("|gift|")).activity.date, "2020-01-01");
  const gift = projected.find(row => row.activity_cache_key.includes("|gift|")).activity;
  const action = projected.find(row => row.activity_cache_key.includes("|action|")).activity;
  assert.equal(savedPortfolioActivity(gift, "gift", { requireBoundDetails: true }).amount, 1250.75);
  assert.equal(savedPortfolioActivity(action, "action", { requireBoundDetails: true }).summary, "Saved call");
  assert(!JSON.stringify(projected).includes("wrong connection"));
  // Simulate an older worker updating only the date/ID after a code rollback.
  await run("UPDATE portfolio_activity_snapshots SET record_id='new-gift',activity_date='2021-01-01',checked_at=NOW() WHERE kind='gift' AND constituent_id='100'");
  const rollback = JSON.parse(await run(`SELECT json_agg(t) FROM (${query}) t`)).find(row => row.activity_cache_key.includes("|gift|")).activity;
  assert.equal(savedPortfolioActivity(rollback, "gift", { requireBoundDetails: true }).amount, undefined);
  await store.saveActivityResult(row, { id: null, date: null, checkedAt: new Date().toISOString() }, 99, gate);
  assert.equal(await run("SELECT activity_details FROM portfolio_activity_snapshots WHERE kind='gift' AND constituent_id='100'"), "null");
  console.log("PASS: real SQL preserves bound details on failure and hides mismatches after rollback; empty results clear details.");
  await run("UPDATE users SET blackbaud_portfolio_cache='{}' WHERE id=7");
  assert.equal((await store.dueActivityRows(["7"], origin)).length, 0);
  console.log("PASS: exact-connection seed, authorized shared-date projection using real portfolio SQL, removed assignments excluded.");

  const queueOrigin = "https://queue.example.com";
  for (const workspace of [7, 8, 10]) {
    await run(`INSERT INTO users(id,active,blackbaud_portfolio_cache)
      SELECT ${workspace}, TRUE, jsonb_build_object('leadSolicitor',jsonb_agg(jsonb_build_object('constituentId',(${workspace}*1000+i)::text)))
      FROM generate_series(1,30) i ON CONFLICT(id) DO UPDATE SET blackbaud_portfolio_cache=EXCLUDED.blackbaud_portfolio_cache`);
  }
  await store.seedActivityQueue(["7", "8", "9", "10"], queueOrigin);
  await run(`UPDATE portfolio_activity_snapshots SET next_check_at=NOW()-INTERVAL '2 days',
    checked_at=CASE WHEN constituent_id::bigint%3=1 THEN NOW()-INTERVAL '3 days' ELSE NULL END,
    scan='null'::jsonb, last_error=CASE WHEN constituent_id::bigint%3=2 THEN 'unverified_response' ELSE NULL END
    WHERE origin=${quote(queueOrigin)}`);
  let fairRows = await store.dueActivityRows(["7", "8", "9", "10"], queueOrigin);
  assert.equal(fairRows.length, 20);
  assert.deepEqual(fairRows.slice(0,8).map(row=>row.queue_lane), ["priority","priority","routine","priority","retry","routine","priority","routine"]);
  assert.deepEqual(fairRows.filter(row=>row.queue_lane==='priority').slice(0,3).map(row=>row.workspace_user_id), [7,8,10]);
  assert.deepEqual(fairRows.filter(row=>row.queue_lane==='routine').slice(0,3).map(row=>row.workspace_user_id), [7,8,10]);
  assert(!fairRows.some(row=>row.workspace_user_id===9));
  assert((await store.dueActivityRows(["8"], queueOrigin)).every(row=>row.workspace_user_id===8));
  const fairGate = await store.claimActivityGate(queueOrigin);
  await store.deferActivityRow(fairRows[0], {error:'unverified_response',delayMs:3600000}, fairGate);
  fairRows = await store.dueActivityRows(["7","8","10"], queueOrigin);
  assert.equal(fairRows[0].workspace_user_id, 8);
  const checkedNow = new Date().toISOString();
  await store.saveActivityResult(fairRows[0], {id:null,date:null,checkedAt:checkedNow}, 99, fairGate);
  const savedNext = await run(`SELECT next_check_at FROM portfolio_activity_snapshots WHERE origin=${quote(queueOrigin)}
    AND workspace_user_id=8 AND constituent_id=${quote(fairRows[0].constituent_id)} AND kind=${quote(fairRows[0].kind)}`);
  const elapsed = Date.parse(savedNext)-Date.parse(checkedNow);
  assert(elapsed>=24*3600000 && elapsed<=30*3600000);
  assert.equal((await store.dueActivityRows(["7","8","10"], queueOrigin))[0].workspace_user_id, 10);
  // Resume incomplete scans before first-fill rows within the same workspace.
  await run(`UPDATE portfolio_activity_snapshots SET scan='{"startedAt":"2026-09-18T00:00:00Z"}',checked_at=NOW()-INTERVAL '3 days'
    WHERE origin=${quote(queueOrigin)} AND constituent_id='10029' AND kind='action';
    UPDATE portfolio_activity_snapshots SET requested_at=NOW(),checked_at=NOW()-INTERVAL '3 days'
    WHERE origin=${quote(queueOrigin)} AND constituent_id='10030' AND kind='action'`);
  const resumed = await store.dueActivityRows(["10"], queueOrigin);
  assert.equal(resumed[0].constituent_id, "10029");
  assert.equal(resumed[0].queue_lane, "priority");
  assert.equal(resumed.find(row=>row.constituent_id==='10030'&&row.kind==='action')?.queue_lane, "priority");
  console.log("PASS: first-fill, routine and retry slots; cross-workspace fairness; failed attempts rotate; hints and scans prioritized; real staggered timestamps.");

  const manyOrigin = "https://many.example.com";
  const manyWorkspaces = Array.from({length:25},(_,i)=>String(100+i));
  await run(`INSERT INTO users(id,active,blackbaud_portfolio_cache)
    SELECT i,TRUE,jsonb_build_object('leadSolicitor',jsonb_build_array(jsonb_build_object('constituentId',(i*1000)::text)))
    FROM generate_series(100,124) i`);
  await store.seedActivityQueue(manyWorkspaces,manyOrigin);
  const firstRound = (await store.dueActivityRows(manyWorkspaces,manyOrigin)).slice(0,8);
  const firstWorkspaces = new Set(firstRound.map(row=>row.workspace_user_id));
  assert.equal(firstWorkspaces.size,8);
  const manyGate = await store.claimActivityGate(manyOrigin);
  for (const next of firstRound) await store.saveActivityResult(next,{id:null,date:null,checkedAt:new Date().toISOString()},99,manyGate);
  const secondRound = (await store.dueActivityRows(manyWorkspaces,manyOrigin)).slice(0,8);
  assert(secondRound.every(row=>!firstWorkspaces.has(row.workspace_user_id)));
  console.log("PASS: bounded candidate queries still rotate fairly when more than 20 portfolios are eligible.");
} finally {
  await run(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`);
}
