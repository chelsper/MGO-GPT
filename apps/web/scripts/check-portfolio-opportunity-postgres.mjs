// Optional integration check against an explicitly supplied disposable local socket only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const host = process.env.OPPORTUNITY_TEST_PGHOST;
if (!host?.startsWith("/private/tmp/") && !host?.startsWith("/tmp/")) throw new Error("Use a disposable PostgreSQL socket under /tmp.");
const schema = `opportunity_test_${randomUUID().replaceAll("-", "")}`;
const quote = value => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const run = query => new Promise((resolve, reject) => {
  const child = spawn("psql", ["-XqAt", "-h", host, "-p", process.env.OPPORTUNITY_TEST_PGPORT || "55439", "-U", process.env.USER, "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
  let output = "", error = "";
  child.stdout.on("data", data => output += data); child.stderr.on("data", data => error += data);
  child.on("error", reject); child.on("close", code => code ? reject(new Error(error)) : resolve(output.trim()));
  child.stdin.end(`SET search_path TO ${schema};\n${query}`);
});
const sql = async (parts, ...values) => {
  const query = parts.reduce((text, part, i) => text + part + (i < values.length ? quote(values[i]) : ""), "").trim();
  return JSON.parse(await run(query.startsWith("SELECT")
    ? `SELECT COALESCE(json_agg(t), '[]'::json) FROM (${query}) t`
    : `WITH t AS (${query}) SELECT COALESCE(json_agg(t), '[]'::json) FROM t`));
};
const source = readFileSync(new URL("../src/app/api/utils/portfolioOpportunityContext.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replaceAll("export async function", "async function").replaceAll("export function", "function");
const createConstituent = async (userId, name, id) => (await sql`INSERT INTO constituents(user_id, name, blackbaud_constituent_id) VALUES (${userId}, ${name}, ${id}) RETURNING *`)[0];
const helpers = new Function("sql", "createConstituent", "getFiscalYearFromExpectedDate", `${source}\nreturn { findPortfolioProspect, readPortfolioOpportunities, ensurePortfolioProspect, readPortfolioProspectSummary };`)(sql, createConstituent, () => "FY27");
try {
  await run(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
    CREATE TABLE constituents(id bigserial PRIMARY KEY, user_id bigint, name text, blackbaud_constituent_id text);
    CREATE TABLE prospects(id bigserial PRIMARY KEY, user_id bigint, constituent_id bigint REFERENCES constituents(id), blackbaud_constituent_id text,
      prospect_name text NOT NULL, expected_close_fy text NOT NULL, ask_amount numeric, ask_type text NOT NULL,
      status text NOT NULL DEFAULT 'Active', priority_order integer NOT NULL DEFAULT 1);
    CREATE TABLE prospect_opportunities(id bigserial PRIMARY KEY, prospect_id bigint REFERENCES prospects(id), constituent_id bigint REFERENCES constituents(id),
      title text, current_stage text, estimated_amount numeric, expected_date date, blackbaud_opportunity_id text,
      updated_at timestamptz DEFAULT NOW(), opportunity_status text DEFAULT 'Active', closed_amount numeric);`);
  const body = { donorName: "Fictional Donor", blackbaudConstituentId: "100", askAmount: 25000, expectedDate: "2027-06-01" };
  const first = await helpers.ensurePortfolioProspect(44, body);
  const repeat = await helpers.ensurePortfolioProspect(44, body);
  assert.equal(first.id, repeat.id); assert.equal(first.blackbaud_constituent_id, "100");
  assert.equal(await run("SELECT COUNT(*) FROM constituents"), "1");
  const other = await helpers.ensurePortfolioProspect(45, body);
  assert.notEqual(first.id, other.id);
  const sameName = await helpers.ensurePortfolioProspect(44, { ...body, blackbaudConstituentId: "101" });
  assert.notEqual(first.id, sameName.id); assert.notEqual(first.constituent_id, sameName.constituent_id);
  await run(`UPDATE prospects SET constituent_id=${sameName.constituent_id} WHERE id=${first.id}`);
  assert.equal(await helpers.findPortfolioProspect(44, "100"), null);
  await run(`UPDATE prospects SET constituent_id=${first.constituent_id} WHERE id=${first.id}`);
  console.log("PASS: exact constituent identity, workspace isolation, no name-based relinking, existing-prospect reuse.");
  await run(`INSERT INTO prospect_opportunities(prospect_id, constituent_id, title, current_stage, estimated_amount, expected_date, blackbaud_opportunity_id) VALUES
    (${first.id},${first.constituent_id},'Open gift','Cultivation',25000,'2027-06-01','812'),
    (${other.id},${other.constituent_id},'Another MGO','Cultivation',80000,'2027-06-01','813'),
    (${first.id},${sameName.constituent_id},'Conflicting link','Cultivation',1,'2027-06-01','814'),
    (${first.id},${first.constituent_id},'Closed gift','Funded',2,'2027-06-01','815'),
    (${first.id},${first.constituent_id},'Closed stage','Closed - Declined',3,'2027-06-01','816');`);
  let list = await helpers.readPortfolioOpportunities(44, "100");
  assert.deepEqual(list.opportunities.map(row => row.title), ["Open gift"]);
  await run(`DELETE FROM prospect_opportunities WHERE title='Conflicting link'`);
  const total = await helpers.readPortfolioProspectSummary(44, first.id);
  assert.equal(total.portfolio_open_opportunity_count, 1); assert.equal(total.portfolio_open_pipeline_amount, 25000);
  assert.equal(await helpers.readPortfolioProspectSummary(45, first.id), null);
  await run(`INSERT INTO prospect_opportunities(prospect_id, title, current_stage, estimated_amount, blackbaud_opportunity_id, updated_at)
    VALUES (${first.id},'Latest copy','Cultivation',25000,'812',NOW()+INTERVAL '1 second')`);
  list = await helpers.readPortfolioOpportunities(44, "100");
  assert.deepEqual(list.opportunities.map(row => row.title), ["Latest copy"]);
  await run(`INSERT INTO prospect_opportunities(prospect_id,title,current_stage,estimated_amount)
    SELECT ${first.id},'Local '||n,'Cultivation',10 FROM generate_series(1,51) n`);
  list = await helpers.readPortfolioOpportunities(44, "100");
  assert.equal(list.opportunities.length, 50); assert.equal(list.truncated, true);
  console.log("PASS: saved open list, conflicted/closed exclusions, NXT-ID deduplication, app-only entries, 50-row bound and scoped totals.");
  await run(`UPDATE prospects SET status='Archived' WHERE id=${first.id}`);
  assert.equal(await helpers.findPortfolioProspect(44, "100"), null);
  const replacement = await helpers.ensurePortfolioProspect(44, body);
  assert.notEqual(first.id, replacement.id);
  assert.equal(replacement.constituent_id, first.constituent_id);
  assert.equal((await helpers.readPortfolioOpportunities(44, "100")).opportunities.length, 0);
  console.log("PASS: archived history retained; new work does not revive archived opportunities.");
} finally { await run(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
