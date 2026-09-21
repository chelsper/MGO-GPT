// Optional real-database check; accepts only an explicitly disposable local socket.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
const host = process.env.NXT_CREATE_TEST_PGHOST;
if (!/^\/private\/tmp\/nxt-create-pg\.[A-Za-z0-9]+$/.test(host || "")) throw new Error("Use a disposable nxt-create-pg socket under /private/tmp.");
const schema = `nxt_create_test_${randomUUID().replaceAll("-", "")}`;
const quote = value => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const run = query => new Promise((resolve, reject) => {
  const child = spawn("psql", ["-XqAt", "-h", host, "-p", process.env.NXT_CREATE_TEST_PGPORT || "55439", "-U", process.env.USER, "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
  let out = "", error = "";
  child.stdout.on("data", part => out += part); child.stderr.on("data", part => error += part);
  child.on("error", reject); child.on("close", code => code ? reject(new Error(error)) : resolve(out.trim()));
  child.stdin.end(`SET search_path TO ${schema};\n${query}`);
});
const sql = async (parts, ...values) => {
  const query = parts.reduce((text, part, index) => text + part + (index < values.length ? quote(values[index]) : ""), "").trim();
  if (!query.startsWith("SELECT") && !query.includes("RETURNING")) { await run(query); return []; }
  return JSON.parse(await run(query.startsWith("SELECT") ? `SELECT COALESCE(json_agg(t),'[]'::json) FROM (${query}) t`
    : `WITH t AS (${query}) SELECT COALESCE(json_agg(t),'[]'::json) FROM t`));
};
const ddl = readFileSync(new URL("../src/app/api/utils/ensureAppSchema.js", import.meta.url), "utf8").match(/DO \$nxt_create_receipts_schema\$[\s\S]*?END \$nxt_create_receipts_schema\$/)[0];
const source = readFileSync(new URL("../src/app/api/utils/nxtCreateReceipt.js", import.meta.url), "utf8").replace(/^import .*;\n/gm, "").replaceAll("export ", "");
const { guardedNxtCreate, completeNxtCreateReceipt } = new Function("sql", "ensureAppSchema", "createHash", `${source}; return {guardedNxtCreate,completeNxtCreateReceipt};`)(sql, async () => {}, createHash);
let sends = 0, lastReceipt;
const options = { ownerUserId: 7, enteredByUserId: 2, kind: "action", source: "test",
  requestData: { summary: "Call" }, payload: { constituent_id: "123", summary: "Call" },
  onReceipt: receipt => { lastReceipt = receipt; }, create: async () => { sends++; return { id: "456" }; } };
try {
  await run(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}; CREATE TABLE users(id bigint PRIMARY KEY); INSERT INTO users VALUES(2),(7),(8);`);
  await Promise.all(Array.from({ length: 8 }, () => run(ddl)));
  const concurrent = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => guardedNxtCreate({ ...options,
    requestData: { summary: `Call ${i}` }, payload: { constituent_id: "123", summary: `Call ${i}` } })));
  assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(sends, 1);
  const winner = lastReceipt;
  await completeNxtCreateReceipt(winner);
  await assert.rejects(guardedNxtCreate({ ...options, payload: winner.payload }), error => Boolean(error.writeReceipt));
  assert.equal(sends, 1);
  await guardedNxtCreate({ ...options, ownerUserId: 8 });
  assert.equal(sends, 2);
  const failed = { ...options, payload: { constituent_id: "999", summary: "Uncertain" }, requestData: { summary: "Uncertain" },
    create: async () => { sends++; throw new Error("Lost response"); } };
  await assert.rejects(guardedNxtCreate(failed));
  await assert.rejects(guardedNxtCreate({ ...failed, requestData: { summary: "Edited" }, payload: { ...failed.payload, summary: "Edited" } }));
  assert.equal(sends, 3);
  const [pending] = await sql`SELECT *, updated_at::text AS exact_version FROM nxt_create_receipts WHERE constituent_id = '999'`;
  const saved = await sql`UPDATE nxt_create_receipts SET state = 'verified', remote_id = '789', verified_at = NOW()
    WHERE id = ${pending.id} AND updated_at = ${pending.exact_version} AND state = 'review' RETURNING id`;
  assert.equal(saved.length, 1);
  await assert.rejects(guardedNxtCreate(failed));
  assert.equal(sends, 3);
  console.log("PASS: concurrent additive migration, 8 competing creates produce 1 send, immutable duplicate keys, owner isolation, edited retry hold, microsecond-accurate verification, and no replay after verification.");
} finally { await run(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
