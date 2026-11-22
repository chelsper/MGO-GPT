// Only a disposable Unix-socket PostgreSQL fixture. No production environment or NXT calls.
import { spawn } from "node:child_process";
import Papa from "papaparse";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
vi.mock("./sql", () => ({
  default: () => {
    throw new Error("Use the fictional test database");
  },
}));
import schema from "./projectOutreachSchema";
import { createProjectOutreachStore } from "./projectOutreachStore";
import { readOutreachNxtReadiness } from "./projectOutreachReadiness";
import { readOutreachPriorities } from "./outreachPriorities";
import { projectIdentity } from "@/utils/projectProspecting";
import {
  report,
  snapshot,
  settings,
  result,
} from "../../../../test/fixtures/projectOutreach";
const socket = process.env.PROJECT_OUTREACH_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/project-outreach-pg\.[A-Za-z0-9]+$/.test(
  socket || "",
);
const literal = (v) =>
  Array.isArray(v)
    ? literal(`{${v.map((item) => JSON.stringify(String(item))).join(",")}}`)
    : v == null
      ? "NULL"
      : typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : `'${String(v).replaceAll("'", "''")}'`;
const parse = (text) =>
  text.trim()
    ? Papa.parse(text.trim(), { header: true, skipEmptyLines: true }).data.map(
        (row) =>
          Object.fromEntries(
            Object.entries(row).map(([k, v]) => [
              k,
              v === ""
                ? null
                : v === "t"
                  ? true
                  : v === "f"
                    ? false
                    : ["settings", "payload", "result"].includes(k)
                      ? JSON.parse(v)
                      : v,
            ]),
          ),
      )
    : [];
function run(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn("/opt/homebrew/opt/postgresql@18/bin/psql", [
      "-Xq",
      "--csv",
      "--no-password",
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      socket,
      "-p",
      "55451",
      "-d",
      "postgres",
    ]);
    let out = "",
      error = "";
    child.stdout.on("data", (v) => (out += v));
    child.stderr.on("data", (v) => (error += v));
    child.on("error", reject);
    child.on("close", (code) =>
      code ? reject(new Error(error)) : resolve(out),
    );
    child.stdin.end(
      `SET search_path=outreach_fixture; SET TIME ZONE 'UTC';\n${statement}`,
    );
  });
}
const execute = async (text) => parse(await run(text));
const prepare = (s, i = 0) => `PREPARE q${i} AS ${s.text};\n`;
const invoke = (s, i = 0) =>
  `EXECUTE q${i}${s.values.length ? `(${s.values.map(literal).join(",")})` : ""};\nDEALLOCATE q${i};\n`;
function db(parts, ...values) {
  const s =
    typeof parts === "string"
      ? { text: parts, values: values[0] || [] }
      : {
          text: parts.reduce(
            (q, p, i) => q + p + (i < values.length ? `$${i + 1}` : ""),
            "",
          ),
          values,
        };
  return {
    ...s,
    then: (resolve, reject) =>
      execute(s.values.length ? prepare(s) + invoke(s) : s.text).then(
        resolve,
        reject,
      ),
  };
}
db.transaction = async (statements) =>
  (
    await run(
      `BEGIN ISOLATION LEVEL READ COMMITTED;\n${statements.map((s, i) => `${prepare(s, i)}\\echo __QUERY_${i}__\n${invoke(s, i)}`).join("\n")}COMMIT;`,
    )
  )
    .split(/__QUERY_\d+__\n/)
    .slice(1)
    .map(parse);
const store = createProjectOutreachStore(db);
const manager = {
  user: { id: 7, role: "admin" },
  report,
  origin: "https://app.test",
};
const caller = { ...manager, user: { id: 8, role: "mgo" } };
const state = {
  snapshot,
  identity: projectIdentity(snapshot, report.dataConfiguration),
  keys: { snapshot: "fixture-snapshot" },
};
const setup = () =>
  store.settings(manager, state, { settings, settingsVersion: 0 });
const assign = (
  people = [{ constituentId: "123", version: 0 }],
  extra = {},
  ctx = manager,
) =>
  store.assign(ctx, state, {
    people,
    assigneeId: 8,
    dueDate: "2026-12-31",
    settingsVersion: 1,
    snapshotAt: snapshot.generatedAt,
    ...extra,
  });
const record = async (patch = {}, ctx = caller) => {
  const [task] = await execute(
    "SELECT id,revision FROM project_outreach_tasks ORDER BY constituent_id LIMIT 1",
  );
  return store.record(
    ctx,
    state,
    {
      result: {
        ...result,
        taskId: task.id,
        version: Number(task.revision),
        ...patch,
      },
      settingsVersion: 1,
      snapshotAt: snapshot.generatedAt,
    },
    "2026-11-20",
  );
};
describe.skipIf(!enabled)("project outreach real PostgreSQL", () => {
  beforeAll(async () => {
    await execute(`DROP SCHEMA IF EXISTS outreach_fixture CASCADE; CREATE SCHEMA outreach_fixture; SET search_path=outreach_fixture;
      CREATE TABLE users(id bigint PRIMARY KEY,role text,active boolean,name text,blackbaud_constituent_id text);
      CREATE TABLE blackbaud_connections(user_id bigint PRIMARY KEY,access_token text,refresh_token text,expires_at timestamptz);
      CREATE TABLE report_configurations(report_key text PRIMARY KEY,configuration_kind text,title text,active boolean,visibility text,specific_user_ids jsonb,data_configuration jsonb,updated_at timestamptz);
      CREATE TABLE report_snapshots_cache(report_key text PRIMARY KEY,payload jsonb);
      CREATE TABLE nxt_create_receipts(id bigserial PRIMARY KEY,owner_user_id bigint,kind text,payload jsonb,state text,remote_id text,verified_by_user_id bigint,verified_at timestamptz,updated_at timestamptz);`);
    await Promise.all([schema(db), schema(db)]);
  });
  beforeEach(async () => {
    await execute(`TRUNCATE users,report_configurations,report_snapshots_cache,nxt_create_receipts,blackbaud_connections CASCADE;
      INSERT INTO users(id,role,active,name) VALUES(7,'admin',true,'Fictional Manager'),(8,'mgo',true,'Fictional Caller'),(9,'mgo',true,'Fictional Other'),(10,'executive',true,'Fictional Viewer');
      INSERT INTO report_configurations VALUES(${literal(report.key)},'constituent_list','Fictional calls',true,'specific_users','[7,8,9,10]',${literal(JSON.stringify(report.dataConfiguration))},${literal(report.revision)});
      INSERT INTO report_snapshots_cache VALUES('fixture-snapshot',${literal(JSON.stringify(snapshot))});`);
  });
  afterAll(async () => {
    await execute("DROP SCHEMA outreach_fixture CASCADE");
  });
  it("persists optional contact mappings with existing settings concurrency and manager access checks",async()=>{
    const extended={...state,snapshot:{...snapshot,headers:[...snapshot.headers,"Home phone","Preferred email"],tableRows:snapshot.tableRows.map(row=>[...row,"904-555-0100","avery@example.test"])}};
    await execute(`UPDATE report_snapshots_cache SET payload=${literal(JSON.stringify(extended.snapshot))}::jsonb WHERE report_key='fixture-snapshot'`);
    const body={settings:{...settings,alternatePhoneColumn:"Home phone",emailColumn:"Preferred email"},settingsVersion:0};
    await expect(store.settings(caller,extended,body)).rejects.toThrow();
    await store.settings(manager,extended,body);
    expect((await store.read(caller,extended)).settings).toEqual(body.settings);
    await expect(store.settings(manager,extended,body)).rejects.toThrow();
    expect((await store.read(caller,extended)).settingsVersion).toBe(1);
  });
  it("reads personal priorities in an explicit read-only transaction without multiplying assignments by events", async () => {
    await setup();
    await assign([{constituentId:"123",version:0},{constituentId:"456",version:0}],{dueDate:"2026-11-22"});
    await record({stage:"follow_up",nextDate:"2026-11-21"});
    const [task] = await execute("SELECT id FROM project_outreach_tasks WHERE constituent_id='123'");
    await execute(`INSERT INTO project_outreach_events(id,task_id,actor_id,result,state) VALUES
      ('33333333-3333-4333-8333-333333333333',${literal(task.id)},8,'{}','review'),
      ('44444444-4444-4444-8444-444444444444',${literal(task.id)},9,'{}','draft')`);
    const readOnlyDb = (text,values) => execute(`BEGIN READ ONLY; ${prepare({text,values})}${invoke({text,values})} COMMIT;`);
    const context={userId:8,origin:caller.origin,today:"2026-11-22"};
    expect(await readOutreachPriorities(context,readOnlyDb)).toEqual([{
      key:report.key,open:2,overdue:1,today:1,upcoming:0,drafts:1,verification:1,
    }]);
    await execute(`UPDATE project_outreach_tasks SET assignee_id=9,stage='complete' WHERE id=${literal(task.id)}`);
    expect((await readOutreachPriorities(context,db))[0]).toMatchObject({open:1,overdue:0,today:1,drafts:1,verification:1});
    expect((await readOutreachPriorities({...context,userId:9},db))[0]).toMatchObject({open:0,overdue:0,today:0,drafts:1,verification:0});
  });
  it("isolates overview counts by app origin and preserves scheduled work when query membership changes", async () => {
    await setup();await assign();
    const context={userId:8,origin:caller.origin,today:"2026-11-22"};
    expect((await readOutreachPriorities(context,db))[0]).toMatchObject({open:1,upcoming:1});
    expect((await readOutreachPriorities({...context,origin:"https://other.test"},db))[0]).toMatchObject({open:0,upcoming:0});
    await execute("DELETE FROM report_snapshots_cache");
    expect((await readOutreachPriorities(context,db))[0]).toMatchObject({open:1,upcoming:1});
  });
  it("enforces persisted active caller role and explicit project access even for managers", async () => {
    await setup();await assign();
    const context={userId:8,origin:caller.origin,today:"2026-11-22"};
    expect(await readOutreachPriorities({...context,userId:10},db)).toEqual([]);
    await execute("UPDATE users SET role='executive' WHERE id=8");
    expect(await readOutreachPriorities(context,db)).toEqual([]);
    await execute("UPDATE users SET role='MGO, Executive',active=FALSE WHERE id=8");
    expect(await readOutreachPriorities(context,db)).toEqual([]);
    await execute("UPDATE users SET active=TRUE WHERE id=8; UPDATE report_configurations SET specific_user_ids='[8]'");
    expect(await readOutreachPriorities({...context,userId:7},db)).toEqual([]);
    expect((await readOutreachPriorities(context,db))[0].open).toBe(1);
    await execute("UPDATE report_configurations SET visibility='all_users'");
    expect(await readOutreachPriorities(context,db)).toEqual([]);
    await execute("UPDATE report_configurations SET visibility='specific_users',active=FALSE");
    expect(await readOutreachPriorities(context,db)).toEqual([]);
    await execute("UPDATE report_configurations SET active=TRUE,data_configuration='{}'");
    expect(await readOutreachPriorities(context,db)).toEqual([]);
  });
  it("includes explicit zero workload for a shared project without assignments", async () => {
    expect(await readOutreachPriorities({userId:8,origin:caller.origin,today:"2026-11-22"},db)).toEqual([{
      key:report.key,open:0,overdue:0,today:0,upcoming:0,drafts:0,verification:0,
    }]);
  });
  it("reads connection flags only for authorized project callers, not the entire staff directory", async () => {
    await execute(`UPDATE users SET blackbaud_constituent_id='123' WHERE id=8;
      INSERT INTO blackbaud_connections VALUES(8,'fictional-access','fictional-refresh',NOW()+INTERVAL '1 hour'),(9,'fictional-access','fictional-refresh',NOW()-INTERVAL '1 hour');
      INSERT INTO users VALUES(11,'mgo',true,'Fictional unrelated','777');`);
    const own=await readOutreachNxtReadiness(caller,db);
    expect(own.state).toBe("saved");
    expect(own.callers).toEqual([{id:8,name:"Fictional Caller",connection:"saved",fundraiserMapped:true}]);
    // The persisted viewer role, not a supplied role hint, controls other callers' visibility.
    expect((await readOutreachNxtReadiness({...caller,user:{id:8,role:"admin"}},db)).callers).toEqual(own.callers);
    const all=await readOutreachNxtReadiness(manager,db);
    expect(all.callers.map(c=>c.id).sort()).toEqual([7,8,9]);
    expect(all.callers.find(c=>c.id===9)).toMatchObject({connection:"refresh_due",fundraiserMapped:false});
    expect(all.callers.find(c=>c.id===7).connection).toBe("not_connected");
    expect(JSON.stringify(all)).not.toContain("fictional-access");
    expect(JSON.stringify(all)).not.toContain("fictional-refresh");
    expect(JSON.stringify(all)).not.toContain("unrelated");
    await execute("UPDATE blackbaud_connections SET refresh_token=NULL WHERE user_id=9; UPDATE users SET active=FALSE WHERE id=8");
    const changed=await readOutreachNxtReadiness(manager,db);
    expect(changed.callers.map(c=>c.id).sort()).toEqual([7,9]);
    expect(changed.callers.find(c=>c.id===9).connection).toBe("reconnect");
    expect((await readOutreachNxtReadiness(caller,db)).callers).toEqual([]);
    await execute("UPDATE report_configurations SET specific_user_ids='[8,9]'");
    expect((await readOutreachNxtReadiness(manager,db)).callers).toEqual([]);
  });
  it("keeps local outcomes writable without any NXT connection or fundraiser mapping", async () => {
    await setup();
    await assign();
    const before=await store.read(caller,state);
    expect(before.nxtReadiness.callers).toEqual([{id:8,name:"Fictional Caller",connection:"not_connected",fundraiserMapped:false}]);
    await record();
    const after=await store.read(caller,state);
    expect(after.tasks[0].events).toHaveLength(1);
    expect(after.tasks[0].events[0].state).toBe("draft");
  });
  it("sets up, assigns, records and retains history across refresh and reassignment", async () => {
    await setup();
    expect(Number((await assign()).changed)).toBe(1);
    await record();
    expect((await store.read(caller, state)).tasks[0].events).toHaveLength(1);
    await assign([{ constituentId: "123", version: 2 }], { assigneeId: 9 });
    const current = await store.read(manager, {
      ...state,
      snapshot: { ...snapshot, tableRows: [] },
    });
    expect(current.tasks[0]).toMatchObject({
      assigneeId: 9,
      stage: "complete",
      inCurrentQuery: false,
      version: 3,
    });
    expect(current.tasks[0].events).toHaveLength(1);
    expect(
      (await execute("SELECT count(*) AS n FROM project_outreach_audits"))[0].n,
    ).toBe("4");
  });
  it("serializes competing bulk assignments and settings changes", async () => {
    const configurations = await Promise.allSettled([setup(), setup()]);
    expect(configurations.filter((r) => r.status === "fulfilled")).toHaveLength(
      1,
    );
    const requests = await Promise.allSettled([assign(), assign()]);
    expect(requests.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(
      assign([
        { constituentId: "123", version: 0 },
        { constituentId: "456", version: 0 },
      ]),
    ).rejects.toThrow(/changed/);
    expect((await store.read(manager, state)).tasks).toHaveLength(1);
  });
  it("saves an exact outcome retry once and rejects edited or foreign retries", async () => {
    await setup();
    await assign();
    const [task] = await execute("SELECT id FROM project_outreach_tasks");
    const body = { ...result, taskId: task.id };
    await record(body);
    await record(body);
    await expect(record({ ...body, notes: "Changed" })).rejects.toThrow(
      /changed/,
    );
    await expect(
      record(body, { ...caller, user: { id: 9, role: "mgo" } }),
    ).rejects.toThrow(/changed/);
    expect(
      (await execute("SELECT count(*) AS n FROM project_outreach_events"))[0].n,
    ).toBe("1");
  });
  it.each([
    "UPDATE users SET active=false WHERE id=8",
    "UPDATE users SET role='executive' WHERE id=8",
    "UPDATE report_configurations SET specific_user_ids='[7]'",
    "UPDATE report_configurations SET active=false",
    "UPDATE report_configurations SET updated_at=NOW()",
    "UPDATE report_snapshots_cache SET payload='{}'",
  ])("rechecks concurrent permissions and snapshot: %s", async (change) => {
    await setup();
    await execute(change);
    await expect(assign()).rejects.toThrow(/changed/);
    expect(
      (await execute("SELECT count(*) AS n FROM project_outreach_tasks"))[0].n,
    ).toBe("0");
  });
  it("requires manager role AND explicit project access, supports existing aliases", async () => {
    await setup();
    await expect(assign(undefined, {}, caller)).rejects.toThrow(/cannot/);
    await execute("UPDATE report_configurations SET specific_user_ids='[8,9]'");
    await expect(assign()).rejects.toThrow(/changed/);
    await execute(
      "UPDATE report_configurations SET specific_user_ids='[7,8]';UPDATE users SET role='reviewer' WHERE id=7",
    );
    await assign(
      undefined,
      {},
      { ...manager, user: { id: 7, role: "reviewer" } },
    );
  });
  it("rejects unmapped people and wrong origins, and detects unavailable callers", async () => {
    await setup();
    await expect(
      assign([{ constituentId: "999", version: 0 }]),
    ).rejects.toThrow(/changed/);
    await expect(
      assign(undefined, {}, { ...manager, origin: "https://different.test" }),
    ).rejects.toThrow();
    await assign();
    await execute("UPDATE users SET role='executive' WHERE id=8");
    expect((await store.read(manager, state)).tasks[0].assigneeAvailable).toBe(
      false,
    );
  });
  it("allows only one NXT claim and recovers the matching receipt after lost local checkpoint", async () => {
    await setup();
    await assign();
    await record();
    let event = await store.event(caller, result.eventId);
    const payload = { constituent_id: "123", description: "unique" };
    const claims = await Promise.allSettled([
      store.claim(caller, event, payload),
      store.claim(caller, event, payload),
    ]);
    expect(claims.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(
      assign([{ constituentId: "123", version: 2 }], { assigneeId: 9 }),
    ).rejects.toThrow(/changed/);
    await execute(
      `INSERT INTO nxt_create_receipts(owner_user_id,kind,payload,state,remote_id) VALUES(8,'action',${literal(JSON.stringify(payload))},'created','909')`,
    );
    event = await store.event(caller, result.eventId);
    const receipt = await store.receipt(event);
    expect(receipt.remote_id).toBe("909");
    await store.confirm(caller, event, "909", receipt);
    expect((await store.event(caller, result.eventId)).state).toBe("confirmed");
    expect(
      (await execute("SELECT state FROM nxt_create_receipts"))[0].state,
    ).toBe("verified");
    await expect(
      store.event({ ...caller, user: { id: 9 } }, result.eventId),
    ).rejects.toThrow(/Only the person/);
  });
  it("does not verify a receipt with mismatched payload or a draft event", async () => {
    await setup();
    await assign();
    await record();
    let event = await store.event(caller, result.eventId);
    const payload = { constituent_id: "123" };
    const [receipt] = await execute(
      `INSERT INTO nxt_create_receipts(owner_user_id,kind,payload,state) VALUES(8,'action',${literal(JSON.stringify(payload))},'created') RETURNING *`,
    );
    await expect(
      store.confirm(caller, { ...event, payload }, "909", receipt),
    ).rejects.toThrow(/changed/);
    expect(
      (await execute("SELECT state FROM nxt_create_receipts"))[0].state,
    ).toBe("created");
    await store.claim(caller, event, payload);
    await store.hold(event.id);
    event = await store.event(caller, event.id);
    await expect(
      store.confirm(
        caller,
        { ...event, payload: { constituent_id: "456" } },
        "909",
        receipt,
      ),
    ).rejects.toThrow(/changed/);
    await store.confirm(caller, event, "909", receipt);
  });
  it("rolls back assignments when auditing fails and keeps startup idempotent", async () => {
    await setup();
    await execute(
      "ALTER TABLE project_outreach_audits ADD CONSTRAINT deny_assignment CHECK(operation<>'assign')",
    );
    try {
      await expect(assign()).rejects.toThrow();
    } finally {
      await execute(
        "ALTER TABLE project_outreach_audits DROP CONSTRAINT deny_assignment",
      );
    }
    expect((await store.read(manager, state)).tasks).toHaveLength(0);
    await schema(db);
    await assign();
  });
  it("reopens a proven unsent claim but never one with a matching durable receipt", async () => {
    await setup();
    await assign();
    await record();
    let event = await store.event(caller, result.eventId);
    const payload = { constituent_id: "123", description: "unique" };
    await store.claim(caller, event, payload);
    event = await store.event(caller, event.id);
    await store.unclaimUnsent(caller, event);
    expect((await store.event(caller, event.id)).state).toBe("draft");
    await store.claim(caller, event, payload);
    await execute(
      `INSERT INTO nxt_create_receipts(owner_user_id,kind,payload,state) VALUES(8,'action',${literal(JSON.stringify(payload))},'processing')`,
    );
    await expect(store.unclaimUnsent(caller, event)).rejects.toThrow(/changed/);
    expect((await store.event(caller, event.id)).state).toBe("processing");
  });
});
