// Disposable database only: execute the actual health query with fictional data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const host = process.env.NXT_CREATE_TEST_PGHOST;
if (!/^\/private\/tmp\/nxt-create-pg\.[A-Za-z0-9]+$/.test(host || "")) throw new Error("Use a disposable nxt-create-pg socket under /private/tmp.");
const schema = `health_recovery_${randomUUID().replaceAll("-", "")}`;
const run = query => new Promise((resolve, reject) => {
  const child = spawn("psql", ["-XqAt", "-h", host, "-p", process.env.NXT_CREATE_TEST_PGPORT || "55439", "-U", process.env.USER, "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
  let out = "", error = "";
  child.stdout.on("data", part => out += part);
  child.stderr.on("data", part => error += part);
  child.on("error", reject);
  child.on("close", code => code ? reject(new Error(error)) : resolve(out.trim()));
  child.stdin.end(`SET search_path TO ${schema};\n${query}`);
});
const source = readFileSync(new URL("../src/app/api/utils/integrationHealth.js", import.meta.url), "utf8");
const query = source.match(/async function portfolios\(context\) \{[\s\S]*?const rows = await sql`([\s\S]*?)`;/)?.[1];
assert.ok(query && !query.includes("${"), "Expected the actual parameter-free portfolio query");
const read = async () => JSON.parse(await run(`BEGIN TRANSACTION READ ONLY;
  WITH result AS (${query}) SELECT COALESCE(json_agg(result), '[]'::json) FROM result; ROLLBACK;`));
const quote = value => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const reference = Date.now();
const hoursAgo = hours => new Date(reference - hours * 60 * 60_000).toISOString();
const before = hoursAgo(3), failedAt = hoursAgo(2), after = hoursAgo(1);
const cases = [
  { name: "optional enrichment recovered", recovered: 1 },
  { name: "summary generation recovered", stage: "summary_generation", recovered: 1 },
  { name: "summary only mode", mode: "stale", stage: "constituent_identity", recovered: 1 },
  { name: "full summary mode", mode: "full", stage: "unknown", recovered: 1 },
  { name: "both phases recovered", stage: "blackbaud_retrieval", givingAt: after, recovered: 1 },
  { name: "still due after recovery", stale: true, recovered: 1 },
  { name: "old summary", summaryAt: before },
  { name: "same timestamp is not later", summaryAt: failedAt },
  { name: "missing summary", noSummary: true },
  { name: "incomplete summary", complete: false },
  { name: "new summary has error", error: "optional_enrichment" },
  { name: "null summary payload", payload: null },
  { name: "JSON null summary payload", payload: "null" },
  { name: "missing failure timestamp", failedAt: null },
  { name: "missing success timestamp", summaryAt: null },
  { name: "other constituent cannot recover", summaryId: "B" },
  { name: "nightly retrieval may be giving failure", stage: "blackbaud_retrieval" },
  { name: "nightly identity may be giving failure", stage: "constituent_identity" },
  { name: "nightly normalization may be giving failure", stage: "normalization" },
  { name: "nightly proposal may be giving failure", stage: "proposal_summary" },
  { name: "unknown phase requires both checks", stage: "unknown" },
  { name: "unknown mode cannot prove recovery", mode: null, stage: "unknown", givingAt: after },
  { name: "giving alone cannot recover summary", stage: "blackbaud_auth", summaryAt: before, givingAt: after },
  { name: "no giving snapshot", stage: "summary_processing", noGiving: true },
  { name: "incomplete giving snapshot", stage: "summary_processing", givingAt: after, givingPayload: "{}" },
  { name: "JSON null giving values", stage: "summary_processing", givingAt: after, givingPayload: '{"mapped":{"lifetimeGiving":null},"currentFyGiving":null}' },
  { name: "same giving timestamp is not recovery", stage: "blackbaud_auth", givingAt: failedAt },
];
try {
  await run(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
    CREATE TABLE users(id bigint PRIMARY KEY, name text, active boolean, role text,
      blackbaud_constituent_id text, blackbaud_portfolio_cache jsonb, blackbaud_portfolio_cached_at timestamptz);
    CREATE TABLE portfolio_constituent_snapshots(workspace_user_id bigint, constituent_id text, data_complete boolean,
      summary_payload jsonb, last_error_stage text, stale_after timestamptz, last_refreshed_at timestamptz,
      PRIMARY KEY(workspace_user_id,constituent_id));
    CREATE TABLE portfolio_giving_snapshots(workspace_user_id bigint, constituent_id text, payload jsonb,
      refreshed_at timestamptz, stale_after timestamptz, PRIMARY KEY(workspace_user_id,constituent_id));
    CREATE TABLE portfolio_refresh_jobs(id bigint PRIMARY KEY, workspace_user_id bigint, mode text, status text,
      processed_count int, total_count int, success_count int, failed_count int,
      paused_until timestamptz, updated_at timestamptz, created_at timestamptz);
    CREATE TABLE portfolio_refresh_items(id bigint PRIMARY KEY, job_id bigint, constituent_id text,
      status text, stage text, completed_at timestamptz);`);
  for (const [index, test] of cases.entries()) {
    const id = index + 1;
    const row = { mode: "nightly", stage: "optional_enrichment", summaryAt: after, failedAt,
      givingAt: before, complete: true, payload: "{}", summaryId: "A",
      givingPayload: '{"mapped":{"lifetimeGiving":{}},"currentFyGiving":{}}', ...test };
    // The same constituent ID in every workspace tests that successful checks
    // cannot leak across MGO workspaces. Duplicate assignments must not multiply counts.
    await run(`INSERT INTO users VALUES (${id},${quote(test.name)},true,'executive,mgo','MGO',
      '{"leadSolicitor":[{"constituentId":"A"},{"constituentId":"A"}],"supportingSolicitor":[{"constituentId":"A"}]}',NOW());
      INSERT INTO portfolio_refresh_jobs VALUES (${id},${id},${quote(row.mode)},'completed_with_failures',1,1,0,1,NULL,NOW(),NOW());
      INSERT INTO portfolio_refresh_items VALUES (${id},${id},'A','failed',${quote(row.stage)},${quote(row.failedAt)});
      ${row.noSummary ? "" : `INSERT INTO portfolio_constituent_snapshots VALUES (${id},${quote(row.summaryId)},${row.complete},
        ${quote(row.payload)},${quote(row.error)},NOW() ${row.stale ? "-" : "+"} INTERVAL '1 hour',${quote(row.summaryAt)});`}
      ${row.noGiving ? "" : `INSERT INTO portfolio_giving_snapshots VALUES (${id},'A',${quote(row.givingPayload)},
        ${quote(row.givingAt)},NOW() ${row.stale ? "-" : "+"} INTERVAL '1 day');`}`);
  }
  const historyQuery = "SELECT json_agg(i ORDER BY id) FROM portfolio_refresh_items i";
  const history = await run(historyQuery);
  const rows = await read();
  assert.equal(rows.length, cases.length);
  for (const test of cases) {
    const row = rows.find(item => item.name === test.name);
    assert.equal(row.total, 1, test.name);
    assert.equal(row.failed_count, 1, test.name);
    assert.equal(row.failed_item_count, 1, test.name);
    assert.equal(row.recovered_failed_count, test.recovered || 0, test.name);
    assert.equal(row.delayed_count, 0, `${test.name}: routine due/missing checks are not proof of a material age delay`);
    assert.equal(row.job_mode, test.mode === undefined ? "nightly" : test.mode, test.name);
  }
  assert.equal(rows.find(row => row.name === "still due after recovery").summary_current, 0);
  assert.equal(rows.find(row => row.name === "still due after recovery").giving_current, 0);
  assert.equal(await run(historyQuery), history, "Health reads must not rewrite failed-item history");

  const delayCases = [
    { name: "giving older than 48 hours", givingAt: hoursAgo(49), delayed: 1 },
    { name: "giving not yet 48 hours old", givingAt: hoursAgo(47), delayed: 0 },
    { name: "summary overdue more than 24 hours", summaryDue: hoursAgo(25), delayed: 1 },
    { name: "summary not yet 24 hours overdue", summaryDue: hoursAgo(23), delayed: 0 },
    { name: "both checks old count once", givingAt: hoursAgo(49), summaryDue: hoursAgo(25), delayed: 1 },
    { name: "missing giving timestamp", givingAt: null, delayed: 0 },
    { name: "missing summary due date", summaryDue: null, delayed: 0 },
    { name: "old unassigned record excluded", givingAt: hoursAgo(49), summaryDue: hoursAgo(25), constituentId: "B", delayed: 0 },
  ];
  for (const [index, test] of delayCases.entries()) {
    const id = index + 100;
    const record = { constituentId: "A", givingAt: after, summaryDue: hoursAgo(-1), ...test };
    await run(`INSERT INTO users VALUES (${id},${quote(test.name)},true,'mgo','MGO',
      '{"leadSolicitor":[{"constituentId":"A"},{"constituentId":"A"}],"supportingSolicitor":[{"constituentId":"A"}]}',NOW());
      INSERT INTO portfolio_constituent_snapshots VALUES (${id},${quote(record.constituentId)},true,'{}',NULL,${quote(record.summaryDue)},NOW());
      INSERT INTO portfolio_giving_snapshots VALUES (${id},${quote(record.constituentId)},'{}',${quote(record.givingAt)},NOW());`);
  }
  const delays = await read();
  for (const test of delayCases) {
    const row = delays.find(item => item.name === test.name);
    assert.equal(row.total, 1, test.name);
    assert.equal(row.delayed_count, test.delayed, test.name);
  }
  assert.equal(await run(historyQuery), history, "Delay projection must not change failed-item history");

  await run(`INSERT INTO portfolio_refresh_jobs VALUES (1000,1,'nightly','completed',1,1,1,0,NULL,NOW(),NOW());
    INSERT INTO portfolio_refresh_items VALUES (1000,1000,'A','success','complete',NOW());
    INSERT INTO users VALUES (1000,'No job',true,'mgo','MGO','{"leadSolicitor":[],"supportingSolicitor":[]}',NOW());`);
  const latest = await read();
  assert.equal(latest.find(row => row.id === 1).failed_item_count, 0, "Old jobs must not enter latest-job history");
  assert.equal(latest.find(row => row.id === 1000).failed_item_count, 0);
  assert.equal(latest.find(row => row.id === 1000).recovered_failed_count, 0);
  assert.equal(latest.find(row => row.id === 1000).job_status, null);
  console.log(`PASS: ${cases.length} recovery and ${delayCases.length} delay scenarios, workspace/constituent isolation, latest-job selection, empty job, deduplication, stale backlog, and unchanged history in read-only transactions.`);
} finally {
  await run(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}
