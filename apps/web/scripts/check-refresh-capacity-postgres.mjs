// Disposable database only; validates the actual read query without NXT access.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const host = process.env.NXT_CREATE_TEST_PGHOST;
if (!/^\/private\/tmp\/nxt-create-pg\.[A-Za-z0-9]+$/.test(host || "")) throw new Error("Use a disposable nxt-create-pg socket under /private/tmp.");
const schema = `capacity_test_${randomUUID().replaceAll("-", "")}`;
const run = query => new Promise((resolve, reject) => {
  const child = spawn("psql", ["-XqAt", "-h", host, "-p", process.env.NXT_CREATE_TEST_PGPORT || "55439", "-U", process.env.USER, "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
  let out = "", error = "";
  child.stdout.on("data", part => out += part); child.stderr.on("data", part => error += part);
  child.on("error", reject); child.on("close", code => code ? reject(new Error(error)) : resolve(out.trim()));
  child.stdin.end(`SET search_path TO ${schema};\n${query}`);
});
const source = readFileSync(new URL("../src/app/api/utils/portfolioRefreshCapacity.js", import.meta.url), "utf8");
const query = source.match(/const \[row\] = await sql`([\s\S]*?)`;/)?.[1];
assert.ok(query && !query.includes("${"), "Expected a parameter-free aggregate query");
const read = async () => JSON.parse(await run(`WITH result AS (${query}) SELECT row_to_json(result) FROM result`));
try {
  await run(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
    CREATE TABLE users(id bigint PRIMARY KEY, active boolean, role text, blackbaud_portfolio_cache jsonb, blackbaud_portfolio_cached_at timestamptz);
    CREATE TABLE portfolio_constituent_snapshots(workspace_user_id bigint, constituent_id text, data_complete boolean,
      summary_payload jsonb, last_error_stage text, stale_after timestamptz, PRIMARY KEY(workspace_user_id,constituent_id));
    CREATE TABLE portfolio_giving_snapshots(workspace_user_id bigint, constituent_id text, payload jsonb,
      refreshed_at timestamptz, stale_after timestamptz, PRIMARY KEY(workspace_user_id,constituent_id));
    INSERT INTO users VALUES
      (1,true,'mgo','{"leadSolicitor":[{"constituentId":"A"},{"constituentId":"A"}],"supportingSolicitor":[{"constituentId":"B"}]}',NOW()),
      (2,true,'mgo','{"leadSolicitor":[{"constituentId":"A"}],"supportingSolicitor":[]}',NOW()),
      (3,true,'mgo','{"leadSolicitor":[],"supportingSolicitor":[],"portfolioMeta":{"assignmentDataStatus":"live"}}',NOW()),
      (4,true,'mgo','{"leadSolicitor":[],"supportingSolicitor":[]}',NOW()),
      (5,true,'mgo','{"leadSolicitor":{},"supportingSolicitor":[]}',NOW()),
      (6,true,'mgo',NULL,NULL),
      (7,false,'mgo','{"leadSolicitor":[{"constituentId":"D"}],"supportingSolicitor":[]}',NOW()),
      (8,true,'admin','{"leadSolicitor":[{"constituentId":"C"}],"supportingSolicitor":[]}',NOW());
    INSERT INTO portfolio_constituent_snapshots VALUES
      (1,'A',false,'{}',NULL,NOW()-INTERVAL '1 hour'),
      (1,'B',true,'{}',NULL,NOW()+INTERVAL '1 day'),
      (2,'A',false,'{}',NULL,NOW()-INTERVAL '1 hour'),
      (8,'C',true,'{}',NULL,NOW()+INTERVAL '1 day');
    INSERT INTO portfolio_giving_snapshots VALUES
      (1,'A','{}',NOW()-INTERVAL '12 hours',NOW()+INTERVAL '8 hours'),
      (1,'B','{}',NOW()-INTERVAL '60 hours',NOW()-INTERVAL '40 hours'),
      (8,'C','{}',NOW()-INTERVAL '1 hour',NOW()+INTERVAL '19 hours'),
      (1,'UNASSIGNED','{}',NOW()-INTERVAL '100 hours',NOW()-INTERVAL '80 hours');`);
  const first = await read();
  assert.deepEqual({ ...first, oldest_giving_check: undefined }, {
    workspace_count: 7, unknown_workspaces: 3, assignments_due: 1, assignment_slots: 4, unique_constituents: 3,
    due_slots: 3, summary_due: 2, giving_due: 2, never_checked: 1, giving_over_48_hours: 1,
    giving_checked_24_hours: 2, oldest_giving_check: undefined,
  });
  assert.ok(Date.parse(first.oldest_giving_check) < Date.now() - 59 * 3600_000);
  await run(`INSERT INTO users SELECT n,true,'mgo','{"leadSolicitor":[{"constituentId":"A"}],"supportingSolicitor":[]}'::jsonb,NOW()
    FROM generate_series(10,119) n`);
  const many = await read();
  assert.equal(many.workspace_count, 117);
  assert.equal(many.assignment_slots, 114);
  assert.equal(many.never_checked, 111);
  assert.equal(many.unique_constituents, 3);
  await run("DELETE FROM users");
  const empty = await read();
  assert.equal(empty.assignment_slots, 0);
  assert.equal(empty.workspace_count, 0);
  assert.equal(empty.oldest_giving_check, null);
  console.log("PASS: shared IDs, within-workspace deduplication, overlapping backlog, empty/unavailable membership, inactive and removed assignments, freshness ages, >100 workspaces, and empty database.");
} finally { await run(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
