// Disposable local PostgreSQL only. Never reads DATABASE_URL or calls NXT.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Papa from "papaparse";
import { createTaskAssistance, readTaskAssistance, updateAssistance } from "./stewardshipAssistance";
import schema from "./stewardshipAssistanceSchema";

const socket = process.env.GIFT_FOLLOWUP_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/gift-followup-pg\.[A-Za-z0-9]+$/.test(socket || "");
const literal = value => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
function execute(statement) {
  return new Promise((resolve, reject) => {
    const child = execFile("/opt/homebrew/opt/postgresql@18/bin/psql", ["-X", "--no-password", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "55448", "-d", "postgres"],
      { encoding: "utf8" }, (error, output) => {
        if (error) { reject(error); return; }
        resolve(output.trim() ? Papa.parse(output.trim(), { header: true }).data.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
          [key, value === "" ? null : ["request", "source_gift_snapshot"].includes(key) ? JSON.parse(value) : key === "already_exists" ? value === "t" : value]))) : []);
      });
    child.stdin.end(`SET search_path=stewardship_assistance_fixture;\n${statement}`);
  });
}
const db = (parts, ...values) => {
  const text = parts.reduce((query, part, index) => query + part + (index < values.length ? literal(values[index]) : ""), "");
  return { text, then: (resolve, reject) => execute(text).then(resolve, reject) };
};
db.transaction = async queries => {
  const rows = await execute(`BEGIN;\n\\o /dev/null\n${queries.slice(0, -1).map(query => `${query.text};`).join("\n")} SELECT pg_sleep(0.02);\n\\o\n${queries.at(-1).text}; COMMIT;`);
  return [...queries.slice(0, -1).map(() => []), rows];
};
const actor = { id: 2, name: "Admin", role: "admin", active: true };
const owner = { id: 7, name: "Officer", role: "mgo", active: true };
const context = { sessionUser: actor, workspaceUser: owner, isActing: true };
const draft = { type: "gift", instructions: "Please suggest a personal gift.", neededBy: "2026-10-10", expectedUpdatedAt: "2026-09-28T10:00:00Z" };
const create = () => createTaskAssistance(context, 10, draft, db);

describe.skipIf(!enabled)("shared stewardship request PostgreSQL persistence", () => {
  beforeAll(async () => {
    await execute(`DROP SCHEMA IF EXISTS stewardship_assistance_fixture CASCADE; CREATE SCHEMA stewardship_assistance_fixture; SET search_path=stewardship_assistance_fixture;
      CREATE TABLE users(id bigint PRIMARY KEY, name text, role text, active boolean DEFAULT TRUE);
      CREATE TABLE prospect_pool(id bigint PRIMARY KEY);
      CREATE TABLE constituents(id bigint PRIMARY KEY);
      CREATE TABLE pending_actions(id bigint PRIMARY KEY, owner_user_id bigint, status text, updated_at timestamptz,
        source_gift_id text, source_gift_snapshot jsonb);`);
    const statements = [...readFileSync("src/app/api/utils/ensureAppSchema.js", "utf8").matchAll(/await sql`([\s\S]*?)`;/g)]
      .map(match => match[1]).filter(statement => /CREATE TABLE IF NOT EXISTS data_change_requests \(/.test(statement));
    expect(statements).toHaveLength(1);
    await execute(statements[0]);
    await schema(db); await schema(db);
  });
  beforeEach(async () => {
    await execute(`TRUNCATE users, pending_actions, data_change_requests, stewardship_request_events RESTART IDENTITY CASCADE;
      INSERT INTO users VALUES (2,'Admin','admin',TRUE),(7,'Officer','mgo',TRUE),(8,'Other Officer','mgo',TRUE);
      INSERT INTO pending_actions VALUES(10,7,'Open','2026-09-28T10:00:00Z','900',
        '{"giftId":"900","constituentId":"100","constituentName":"Sample Donor","amount":2500,"date":"2026-09-16"}');`);
  });
  afterAll(async () => { await execute("DROP SCHEMA stewardship_assistance_fixture CASCADE"); });

  it("saves one existing-queue request and audit entry without changing the reminder", async () => {
    const before = await execute("SELECT * FROM pending_actions");
    expect(await create()).toMatchObject({ already_exists: false });
    expect(await execute("SELECT * FROM pending_actions")).toEqual(before);
    const [request] = await execute("SELECT * FROM data_change_requests");
    expect(request).toMatchObject({ owner_user_id: "7", requester_user_id: "2", source_pending_action_id: "10",
      blackbaud_constituent_id: "100", request_type: "Stewardship: Personal gift", request_version: "1", status: "Open" });
    expect((await execute("SELECT * FROM stewardship_request_events"))[0]).toMatchObject({ request_id: request.id, version: "1", actor_name: "Admin" });
    expect((await readTaskAssistance(context, 10, db)).request.id).toBe(request.id);
  });
  it("serializes simultaneous retries into one request and one audit event", async () => {
    const results = await Promise.all([create(), create(), create()]);
    expect(new Set(results.map(result => result.id)).size).toBe(1);
    expect(results.filter(result => !result.already_exists)).toHaveLength(1);
    expect((await execute("SELECT COUNT(*) FROM stewardship_request_events"))[0].count).toBe("1");
  });
  it("keeps saved request details on replay even after the reminder is completed", async () => {
    const first = await create();
    await execute("UPDATE pending_actions SET status='Done',updated_at=NOW()");
    const again = await createTaskAssistance(context, 10, { ...draft, instructions: "Do not overwrite" }, db);
    expect(again).toMatchObject({ id: first.id, already_exists: true });
    expect((await readTaskAssistance(context, 10, db)).request.request_note).toBe(draft.instructions);
  });
  it.each([
    "UPDATE pending_actions SET status='Done'", "UPDATE pending_actions SET updated_at=NOW()",
    "UPDATE pending_actions SET owner_user_id=8", "UPDATE pending_actions SET source_gift_id=NULL",
    "UPDATE pending_actions SET source_gift_snapshot='{}'", "UPDATE users SET active=FALSE WHERE id=2",
    "UPDATE users SET role='executive' WHERE id=2", "UPDATE users SET active=FALSE WHERE id=7",
    "UPDATE users SET role='executive' WHERE id=7",
  ])("rejects a changed or unauthorized source without inserting: %s", async statement => {
    await execute(statement); expect(await create()).toBeNull();
    expect(await execute("SELECT * FROM data_change_requests")).toHaveLength(0);
  });
  it("isolates solicitor workspaces and permits the owner to submit", async () => {
    expect(await readTaskAssistance({ ...context, workspaceUser: { ...owner, id: 8 } }, 10, db)).toBeNull();
    expect(await createTaskAssistance({ sessionUser: owner, workspaceUser: owner, isActing: false }, 10, draft, db)).toMatchObject({ already_exists: false });
    expect((await execute("SELECT requester_user_id FROM data_change_requests"))[0].requester_user_id).toBe("7");
  });
  it("shows staff changes on the same request without completing the solicitor's task", async () => {
    const first = await create();
    const updated = await updateAssistance(actor, first.id, { version: 1, status: "Completed", note: "Assistance arranged; officer will follow up." }, db);
    expect(updated).toMatchObject({ id: first.id, request_version: "2", status: "Completed" });
    const task = await readTaskAssistance(context, 10, db);
    expect(task.status).toBe("Open");
    expect(task.request).toMatchObject({ id: first.id, status: "Completed", reviewer_notes: "Assistance arranged; officer will follow up." });
    expect(await execute("SELECT * FROM stewardship_request_events ORDER BY version")).toHaveLength(2);
  });
  it("rejects competing staff edits instead of silently overwriting", async () => {
    const first = await create();
    const results = await Promise.all(["First note", "Second note"].map(note => updateAssistance(actor, first.id, { version: 1, status: "In Progress", note }, db)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await execute("SELECT COUNT(*) FROM stewardship_request_events"))[0].count).toBe("2");
  });
  it("rechecks staff permission inside the update and never edits ordinary data requests", async () => {
    const first = await create();
    await execute("UPDATE users SET role='mgo' WHERE id=2");
    expect(await updateAssistance(actor, first.id, { version: 1, status: "Completed", note: "Not allowed" }, db)).toBeNull();
    expect(await updateAssistance(owner, first.id, { version: 1, status: "Completed", note: "Not allowed" }, db)).toBeNull();
    await execute("UPDATE users SET role='admin' WHERE id=2; UPDATE data_change_requests SET source_pending_action_id=NULL");
    expect(await updateAssistance(actor, first.id, { version: 1, status: "Completed", note: "Wrong workflow" }, db)).toBeNull();
  });
  it("preserves the request and history if the originating reminder is removed", async () => {
    const first = await create(); await execute("DELETE FROM pending_actions");
    expect((await execute("SELECT id FROM data_change_requests"))[0].id).toBe(first.id);
    expect(await execute("SELECT * FROM stewardship_request_events")).toHaveLength(1);
  });
});
