// Disposable local PostgreSQL only. Never reads DATABASE_URL or calls NXT.
import { spawn } from "node:child_process";
import Papa from "papaparse";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ query: null, transaction: null }));
vi.mock("./sql", () => ({ default: Object.assign((...args) => fixture.query(...args), { transaction: (...args) => fixture.transaction(...args) }) }));
import { mutateProjectTags, readProjectTags } from "./projectProspectingTags";
import projectProspectingSchema from "./projectProspectingSchema";
import { projectSource, projectIdentity } from "@/utils/projectProspecting";
const socket = process.env.PROJECT_PROSPECTING_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/project-prospecting-pg\.[A-Za-z0-9]+$/.test(socket || "");
const literal = value => Array.isArray(value) ? `ARRAY[${value.map(literal).join(",")}]::text[]`
  : value == null ? "NULL" : typeof value === "number" ? String(value) : typeof value === "boolean" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const parse = text => text.trim() ? Papa.parse(text.trim(), { header: true, skipEmptyLines: true }).data.map(row =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === "" ? null : value === "t" ? true : value === "f" ? false : value]))) : [];
function run(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn("/opt/homebrew/opt/postgresql@18/bin/psql", ["-Xq", "--csv", "--no-password", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "55449", "-d", "postgres"]);
    let out = "", error = "";
    child.stdout.on("data", value => out += value); child.stderr.on("data", value => error += value);
    child.on("error", reject); child.on("close", code => code ? reject(new Error(error)) : resolve(out));
    child.stdin.end(`SET search_path = project_prospecting_fixture; SET TIME ZONE 'UTC';\n${statement}`);
  });
}
const execute = async text => parse(await run(text));
const report = { key: "list-project-center", revision: "2026-11-09 12:00:00+00", dataConfiguration: { ...projectSource(), systemIdColumn: "System ID" } };
const context = { user: { id: 7 }, report, origin: "https://app.test" };
const snapshot = { generatedAt: "s1", headers: ["System ID", "Name"], tableRows: [["123", "Fictional Avery"], ["456", "Fictional Blake"]] };
const state = { keys: { snapshot: "fixture-snapshot" }, snapshot, identity: projectIdentity(snapshot, report.dataConfiguration) };
const create = (name = "Leadership", ctx = context) => mutateProjectTags(ctx, state, { action: "create", revision: report.revision, name });
const change = (tagId, action = "apply", ids = ["123"], ctx = context, current = state) => mutateProjectTags(ctx, current,
  { action, tagId, constituentIds: ids, revision: report.revision, snapshotAt: current.snapshot.generatedAt });

describe.skipIf(!enabled)("project tags local PostgreSQL", () => {
  beforeAll(async () => {
    fixture.query = (parts, ...values) => {
      const text = parts.reduce((query, part, i) => query + part + (i < values.length ? literal(values[i]) : ""), "");
      return { text, then: (resolve, reject) => execute(text).then(resolve, reject) };
    };
    fixture.transaction = async statements => {
      const output = await run(`BEGIN ISOLATION LEVEL READ COMMITTED;\n${statements.map((s, i) => `\\echo __QUERY_${i}__\n${s.text};`).join("\n")}\nCOMMIT;`);
      return output.split(/__QUERY_\d+__\n/).slice(1).map(parse);
    };
    await execute(`DROP SCHEMA IF EXISTS project_prospecting_fixture CASCADE; CREATE SCHEMA project_prospecting_fixture; SET search_path = project_prospecting_fixture;
      CREATE TABLE users(id bigint PRIMARY KEY, active boolean NOT NULL);
      CREATE TABLE report_configurations(report_key text PRIMARY KEY, configuration_kind text, title text, description text, active boolean, visibility text, specific_user_ids jsonb, data_configuration jsonb, updated_at timestamptz);
      CREATE TABLE report_snapshots_cache(report_key text PRIMARY KEY, payload jsonb);`);
    await Promise.all([projectProspectingSchema(fixture.query), projectProspectingSchema(fixture.query)]);
  });
  beforeEach(async () => {
    await execute(`TRUNCATE project_prospect_tag_events,project_prospect_tag_assignments,project_prospect_tags,report_configurations,users,report_snapshots_cache CASCADE;
      INSERT INTO users VALUES(7,true),(8,true);
      INSERT INTO report_configurations VALUES('list-project-center','constituent_list','Fictional project','',true,'specific_users','[7]',${literal(JSON.stringify(report.dataConfiguration))},'2026-11-09 12:00:00+00');
      INSERT INTO report_snapshots_cache VALUES('fixture-snapshot',${literal(JSON.stringify(snapshot))});`);
  });
  afterAll(async () => { await execute("DROP SCHEMA project_prospecting_fixture CASCADE"); });
  it("creates, applies/removes and audits tags only once on retries", async () => {
    const { tag } = await create();
    expect((await create("leadership")).tag.id).toBe(tag.id);
    expect(Number((await change(tag.id, "apply", ["123", "456"])).changed)).toBe(2);
    expect(Number((await change(tag.id)).changed)).toBe(0);
    expect((await readProjectTags(context, state)).assignments).toHaveLength(2);
    expect(Number((await change(tag.id, "remove")).changed)).toBe(1);
    expect(Number((await change(tag.id, "remove")).changed)).toBe(0);
    expect((await execute("SELECT count(*) AS count FROM project_prospect_tag_events"))[0].count).toBe("4");
  });
  it("serializes concurrent creates and assignments", async () => {
    const results = await Promise.all([create(), create("LEADERSHIP")]);
    expect(results[0].tag.id).toBe(results[1].tag.id);
    await Promise.all([change(results[0].tag.id), change(results[0].tag.id)]);
    expect((await execute("SELECT count(*) AS count FROM project_prospect_tag_assignments"))[0].count).toBe("1");
  });
  it("retains tags when someone leaves and returns to the query", async () => {
    const { tag } = await create(); await change(tag.id);
    expect((await readProjectTags(context, { ...state, identity: { ids: ["456"] } })).assignments).toHaveLength(0);
    expect((await readProjectTags(context, state)).assignments).toHaveLength(1);
  });
  it.each(["UPDATE users SET active=false WHERE id=7", "UPDATE report_configurations SET specific_user_ids='[8]'", "UPDATE report_configurations SET active=false",
    "UPDATE report_configurations SET updated_at=NOW()", "UPDATE report_snapshots_cache SET payload='{}'"])("rechecks writes after a concurrent change: %s", async sql => {
    const { tag } = await create(); await execute(sql);
    await expect(change(tag.id)).rejects.toThrow(/changed/);
    expect((await execute("SELECT count(*) AS count FROM project_prospect_tag_assignments"))[0].count).toBe("0");
  });
  it("does not allow tags from another project or an unselected user", async () => {
    const { tag } = await create();
    await execute(`INSERT INTO report_configurations SELECT 'list-other',configuration_kind,title,description,active,visibility,specific_user_ids,data_configuration,updated_at FROM report_configurations`);
    await expect(change(tag.id, "apply", ["123"], { ...context, report: { ...report, key: "list-other" } })).rejects.toThrow(/not available/);
    await expect(change(tag.id, "apply", ["123"], { ...context, user: { id: 8 } })).rejects.toThrow(/access/);
  });
  it("rolls back a mutation if the audit insert fails", async () => {
    const { tag } = await create();
    await execute("ALTER TABLE project_prospect_tag_events ADD CONSTRAINT reject_apply CHECK(action<>'apply')");
    try { await expect(change(tag.id)).rejects.toThrow(); }
    finally { await execute("ALTER TABLE project_prospect_tag_events DROP CONSTRAINT reject_apply"); }
    expect((await execute("SELECT count(*) AS count FROM project_prospect_tag_assignments"))[0].count).toBe("0");
    expect(Number((await change(tag.id)).changed)).toBe(1);
  });
  it("enforces the tag limit without preventing reuse and leaves existing project settings intact on schema reruns", async () => {
    await execute("INSERT INTO project_prospect_tags(id,project_key,name,name_key) SELECT gen_random_uuid(),'list-project-center','Tag '||n,'tag '||n FROM generate_series(1,100) n");
    await expect(create("new tag")).rejects.toThrow(/100-tag limit/);
    expect((await create("Tag 1")).tag.name).toBe("Tag 1");
    await projectProspectingSchema(fixture.query);
    expect((await execute("SELECT active, specific_user_ids FROM report_configurations WHERE report_key='list-project-center'"))[0]).toEqual({ active: true, specific_user_ids: "[7]" });
  });
});
