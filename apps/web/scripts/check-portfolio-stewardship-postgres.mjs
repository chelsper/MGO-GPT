// Opt-in, fictional fixtures on a disposable local PostgreSQL socket only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const host = process.env.STEWARDSHIP_TEST_PGHOST;
if (!/^\/private\/tmp\/portfolio-stewardship-pg\.[A-Za-z0-9]+$/.test(host || "")) throw Error("Use a disposable portfolio-stewardship-pg socket under /private/tmp.");
const schema = `stewardship_test_${randomUUID().replaceAll("-", "")}`;
const quote = value => value == null ? "NULL" : typeof value === "number" || typeof value === "boolean" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const run = query => new Promise((resolve, reject) => {
  const child = spawn("psql", ["-XqAt", "-h", host, "-p", process.env.STEWARDSHIP_TEST_PGPORT || "55443", "-U", process.env.USER, "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
  let output = "", error = "";
  child.stdout.on("data", data => output += data); child.stderr.on("data", data => error += data);
  child.on("error", reject); child.on("close", code => code ? reject(new Error(error)) : resolve(output.trim()));
  child.stdin.end(`SET search_path TO ${schema};\n${query}`);
});
const sql = async (parts, ...values) => {
  const query = parts.reduce((text, part, i) => text + part + (i < values.length ? quote(values[i]) : ""), "").trim();
  assert.ok(query.startsWith("SELECT"), "Panel must not write");
  return JSON.parse(await run(`SELECT COALESCE(json_agg(t), '[]'::json) FROM (${query}) t`));
};
const readSource = path => readFileSync(new URL(path, import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replaceAll("export async function", "async function");
const readGiftReceipts = new Function("sql", "isMgoRole", "isReviewerRole",
  `${readSource("../src/app/api/utils/stewardshipReceipts.js")}\nreturn readGiftReceipts;`)(sql, role => role === "mgo", role => role === "admin");
const read = new Function("sql", "readGiftReceipts",
  `${readSource("../src/app/api/utils/portfolioStewardship.js")}\nreturn readPortfolioStewardship;`)(sql, readGiftReceipts);
const admin = { sessionUser: { id: 2, role: "admin" }, workspaceUser: { id: 44, role: "mgo" } };
const mgo = { ...admin, sessionUser: admin.workspaceUser };
try {
  await run(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
    CREATE TABLE users(id bigint PRIMARY KEY, role text, active boolean);
    INSERT INTO users VALUES (2,'admin',true),(44,'mgo',true),(45,'mgo',true);
    CREATE TABLE constituents(id bigint PRIMARY KEY, user_id bigint, blackbaud_constituent_id text);
    INSERT INTO constituents VALUES (1,44,'100'),(2,44,'101'),(3,45,'100');
    CREATE TABLE prospects(id bigint PRIMARY KEY, user_id bigint, constituent_id bigint, blackbaud_constituent_id text);
    INSERT INTO prospects VALUES (1,44,1,'100'),(2,44,2,'101'),(3,44,2,'100');
    CREATE TABLE pending_actions(id bigint PRIMARY KEY, owner_user_id bigint, constituent_id bigint, prospect_id bigint,
      title text, due_date date, status text, category text, source_gift_id text, source_gift_snapshot jsonb);
    INSERT INTO pending_actions VALUES
      (1,44,null,null,'Gift follow-up','2026-11-01','Open','Stewardship','800','{"constituentId":"100","constituentName":"Fictional Donor"}'),
      (2,44,1,null,'Manual constituent step',null,'Open','Stewardship',null,null),
      (3,44,null,1,'Manual prospect step',null,'Open','Stewardship',null,null),
      (4,44,null,3,'Conflicting constituent/prospect IDs',null,'Open','Stewardship',null,null),
      (5,44,null,2,'Another constituent',null,'Open','Stewardship',null,null),
      (6,45,null,null,'Another owner',null,'Open','Stewardship','801','{"constituentId":"100","constituentName":"Fictional Donor"}'),
      (7,44,1,null,'Done task',null,'Done','Stewardship',null,null),
      (8,44,1,null,'Cultivation only',null,'Open','Cultivation',null,null),
      (9,44,1,null,'No gift source ID',null,'Open','Stewardship','802','{"constituentName":"Fictional Donor"}'),
      (10,44,2,null,'Conflicting gift source',null,'Open','Stewardship','803','{"constituentId":"100","constituentName":"Fictional Donor"}');
    CREATE TABLE data_change_requests(id bigint PRIMARY KEY, owner_user_id bigint, blackbaud_constituent_id text,
      source_pending_action_id bigint, request_type text, status text, needed_by date, updated_at timestamptz DEFAULT NOW(),
      stewardship_gift_item_snapshot jsonb, request_version integer DEFAULT 1);
    INSERT INTO data_change_requests(id,owner_user_id,blackbaud_constituent_id,source_pending_action_id,request_type,status) VALUES
      (1,44,'100',1,'Stewardship: Personal gift','In Progress'),
      (2,45,'100',6,'Stewardship: Personal gift','Open'),
      (3,44,'101',5,'Stewardship: Personal gift','Open'),
      (4,44,'100',null,'Other request','Open');
    CREATE TABLE stewardship_gift_receipts(id bigint PRIMARY KEY, request_id bigint, item_id bigint, item_snapshot jsonb,
      constituent_id text, constituent_name text, owner_user_id bigint, owner_name text, received_on date, note text,
      recorded_by_name text, recorded_at timestamptz, voided_at timestamptz, voided_by_name text, void_reason text,
      source_kind text, source_snapshot jsonb, stock_quantity integer);
    INSERT INTO stewardship_gift_receipts(id,request_id,item_id,item_snapshot,constituent_id,owner_user_id,source_kind,voided_at) VALUES
      (1,1,1,'{"name":"App gift"}','100',44,'app',null),
      (2,null,1,'{"name":"Imported keepsake"}','100',null,'nxt_history',null),
      (3,null,1,'{"name":"Voided item"}','100',44,'app',NOW()),
      (4,null,1,'{"name":"Other donor item"}','101',44,'app',null),
      (5,2,1,'{"name":"Other owner item"}','100',45,'app',null);`);
  const result = await read(admin, "100");
  assert.deepEqual(result.requests.map(row => row.id), ["1"]);
  assert.deepEqual(result.followUps.map(row => row.id), ["1", "2", "3", "9"]);
  assert.equal(result.followUps[0].request_id, "1");
  assert.equal(result.followUps[0].can_request, true);
  assert.ok(result.followUps.slice(1).every(row => !row.can_request));
  assert.deepEqual(result.receivedItems.map(row => row.id), ["5", "2", "1"]);
  assert.equal(result.receivedItems[1].receivedOn, null);
  assert.equal(result.receivedItems[1].source, "Imported NXT history");
  assert.deepEqual((await read(mgo, "100")).receivedItems.map(row => row.id), ["1"]);
  assert.deepEqual((await read(admin, "999")).followUps, []);
  console.log("PASS: actual SQL; exact donor/owner scoping; conflicting IDs excluded; requests linked; receipt roles and voiding preserved; null dates retained.");
  await run(`INSERT INTO pending_actions(id,owner_user_id,constituent_id,title,status,category)
    SELECT n,44,1,'Additional touch','Open','Stewardship' FROM generate_series(20,31) n;
    INSERT INTO data_change_requests(id,owner_user_id,blackbaud_constituent_id,source_pending_action_id,request_type,status)
    SELECT n,44,'100',n,'Stewardship: Letter or note','Open' FROM generate_series(20,31) n;
    INSERT INTO stewardship_gift_receipts(id,item_snapshot,constituent_id,owner_user_id,source_kind)
    SELECT n,'{"name":"Additional keepsake"}','100',44,'app' FROM generate_series(20,31) n;`);
  const bounded = await read(admin, "100");
  assert.equal(bounded.requests.length, 10); assert.equal(bounded.requestsTruncated, true);
  assert.equal(bounded.followUps.length, 10); assert.equal(bounded.followUpsTruncated, true);
  assert.equal(bounded.receivedItems.length, 5); assert.equal(bounded.receivedItemsTruncated, true);
  console.log("PASS: bounded saved-data lists with explicit truncation; all panel queries are SELECT-only.");
} finally { await run(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
