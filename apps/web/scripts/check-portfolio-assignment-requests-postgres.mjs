// Run against an explicitly disposable local database; no provider credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
const host = process.env.PORTFOLIO_REQUEST_TEST_PGHOST;
if (!/^\/private\/tmp\/portfolio-request-pg\.[A-Za-z0-9]+$/.test(host || "")) throw new Error("Use a disposable portfolio-request-pg socket under /private/tmp.");
const schema = `request_test_${randomUUID().replaceAll("-", "")}`;
const quote = value => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const run = query => new Promise((resolve, reject) => {
  const child = spawn("psql", ["-XqAt", "-h", host, "-p", "55443", "-U", process.env.USER, "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
  let out = "", error = "";
  child.stdout.on("data", part => out += part); child.stderr.on("data", part => error += part);
  child.on("error", reject); child.on("close", code => code ? reject(new Error(error)) : resolve(out.trim()));
  child.stdin.end(`SET search_path TO ${schema};\n${query}`);
});
const rows = query => query.startsWith("SELECT")
  ? `SELECT COALESCE(json_agg(t),'[]'::json) FROM (${query}) t;`
  : `WITH t AS (${query}) SELECT COALESCE(json_agg(t),'[]'::json) FROM t;`;
const sql = (parts, ...values) => {
  const query = parts.reduce((text, part, index) => text + part + (index < values.length ? quote(values[index]) : ""), "").trim();
  return { query, then: (resolve, reject) => run(rows(query)).then(text => resolve(JSON.parse(text)), reject) };
};
sql.transaction = async statements => (await run(`BEGIN ISOLATION LEVEL READ COMMITTED;\n${statements.map(s => rows(s.query)).join("\n")}\nCOMMIT;`)).split("\n").filter(Boolean).map(text => JSON.parse(text));
const source = readFileSync(new URL("../src/app/api/utils/portfolioAssignmentRequests.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replaceAll("export ", "");
const save = new Function("sql", `${source}; return savePortfolioAssignmentRequest;`)(sql);
const ddl = readFileSync(new URL("../src/app/api/utils/ensureAppSchema.js", import.meta.url), "utf8")
  .match(/CREATE TABLE IF NOT EXISTS data_change_requests \([\s\S]*?\n      \)/)[0];
const args = { user: { id: 7, name: "Demo MGO", email: "demo@example.test" }, constituentId: "123", constituentName: "Example Donor", reason: "Met at an event" };
try {
  await run(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}; CREATE TABLE users(id bigint PRIMARY KEY); INSERT INTO users VALUES(7),(8); CREATE TABLE prospect_pool(id bigint PRIMARY KEY); CREATE TABLE constituents(id bigint PRIMARY KEY); ${ddl};`);
  const requests = await Promise.all(Array.from({ length: 8 }, () => save(args)));
  assert.equal(requests.filter(result => result.created).length, 1);
  assert.equal(new Set(requests.map(result => result.request.id)).size, 1);
  const id = requests[0].request.id;
  await run(`UPDATE data_change_requests SET status='In Progress', reviewer_notes='Checking existing assignments' WHERE id=${id};`);
  const duplicate = await save({ ...args, reason: "Changed note must not overwrite" });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.request.reviewer_notes, "Checking existing assignments");
  assert.ok(!duplicate.request.request_note.includes("Changed note"));
  const checked = await save({ ...args, verifyOnly: true });
  assert.equal(checked.request.id, id);
  assert.equal(checked.created, false);
  assert.equal((await save({ ...args, user: { ...args.user, id: 8 }, verifyOnly: true })).request, null);
  await run(`UPDATE data_change_requests SET status='Declined' WHERE id=${id};`);
  assert.equal((await save(args)).created, true);
  console.log("PASS: real schema; 8 concurrent requests create one queue item; duplicate retries preserve reviewer notes; verification is requester-scoped; closed requests permit a new explicit request.");
} finally { await run(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
