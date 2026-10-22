// Disposable local PostgreSQL only. Never reads DATABASE_URL or contacts NXT.
import { execFile } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Papa from "papaparse";
import { giftFollowUpFilters, readStewardshipGiftFollowUps } from "./stewardshipGiftFollowUps";

const socket = process.env.GIFT_FOLLOWUP_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/gift-followup-pg\.[A-Za-z0-9]+$/.test(socket || "");
const literal = value => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
function execute(statement) {
  return new Promise((resolve, reject) => {
    const child = execFile("/opt/homebrew/opt/postgresql@18/bin/psql", ["-X", "--no-password", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "55448", "-d", "postgres"],
      { encoding: "utf8" }, (error, output) => {
        if (error) { reject(error); return; }
        resolve(output.trim() ? Papa.parse(output.trim(), { header: true }).data.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
          [key, ["items", "owners"].includes(key) ? JSON.parse(value) : value]))) : []);
      });
    child.stdin.end(`SET search_path=stewardship_gift_fixture;\n${statement}`);
  });
}
const db = (parts, ...values) => execute(parts.reduce((query, part, index) => query + part + (index < values.length ? literal(values[index]) : ""), ""));
const read = (filters = {}) => readStewardshipGiftFollowUps(db, giftFollowUpFilters(new URLSearchParams(filters)), "2026-09-28");

describe.skipIf(!enabled)("shared stewardship saved-task query", () => {
  beforeAll(async () => {
    await execute(`DROP SCHEMA IF EXISTS stewardship_gift_fixture CASCADE;
      CREATE SCHEMA stewardship_gift_fixture; SET search_path=stewardship_gift_fixture;
      CREATE TABLE users(id bigint PRIMARY KEY, name text, active boolean DEFAULT TRUE);
      CREATE TABLE pending_actions(id bigint PRIMARY KEY, title text, status text, due_date date, completed_at timestamptz,
        owner_user_id bigint REFERENCES users(id), source_gift_id text, source_gift_snapshot jsonb, details text);`);
  });
  afterAll(async () => { await execute("DROP SCHEMA stewardship_gift_fixture CASCADE;"); });
  beforeEach(async () => {
    await execute(`TRUNCATE pending_actions, users;
      INSERT INTO users(id,name,active) VALUES (7,'Avery Officer',TRUE),(8,'Blake Officer',TRUE),(9,'Former Officer',FALSE);
      INSERT INTO pending_actions(id,title,status,due_date,owner_user_id,source_gift_id,source_gift_snapshot,details)
      SELECT n, 'Thank donor ' || n, 'Open', '2026-09-27', 7, (900+n)::text,
        jsonb_build_object('giftId',(900+n)::text,'constituentId',(100+n)::text,'constituentName','Donor ' || n,
          'amount',2500,'date','2026-09-20','checkedAt','2026-09-28T10:00:00Z'), 'Private note' FROM generate_series(1,27) n;
      INSERT INTO pending_actions VALUES
        (30,'Completed call','Done','2026-09-20',NOW(),8,'901','{"constituentId":"101","constituentName":"Donor 1","amount":2500}', 'Private note'),
        (31,'Check in today','Open','2026-09-28',NULL,8,'931','{"constituentId":"131","constituentName":"Today Donor"}',NULL),
        (32,'Check in tomorrow','Open','2026-09-29',NULL,8,'932','{"constituentId":"132","constituentName":"Tomorrow Donor"}',NULL),
        (33,'No date yet','Open',NULL,NULL,9,'933','{"constituentId":"133","constituentName":"Undated Donor"}',NULL),
        (34,'Regular task not linked to gift','Open','2026-09-20',NULL,7,NULL,NULL,NULL),
        (35,'Later this year','Open','2026-12-31',NULL,8,'935','{"constituentId":"135","constituentName":"Future Donor"}',NULL);`);
  });

  it("paginates all owners with stable date/id ordering and excludes non-gift tasks", async () => {
    const first = await read();
    expect(first).toMatchObject({ total: 31, page: 1, pages: 2, pageSize: 25 });
    expect(first.items.map(item => item.id)).toEqual(Array.from({ length: 25 }, (_, i) => String(i + 1)));
    const last = await read({ page: 2 });
    expect(last.items.map(item => item.id)).toEqual(["26", "27", "31", "32", "35", "33"]);
    expect(first.owners).toEqual([{ id: "7", name: "Avery Officer", active: true }, { id: "8", name: "Blake Officer", active: true }, { id: "9", name: "Former Officer", active: false }]);
  });
  it("clamps an obsolete page and returns useful pagination for zero matches", async () => {
    expect(await read({ page: 999999 })).toMatchObject({ page: 2, pages: 2 });
    expect(await read({ page: 2, search: "Nobody" })).toMatchObject({ total: 0, page: 1, pages: 1, items: [], owners: expect.any(Array) });
  });
  it.each([["overdue", 27], ["today", 1], ["upcoming", 1], ["undated", 1]])("filters %s using the supplied organization day and only open tasks", async (due, count) => {
    expect((await read({ due, status: "all" })).total).toBe(count);
    expect((await read({ due, status: "Done" })).total).toBe(0);
  });
  it("includes exactly seven future days, excluding today and day eight", async () => {
    await execute("UPDATE pending_actions SET due_date='2026-10-05' WHERE id=32;");
    expect((await read({ due: "upcoming" })).items.map(item => item.id)).toEqual(["32"]);
    await execute("UPDATE pending_actions SET due_date='2026-10-06' WHERE id=32;");
    expect((await read({ due: "upcoming" })).total).toBe(0);
  });
  it("filters owners without shrinking owner choices or hiding inactive ownership", async () => {
    const result = await read({ owner: "9" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: "33", ownerActive: false });
    expect(result.owners).toHaveLength(3);
  });
  it("matches donor, ID, task and owner case-insensitively without wildcard or SQL injection", async () => {
    expect((await read({ search: "TODAY donor" })).items.map(item => item.id)).toEqual(["31"]);
    expect((await read({ search: "131" })).items.map(item => item.id)).toEqual(["31"]);
    expect((await read({ search: "check in" })).total).toBe(2);
    expect((await read({ search: "blake" })).total).toBe(3);
    for (const search of ["%", "_", "' OR 1=1 --"]) expect((await read({ search })).total).toBe(0);
  });
  it("counts linked gift tasks across filters but never combines different donor identities", async () => {
    expect((await read()).items[0]).toMatchObject({ id: "1", linkedTaskCount: 2 });
    expect((await read({ status: "Done", owner: "8" })).items[0]).toMatchObject({ id: "30", linkedTaskCount: 2 });
    await execute(`UPDATE pending_actions SET source_gift_snapshot='{"constituentId":"different"}' WHERE id=30;`);
    expect((await read()).items[0].linkedTaskCount).toBe(1);
  });
  it("reflects completion, reopening and edits from the original tasks without copying or writing", async () => {
    const before = await execute("SELECT * FROM pending_actions ORDER BY id");
    await read(); expect(await execute("SELECT * FROM pending_actions ORDER BY id")).toEqual(before);
    await execute("UPDATE pending_actions SET status='Done', title='Call finished' WHERE id=1;");
    expect((await read({ status: "Done", owner: "7" })).items[0]).toMatchObject({ id: "1", title: "Call finished" });
    await execute("UPDATE pending_actions SET status='Open',due_date=NULL WHERE id=1;");
    expect((await read({ due: "undated", owner: "7" })).items[0]).toMatchObject({ id: "1", dueDate: null });
  });
  it("returns only the approved projection, with numeric gift values and no notes or emails", async () => {
    const item = (await read()).items[0];
    expect(item).toMatchObject({ donorName: "Donor 1", constituentId: "101", giftAmount: 2500, giftDate: "2026-09-20" });
    expect(item).not.toHaveProperty("details"); expect(item).not.toHaveProperty("source_gift_snapshot");
    expect(JSON.stringify(item)).not.toContain("Private note");
  });
});
