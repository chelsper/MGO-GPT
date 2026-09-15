// Optional integration test. Requires a disposable local PostgreSQL Unix socket.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

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
  if (query.startsWith("SELECT")) return JSON.parse(await run(`SELECT COALESCE(json_agg(t), '[]'::json) FROM (${query}) t`));
  if (query.includes("RETURNING")) return JSON.parse(await run(`WITH t AS (${query}) SELECT COALESCE(json_agg(t), '[]'::json) FROM t`));
  await run(query);
  return [];
};
const activityKey = (origin, id, kind) => `prospect-activity-v1|${kind}|${createHash("sha256").update(JSON.stringify([origin, id])).digest("hex")}`;
const source = readFileSync(`${root}app/api/utils/portfolioActivityStore.js`, "utf8").replace(/^import .*;\n/gm, "").replaceAll("export async function", "async function");
const store = new Function("sql", "randomUUID", "prospectActivityCacheKey", "ACTIVITY_DAILY_CALLS", "activityOrigin", "activityWorkspaceIds", `${source}\nreturn {claimActivityGate,reserveActivityCall,releaseActivityGate,seedActivityQueue,dueActivityRows,saveActivityResult,deferActivityRow,readActivitySeed,requestPortfolioActionRefresh};`)(
  sql, randomUUID, activityKey, 360, () => "https://example.com", () => ["7"],
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
  await Promise.all(Array.from({ length: 12 }, () => run(ddl)));
  console.log("PASS: 12 concurrent first-time schema initializations.");
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
  const entry = { id: "g", date: "2020-01-01", checkedAt: recent };
  assert.equal(await store.saveActivityResult(row, entry, 99, gate), true);
  assert.equal(await store.saveActivityResult(row, { ...entry, checkedAt: old }, 99, gate), false);
  assert.equal(await store.saveActivityResult(row, entry, 99, { ...gate, token: "lost" }), false);
  await store.deferActivityRow(row, { error: "throttled", delayMs: 60000 }, gate);
  const preserved = JSON.parse(await run("SELECT row_to_json(t) FROM portfolio_activity_snapshots t WHERE constituent_id='100' AND kind='gift'"));
  assert.equal(preserved.activity_date, "2020-01-01");
  assert.equal(Date.parse(preserved.checked_at), Date.parse(recent));
  const actionRow = rows.find(row => row.kind === "action" && row.constituent_id === "100");
  await store.requestPortfolioActionRefresh({ origin, constituentId: "100" });
  await store.saveActivityResult(actionRow, { id: "a", date: "2020-01-01", checkedAt: old }, 99, gate);
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
  assert(!JSON.stringify(projected).includes("wrong connection"));
  await run("UPDATE users SET blackbaud_portfolio_cache='{}' WHERE id=7");
  assert.equal((await store.dueActivityRows(["7"], origin)).length, 0);
  console.log("PASS: exact-connection seed, authorized shared-date projection using real portfolio SQL, removed assignments excluded.");
} finally {
  await run(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`);
}
