// Disposable local PostgreSQL only. Never reads DATABASE_URL or calls NXT.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import Papa from "papaparse";
import { createGiftFollowUp, readGiftFollowUp, readGiftFollowUpStatuses } from "./giftFollowUp";

const socket = process.env.GIFT_FOLLOWUP_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/gift-followup-pg\.[A-Za-z0-9]+$/.test(socket || "");
const literal = value => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
function execute(statement) {
  return new Promise((resolve, reject) => {
    const child = execFile("/opt/homebrew/opt/postgresql@18/bin/psql", ["-X", "--no-password", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "55448", "-d", "postgres"],
      { encoding: "utf8" }, (error, output) => {
        if (error) { reject(error); return; }
        resolve(output.trim() ? Papa.parse(output.trim(), { header: true }).data.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
          [key, value === "" ? null : key === "source_gift_snapshot" ? JSON.parse(value) : ["already_exists", "is_primary", "needs_discussion"].includes(key) ? value === "t" : value]))) : []);
      });
    child.stdin.end(`SET search_path=gift_followup_fixture;\n${statement}`);
  });
}
const db = (parts, ...values) => {
  const text = parts.reduce((query, part, index) => query + part + (index < values.length ? literal(values[index]) : ""), "");
  return { text, then: (resolve, reject) => execute(text).then(resolve, reject) };
};
db.transaction = async queries => [[], await execute(`BEGIN;\n\\o /dev/null\n${queries[0].text}; SELECT pg_sleep(0.05);\n\\o\n${queries[1].text}; COMMIT;`)];
const actor = { id: 2, name: "Admin", role: "admin", active: true };
const owner = { id: 7, name: "Officer", role: "mgo", active: true };
const context = { sessionUser: actor, workspaceUser: owner, isActing: true };
const item = { key: "gift:900", revision: "a".repeat(64), giftId: "900", constituentId: "100", constituentName: "Sample Donor", giftAmount: 2500, dueDate: "2026-09-28", savedAt: "2026-09-28T10:00:00Z" };
const draft = { title: "  Thank donor  ", details: "Plan a call", dueDate: "2026-09-30" };
const create = (overrides = {}) => createGiftFollowUp({ context, item, draft, db, ...overrides });

describe.skipIf(!enabled)("gift follow-up PostgreSQL persistence", () => {
  beforeAll(async () => {
    await execute(`DROP SCHEMA IF EXISTS gift_followup_fixture CASCADE; CREATE SCHEMA gift_followup_fixture; SET search_path=gift_followup_fixture;
      CREATE TABLE users(id bigint PRIMARY KEY, name text, role text, active boolean DEFAULT TRUE, blackbaud_portfolio_cache jsonb, blackbaud_portfolio_cached_at timestamptz);
      CREATE TABLE prospects(id bigint PRIMARY KEY, user_id bigint, title text);
      CREATE TABLE prospect_opportunities(id bigint PRIMARY KEY);
      CREATE TABLE discussion_items(id bigint PRIMARY KEY);`);
    const statements = [...readFileSync("src/app/api/utils/ensureAppSchema.js", "utf8").matchAll(/await sql`([\s\S]*?)`;/g)]
      .map(match => match[1]).filter(statement => /CREATE TABLE IF NOT EXISTS (constituents|pending_actions) \(/.test(statement) ||
        /ALTER TABLE pending_actions[\s\S]*ADD COLUMN IF NOT EXISTS (source_discussion_id|source_gift_id)/.test(statement) ||
        statement.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_actions_gift_origin"));
    expect(statements).toHaveLength(5);
    for (const statement of statements) await execute(statement);
    for (const statement of statements) await execute(statement);
  });
  beforeEach(async () => {
    await execute(`TRUNCATE users, constituents, prospects, pending_actions RESTART IDENTITY CASCADE;
      INSERT INTO users(id,role,blackbaud_portfolio_cached_at,blackbaud_portfolio_cache) VALUES
      (2,'admin',NOW(),'{}'),
      (7,'mgo',NOW(),'{"leadSolicitor":[{"constituentId":"100","name":"Sample Donor"}]}'),
      (8,'mgo',NOW(),'{"supportingSolicitor":[{"constituentId":"100","name":"Sample Donor"}]}');
      UPDATE users SET name='Example Officer' WHERE id=7;
      INSERT INTO constituents(user_id,name,normalized_name,blackbaud_constituent_id) VALUES (8,'Other workspace donor','other workspace donor','100');
      INSERT INTO prospects VALUES(1,7,'Existing prospect');
      INSERT INTO pending_actions(owner_user_id,prospect_id,title,status,is_primary) VALUES(7,1,'Existing primary','Open',TRUE);`);
  });
  it("creates one additional constituent-linked task and preserves the primary task", async () => {
    const primary = await execute("SELECT * FROM pending_actions WHERE is_primary=TRUE");
    const task = await create();
    expect(task).toMatchObject({ title: "Thank donor", owner_user_id: "7", status: "Open", already_exists: false,
      source_gift_snapshot: { amount: 2500, giftId: "900", constituentId: "100", revision: item.revision } });
    expect(await execute("SELECT * FROM pending_actions WHERE is_primary=TRUE")).toEqual(primary);
    const [row] = await execute(`SELECT pa.is_primary, pa.needs_discussion, pa.prospect_id, pa.category, pa.entered_by_user_id, c.user_id
      FROM pending_actions pa JOIN constituents c ON c.id=pa.constituent_id WHERE pa.source_gift_id='900'`);
    expect(row).toMatchObject({ is_primary: false, needs_discussion: false, prospect_id: null, category: "Stewardship", entered_by_user_id: "2", user_id: "7" });
  });
  it("serializes concurrent submissions without duplicate tasks or orphan constituents", async () => {
    const results = await Promise.all([create(), create(), create()]);
    expect(new Set(results.map(result => result.id)).size).toBe(1);
    expect(results.filter(result => !result.already_exists)).toHaveLength(1);
    expect((await execute("SELECT COUNT(*) FROM constituents WHERE user_id=7"))[0].count).toBe("1");
    expect((await execute("SELECT COUNT(*) FROM pending_actions WHERE source_gift_id='900'"))[0].count).toBe("1");
  });
  it("returns existing completed and edited tasks unchanged even with a newer gift revision", async () => {
    const first = await create();
    await execute(`UPDATE pending_actions SET status='Done',title='Personalized plan',details='Edited notes' WHERE id=${first.id}`);
    const second = await create({ item: { ...item, giftAmount: 3000, revision: "b".repeat(64) } });
    expect(second).toMatchObject({ id: first.id, title: "Personalized plan", status: "Done", already_exists: true, source_gift_snapshot: { amount: 2500 } });
  });
  it("keeps duplicate protection after a Top Prospect is removed", async () => {
    const first = await create(); await execute("DELETE FROM prospects WHERE id=1");
    expect((await create()).id).toBe(first.id);
  });
  it("isolates task lookup and creation by workspace, while reusing an owned constituent", async () => {
    const first = await create();
    expect(await readGiftFollowUp(8, "900", db)).toBeNull();
    const second = await create({ context: { ...context, workspaceUser: { ...owner, id: 8 } } });
    expect(second.id).not.toBe(first.id);
    expect((await readGiftFollowUp(7, "900", db)).id).toBe(first.id);
    expect((await execute("SELECT COUNT(*) FROM constituents WHERE user_id=8"))[0].count).toBe("1");
  });
  it.each(["UPDATE users SET active=FALSE WHERE id=2", "UPDATE users SET role='executive' WHERE id=2",
    "UPDATE users SET active=FALSE WHERE id=7", "UPDATE users SET role='executive' WHERE id=7",
    "UPDATE users SET blackbaud_portfolio_cache='{}' WHERE id=7",
    "UPDATE users SET blackbaud_portfolio_cached_at=NOW()-INTERVAL '73 hours' WHERE id=7"])("rechecks changed authorization or membership before insert: %s", async change => {
    await execute(change); expect(await create()).toBeNull();
    expect((await execute("SELECT COUNT(*) FROM constituents WHERE user_id=7"))[0].count).toBe("0");
    expect((await execute("SELECT COUNT(*) FROM pending_actions WHERE source_gift_id IS NOT NULL"))[0].count).toBe("0");
  });
  it("fails closed on a conflicting gift-to-constituent identity without relinking", async () => {
    const first = await create();
    await execute(`UPDATE users SET blackbaud_portfolio_cache='{"leadSolicitor":[{"constituentId":"200"}]}' WHERE id=7`);
    expect(await create({ item: { ...item, constituentId: "200" } })).toBeNull();
    expect((await readGiftFollowUp(7, "900", db)).id).toBe(first.id);
  });
  it("does not even start a transaction for read-only delegation", async () => {
    expect(await create({ context: { ...context, sessionUser: { ...actor, role: "executive" } } })).toBeNull();
  });
  it("reads current title, owner and progress after completion, reopening and rescheduling", async () => {
    const task = await create();
    const read = async () => (await readGiftFollowUpStatuses(7, [item], db)).get("900");
    expect(await read()).toMatchObject({ id: task.id, ownerName: "Example Officer", status: "Open", dueDate: "2026-09-30" });
    await execute(`UPDATE pending_actions SET status='Done',title='Personalized thank-you plan' WHERE id=${task.id}`);
    expect(await read()).toMatchObject({ status: "Done", title: "Personalized thank-you plan" });
    await execute(`UPDATE pending_actions SET status='Open',due_date=NULL WHERE id=${task.id}`);
    expect(await read()).toMatchObject({ status: "Open", dueDate: null });
    await execute(`UPDATE pending_actions SET due_date='2027-09-30' WHERE id=${task.id}`);
    expect(await read()).toMatchObject({ status: "Open", dueDate: "2027-09-30" });
  });
  it("never infers progress from a matching name, other workspace or conflicting constituent identity", async () => {
    await create();
    expect((await readGiftFollowUpStatuses(8, [item], db)).size).toBe(0);
    expect((await readGiftFollowUpStatuses(7, [{ ...item, constituentId: "200" }], db)).size).toBe(0);
    expect((await readGiftFollowUpStatuses(7, [{ ...item, giftId: "901" }], db)).size).toBe(0);
    expect((await readGiftFollowUpStatuses(7, [{ ...item, revision: "b".repeat(64), giftAmount: 3000 }], db)).get("900")).toMatchObject({ status: "Open" });
  });
});
