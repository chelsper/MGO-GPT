// Real-database check restricted to an explicitly disposable local Unix socket.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import migrate from "../src/app/api/utils/pledgeReminderLogSchema.js";

const host = process.env.PLEDGE_REMINDER_TEST_PGHOST;
if (!/^\/private\/tmp\/pledge-reminder-pg\.[A-Za-z0-9]+$/.test(host || "")) throw new Error("Use a disposable pledge-reminder-pg socket under /private/tmp.");
const schema = `pledge_reminder_test_${randomUUID().replaceAll("-", "")}`;
const quote = value => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const run = query => new Promise((resolve, reject) => {
  const child = spawn("psql", ["-XqAt", "-h", host, "-p", "55441", "-U", process.env.USER, "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
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
const source = readFileSync(new URL("../src/app/api/utils/pledgeReminderLogStore.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replaceAll("export ", "");
const store = new Function("sql", "createHash", "randomUUID", `${source}; return createReminderLogStore(sql);`)(sql, createHash, randomUUID);
const origin = "https://fictional.example.test";
const fixture = { ownerId: 2, origin, email: "donor@example.test", letterDate: "2026-11-20", today: "2026-11-20", view: "pastDue", filename: "reminder.pdf",
  draft: { fields: { Addressee: "Fictional Donor", AddressLine1: "123 Test Lane" }, pledge: { id: "123", constituentId: "456", lookupId: "TEST-P1",
    fundDescriptions: ["Test Fund"], amountDueCents: 10000, totalCents: 30000, paidToDateCents: 10000, balanceCents: 20000,
    dueDate: "2026-11-01", refreshedAt: "2026-11-20T12:00:00Z" } } };
try {
  await run(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}; CREATE TABLE users(id bigint PRIMARY KEY); INSERT INTO users VALUES(2),(7);`);
  await Promise.all(Array.from({ length: 8 }, () => migrate(sql)));
  const prepared = await Promise.all(Array.from({ length: 8 }, () => store.prepare(fixture)));
  assert.equal(new Set(prepared.map(row => row.snapshotId)).size, 1);
  const first = await store.read(prepared[0].snapshotId, 2, origin);
  assert.equal(await store.read(first.id, 7, origin), null);
  assert.equal(await store.read(first.id, 2, "https://different.example.test"), null);
  const changed = await store.prepare({ ...fixture, draft: { ...fixture.draft, fields: { ...fixture.draft.fields, AddressLine1: "456 Changed Lane" } } });
  assert.notEqual(changed.snapshotId, first.id);
  assert.equal((await store.read(changed.snapshotId, 2, origin)).event_key, first.event_key);
  const colleague = await store.prepare({ ...fixture, ownerId: 7 });
  const colleagueRow = await store.read(colleague.snapshotId, 7, origin);
  const claims = await Promise.all(Array.from({ length: 8 }, (_, i) => store.claim(i % 2 ? first : colleagueRow, "2026-11-20", { summary: "Original reminder" })));
  assert.equal(claims.filter(Boolean).length, 1);
  const winner = claims.find(Boolean);
  await store.checkpoint(winner.id, "789");
  await assert.rejects(store.verify(winner, "789")); // Old microsecond version must not overwrite the checkpoint.
  await store.hold(winner.id);
  const later = await store.prepare({ ...fixture, letterDate: "2026-11-21", today: "2026-11-21" });
  const laterRow = await store.read(later.snapshotId, 2, origin);
  assert.equal(await store.claim(laterRow, "2026-11-21", {}), null); // An edited retry cannot escape an unresolved result.
  assert.equal((await store.receipt(laterRow)).id, winner.id);
  const pending = await store.receipt(first);
  await assert.rejects(store.verify(pending, "999"));
  const saved = await store.verify(pending, "789");
  assert.equal(saved.state, "saved");
  assert.equal(saved.payload.summary, "Original reminder");
  assert.equal(await store.claim(first, "2026-11-21", {}), null); // The original event remains protected on another day.
  assert.equal(await store.claim(laterRow, "2026-11-20", {}), null); // One reminder action per pledge and actual sending date.
  assert.ok(await store.claim(laterRow, "2026-11-21", {})); // A genuinely later reminder is allowed after verification.
  assert.equal((await store.list(7, origin)).length, 1);
  assert.equal((await store.list(2, "https://different.example.test")).length, 0);
  console.log("PASS: concurrent schema/preparation, immutable snapshots, owner/origin isolation, 8 competing cross-staff claims produce 1 winner, date/event duplicate protection, unresolved holds, exact-version recovery, and later reminders.");
} finally { await run(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
