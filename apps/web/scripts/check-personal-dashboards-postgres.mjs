// Optional integration check against an explicitly supplied disposable local socket.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
const host = process.env.PERSONAL_TEST_PGHOST;
if (!host?.startsWith("/private/tmp/personal-dashboards-pg.")) throw new Error("Use a disposable personal-dashboard test socket under /private/tmp.");
const schema = `personal_test_${randomUUID().replaceAll("-", "")}`;
const quote = (value) => value == null ? "NULL" : Array.isArray(value) ? `ARRAY[${value.map(quote).join(",")}]` : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const run = (query) => new Promise((resolve, reject) => {
  const child = spawn("psql", ["-XqAt", "-h", host, "-p", process.env.PERSONAL_TEST_PGPORT || "55437", "-U", process.env.USER, "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
  let output = "", error = "";
  child.stdout.on("data", (part) => output += part); child.stderr.on("data", (part) => error += part);
  child.on("error", reject); child.on("close", (code) => code ? reject(new Error(error)) : resolve(output.trim()));
  child.stdin.end(`SET search_path TO ${schema};\n${query}`);
});
const sql = async (parts, ...values) => {
  const query = parts.reduce((text, part, index) => text + part + (index < values.length ? quote(values[index]) : ""), "").trim();
  const projection = query.startsWith("SELECT") ? `SELECT COALESCE(json_agg(t),'[]'::json) FROM (${query}) t`
    : `WITH t AS (${query}) SELECT COALESCE(json_agg(t),'[]'::json) FROM t`;
  return JSON.parse(await run(projection));
};
const utilSource = readFileSync(new URL("../src/utils/personalDashboards.js", import.meta.url), "utf8").replaceAll("export ", "");
const { validatePersonalWorkspace, isPersonalDashboardId } = new Function(`${utilSource}; return {validatePersonalWorkspace,isPersonalDashboardId};`)();
const source = readFileSync(new URL("../src/app/api/utils/personalDashboards.js", import.meta.url), "utf8").replace(/^import .*;\n/gm, "").replaceAll("export ", "");
const metricId = randomUUID();
const dashboardError = (message, status = 400) => Object.assign(new Error(message), { status });
const store = new Function("sql", "dashboardError", "listMetricLibrary", "loadMetricSources", "serializeMetric", "presentMetricResult", "getCachedReportSnapshot", "isPersonalDashboardId", "validatePersonalWorkspace", `${source}; return {readPersonalWorkspace,savePersonalWorkspace,readPersonalDashboard};`)(
  sql, dashboardError, async () => ({ entries: [{ id: metricId, format: "number" }] }), () => { throw new Error("No report data needed for ownership checks"); }, null, null, null, isPersonalDashboardId, validatePersonalWorkspace,
);
const ddl = readFileSync(new URL("../src/app/api/utils/ensureAppSchema.js", import.meta.url), "utf8").match(/DO \$personal_dashboard_schema\$[\s\S]*?\$personal_dashboard_schema\$/)[0];
const owner = { id: 7, active: true, role: "mgo" };
const dashboard = { id: randomUUID(), title: "Private test", metricIds: [metricId] };
try {
  await run(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}; CREATE TABLE users(id bigint PRIMARY KEY); INSERT INTO users VALUES(7),(8);`);
  await Promise.all(Array.from({ length: 8 }, () => run(ddl)));
  assert.deepEqual(await store.readPersonalWorkspace(owner), { revision: "0", dashboards: [], defaultDashboardId: null });
  const input = { revision: "0", dashboards: [dashboard], defaultDashboardId: dashboard.id };
  const first = await Promise.allSettled(Array.from({ length: 8 }, () => store.savePersonalWorkspace(owner, input)));
  assert.equal(first.filter((result) => result.status === "fulfilled").length, 1);
  assert(first.filter((result) => result.status === "rejected").every((result) => result.reason.status === 409));
  const saved = await store.readPersonalWorkspace(owner);
  assert.equal(saved.revision, "1"); assert.equal(saved.defaultDashboardId, dashboard.id);
  const updates = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => store.savePersonalWorkspace(owner, {
    ...saved, dashboards: [{ ...dashboard, title: `Revision winner ${index}` }], defaultDashboardId: null,
  })));
  assert.equal(updates.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await store.readPersonalWorkspace(owner)).revision, "2");
  assert.equal((await store.readPersonalWorkspace(owner)).defaultDashboardId, null);
  assert.deepEqual(await store.readPersonalWorkspace({ ...owner, id: 8 }), { revision: "0", dashboards: [], defaultDashboardId: null });
  await assert.rejects(store.readPersonalDashboard({ ...owner, role: "admin", id: 8 }, dashboard.id), { status: 404 });
  console.log("PASS: 8 concurrent additive schema initializations; one winner for concurrent creates/updates; atomic defaults; owner isolation including admins.");
} finally {
  await run(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}
