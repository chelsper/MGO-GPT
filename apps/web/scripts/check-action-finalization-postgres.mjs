// Runs only against an explicitly disposable local database; no NXT calls.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const host = process.env.NXT_CREATE_TEST_PGHOST;
if (!/^\/private\/tmp\/nxt-create-pg\.[A-Za-z0-9]+$/.test(host || "")) throw new Error("Use a disposable nxt-create-pg socket under /private/tmp.");
const schema = `action_finalize_test_${randomUUID().replaceAll("-", "")}`;
const quote = value => value == null ? "NULL" : Array.isArray(value) ? `ARRAY[${value.map(quote).join(",")}]`
  : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const run = query => new Promise((resolve, reject) => {
  const child = spawn("psql", ["-XqAt", "-h", host, "-p", process.env.NXT_CREATE_TEST_PGPORT || "55439", "-U", process.env.USER, "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
  let out = "", error = "";
  child.stdout.on("data", part => out += part); child.stderr.on("data", part => error += part);
  child.on("error", reject); child.on("close", code => code ? reject(new Error(error)) : resolve(out.trim()));
  child.stdin.end(`SET search_path TO ${schema};\n${query}`);
});
const sql = async (parts, ...values) => {
  const query = parts.reduce((text, part, index) => text + part + (index < values.length ? quote(values[index]) : ""), "").trim();
  return (await run(query)).split("\n").filter(Boolean).map(line => ({ local_finalized_at: line }));
};
const source = readFileSync(new URL("../src/app/api/utils/finalizeNextStepAction.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replace("export default ", "");
const finalize = new Function("sql", `${source}; return finalizeNextStepAction;`)(sql);
const schemaSource = readFileSync(new URL("../src/app/api/utils/ensureAppSchema.js", import.meta.url), "utf8");
const receiptDDL = schemaSource.match(/CREATE TABLE IF NOT EXISTS pending_action_nxt_receipts \([\s\S]*?\n      \)/)[0];
const markerDDL = schemaSource.match(/DO \$pending_action_finalization_schema\$[\s\S]*?END \$pending_action_finalization_schema\$/)[0];
const expected = { actionDate: "2026-09-21", actionIntent: "completed", notes: "Test", summary: "Call", actionCategory: "Phone Call", metadata: { type: "Cultivation" } };
const options = { id: 40, ownerUserId: 7, actionId: "500", constituentId: "123", expected, originalProspectId: 20, states: ["review", "saved"], message: "Existing action checked." };
async function addReceipt(id, actionId, payload = expected, state = "review") {
  await run(`INSERT INTO pending_actions VALUES(${id},7,'Open');
    INSERT INTO pending_action_nxt_receipts(pending_action_id,owner_user_id,entered_by_user_id,state,constituent_id,request_payload,blackbaud_action_id)
    VALUES(${id},7,2,${quote(state)},'123',${quote(JSON.stringify(payload))}::jsonb,${quote(actionId)});`);
}
try {
  await run(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
    CREATE TABLE users(id bigint PRIMARY KEY, blackbaud_summary_cache jsonb, blackbaud_summary_cache_key text, blackbaud_summary_cached_at timestamptz, updated_at timestamptz);
    INSERT INTO users VALUES(2,NULL,NULL,NULL,NULL),(7,'{}','test',NOW(),NOW());
    CREATE TABLE pending_actions(id bigint PRIMARY KEY, owner_user_id bigint, status text);
    CREATE TABLE constituents(id bigint PRIMARY KEY, user_id bigint, blackbaud_constituent_id text);
    CREATE TABLE prospects(id bigint PRIMARY KEY, user_id bigint, constituent_id bigint, blackbaud_constituent_id text);
    INSERT INTO prospects VALUES(20,7,NULL,'123');
    CREATE TABLE prospect_updates(id bigserial PRIMARY KEY, prospect_id bigint, update_date date, update_notes text, update_title text,
      action_category text, action_type text, blackbaud_action_id text, entered_by_user_id bigint,
      CONSTRAINT injected_failure CHECK(update_title <> 'Call'));
    ${receiptDDL};`);
  await Promise.all(Array.from({ length: 6 }, () => run(markerDDL)));
  await addReceipt(40, "500");
  await assert.rejects(finalize(options), /injected_failure/);
  assert.equal(await run("SELECT state || ':' || (local_finalized_at IS NULL)::text FROM pending_action_nxt_receipts WHERE pending_action_id=40"), "review:true");
  assert.equal(await run("SELECT blackbaud_summary_cache_key FROM users WHERE id=7"), "test");
  await run("ALTER TABLE prospect_updates DROP CONSTRAINT injected_failure");
  const competing = await Promise.all(Array.from({ length: 8 }, () => finalize(options)));
  assert.equal(competing.filter(Boolean).length, 1);
  assert.equal(await run("SELECT count(*) FROM prospect_updates WHERE blackbaud_action_id='500'"), "1");
  assert.equal(await run("SELECT entered_by_user_id FROM prospect_updates WHERE blackbaud_action_id='500'"), "2");
  assert.equal(await run("SELECT state || ':' || (local_finalized_at IS NOT NULL)::text FROM pending_action_nxt_receipts WHERE pending_action_id=40"), "saved:true");
  assert.equal(await run("SELECT (blackbaud_summary_cache IS NULL)::text FROM users WHERE id=7"), "true");
  assert.equal(await finalize(options), null);
  await addReceipt(41, "501", expected, "saved");
  await finalize({ ...options, id: 41, actionId: "501" });
  assert.equal(await run("SELECT count(*) FROM prospect_updates WHERE blackbaud_action_id='501'"), "1");
  await addReceipt(42, "502", expected, "saved");
  await run("INSERT INTO prospect_updates(prospect_id,blackbaud_action_id,update_title) VALUES(20,'502','Already present')");
  await finalize({ ...options, id: 42, actionId: "502" });
  assert.equal(await run("SELECT count(*) FROM prospect_updates WHERE blackbaud_action_id='502'"), "1");
  const planned = { ...expected, actionIntent: "planned" };
  await addReceipt(43, "503", planned);
  await finalize({ ...options, id: 43, actionId: "503", expected: planned });
  assert.equal(await run("SELECT count(*) FROM prospect_updates WHERE blackbaud_action_id='503'"), "0");
  await addReceipt(44, "504");
  assert.equal(await finalize({ ...options, id: 44, actionId: "504", ownerUserId: 2 }), null);
  assert.equal(await finalize({ ...options, id: 44, actionId: "504", expected: { ...expected, summary: "Changed" } }), null);
  await run("UPDATE prospects SET blackbaud_constituent_id='999' WHERE id=20");
  await finalize({ ...options, id: 44, actionId: "504" });
  assert.equal(await run("SELECT count(*) FROM prospect_updates WHERE blackbaud_action_id='504'"), "0");
  await run("UPDATE prospects SET blackbaud_constituent_id='123' WHERE id=20");
  await addReceipt(45, "505", expected, "processing");
  let version = await run("SELECT updated_at::text FROM pending_action_nxt_receipts WHERE pending_action_id=45");
  assert.equal(await finalize({ ...options, id: 45, actionId: "505", states: ["processing"], processingVersion: version }), null);
  await run("UPDATE pending_action_nxt_receipts SET updated_at=NOW()-INTERVAL '10 minutes' WHERE pending_action_id=45");
  version = await run("SELECT updated_at::text FROM pending_action_nxt_receipts WHERE pending_action_id=45");
  assert.equal(await finalize({ ...options, id: 45, actionId: "505", states: ["processing"], processingVersion: "2026-01-01T00:00:00Z" }), null);
  await finalize({ ...options, id: 45, actionId: "505", states: ["processing"], processingVersion: version });
  assert.equal(await run("SELECT count(*) FROM prospect_updates WHERE blackbaud_action_id='505'"), "1");
  assert.equal(await run("SELECT count(*) FROM pending_actions WHERE status <> 'Open'"), "0");
  console.log("PASS: additive migration, atomic failure rollback, 8 finalizers produce 1 activity, legacy saved recovery, no duplicate activity, planned exclusion, owner/payload guards, changed-link exclusion, stale-processing version guard, and unchanged reminders.");
} finally { await run(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
