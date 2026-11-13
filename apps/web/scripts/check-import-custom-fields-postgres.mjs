// Disposable local PostgreSQL only. Never reads DATABASE_URL or calls NXT.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import importCustomFieldSchema from "../src/app/api/utils/importCustomFieldSchema.js";
const host = process.env.IMPORT_FIELDS_TEST_PGHOST;
if (!/^\/private\/tmp\/import-fields-pg\.[A-Za-z0-9]+$/.test(host || "")) throw new Error("An isolated import-fields-pg socket is required.");
const schema = `import_fields_${process.pid}`;
const query = (text) => new Promise((resolve, reject) => {
  const child = execFile("/opt/homebrew/opt/postgresql@18/bin/psql", ["-XqAt", "--no-password", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", "55449", "-d", "postgres"], { timeout: 20000 }, (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(stdout.trim()));
  child.stdin.end(`SET search_path TO ${schema};\n${text}`);
});
let ddl;
await importCustomFieldSchema(async (parts) => { ddl = parts.join(""); });
try {
  await query(`CREATE SCHEMA ${schema}`);
  // Independent sessions simulate concurrent serverless startup and imports.
  const sessions = await Promise.all(Array.from({ length: 8 }, () => query(`${ddl}; SELECT pg_backend_pid();`)));
  assert.equal(new Set(sessions).size, 8);
  const insert = (row) => `INSERT INTO constituency_import_custom_field_claims (constituent_id, category_key, row_id) VALUES ('123','interest',${row}) ON CONFLICT DO NOTHING RETURNING row_id`;
  const winners = (await Promise.all(Array.from({ length: 8 }, (_, index) => query(insert(index + 1))))).filter(Boolean);
  assert.equal(winners.length, 1);
  const winner = Number(winners[0]);
  await query(`UPDATE constituency_import_custom_field_claims SET started_at = NOW() - INTERVAL '30 days'`);
  assert.equal(await query(insert(99)), "");
  await query(`DELETE FROM constituency_import_custom_field_claims WHERE row_id = 99 AND constituent_id = '123' AND category_key = 'interest'`);
  assert.equal(await query("SELECT count(*) FROM constituency_import_custom_field_claims"), "1");
  await query(`DELETE FROM constituency_import_custom_field_claims WHERE row_id = ${winner} AND constituent_id = '123' AND category_key = 'interest'`);
  assert.equal(await query(insert(99)), "99");
  await query("INSERT INTO constituency_import_custom_field_claims (constituent_id,category_key,row_id) VALUES ('123','other',100),('124','interest',101)");
  await query(ddl);
  assert.equal(await query("SELECT count(*) FROM constituency_import_custom_field_claims"), "3");
  console.log("PASS: concurrent schema install; one of eight simultaneous category claims wins; unknown claims do not expire; only the owning row releases; unrelated categories/constituents stay independent; schema reruns preserve claims.");
} finally { await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
