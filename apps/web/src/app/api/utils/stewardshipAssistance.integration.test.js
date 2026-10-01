// Disposable local PostgreSQL only. Never reads DATABASE_URL or calls NXT.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Papa from "papaparse";
import { createTaskAssistance, readTaskAssistance, updateAssistance, readAvailableStewardshipGifts } from "./stewardshipAssistance";
import schema from "./stewardshipAssistanceSchema";
import inventorySchema from "./stewardshipInventorySchema";
import giftRequestsSchema from "./stewardshipGiftRequestsSchema";
import receiptsSchema from "./stewardshipReceiptsSchema";
import historySchema from "./stewardshipHistorySchema";
import { readGiftReceipts, writeGiftReceipt } from "./stewardshipReceipts";
import { receiptFilters } from "@/utils/stewardshipReceipts";
import { writeGiftInventory } from "./stewardshipInventory";
import { advanceHistoryImport, readHistoryState } from "./stewardshipHistoryImport";
import { HISTORY_COLUMNS } from "@/utils/stewardshipHistoryImport";

const socket = process.env.GIFT_FOLLOWUP_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/gift-followup-pg\.[A-Za-z0-9]+$/.test(socket || "");
const literal = value => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
function execute(statement) {
  return new Promise((resolve, reject) => {
    const child = execFile("/opt/homebrew/opt/postgresql@18/bin/psql", ["-X", "--no-password", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "55448", "-d", "postgres"],
      { encoding: "utf8" }, (error, output) => {
        if (error) { reject(error); return; }
        resolve(output.trim() ? Papa.parse(output.trim(), { header: true }).data.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
          [key, value === "" ? null : ["request", "source_gift_snapshot", "stewardship_gift_item_snapshot", "gift_item_snapshot", "item_snapshot", "source_snapshot", "config", "job"].includes(key) ? JSON.parse(value) : key === "already_exists" ? value === "t" : value]))) : []);
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
    await inventorySchema(db); await giftRequestsSchema(db); await giftRequestsSchema(db);
    await receiptsSchema(db); await receiptsSchema(db);
    await historySchema(db); await historySchema(db);
  });
  beforeEach(async () => {
    await execute(`TRUNCATE users, pending_actions, data_change_requests, stewardship_request_events, stewardship_gift_items, stewardship_gift_item_events RESTART IDENTITY CASCADE;
      INSERT INTO users VALUES (2,'Admin','admin',TRUE),(7,'Officer','mgo',TRUE),(8,'Other Officer','mgo',TRUE);
      UPDATE stewardship_gift_import_state SET version=1,config='{}',job=NULL,lease=NULL,lease_until=NULL;
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
  const addGift = async (availability = "available") => (await writeGiftInventory(actor, { operation: "create", viewerKey: "test", requestId: "18d02230-07b2-4f12-8967-3e0b0147c900", name: "Test blanket", description: "Green blanket", location: "Private storage detail", availability }, db))[0];
  const historyColumns = Object.fromEntries(Object.keys(HISTORY_COLUMNS).map(key => [key, key]));
  const historyRow = ["100", "Sample Donor", "10", "00001-505-20", "Blanket", "Yes", "Yes", "2000-09-20"];
  const historyDeps = {
    connection: async () => ({ connected_at: "2026-01-01T00:00:00Z" }),
    create: async () => ({ id: "query-job" }),
    check: async () => ({ status: "Completed", row_count: 1, result_url: "https://example.test/result.csv" }),
    read: async () => ({ headers: Object.keys(historyColumns), rows: [historyRow] }),
    action: async ({ actionId }) => ({ id: actionId, constituent_id: "100", completed: true }),
  };
  const step = async (operation, payload = {}, deps = {}) => {
    const state = await readHistoryState(actor, db);
    return advanceHistoryImport(actor, { operation, version: state.version, ...payload }, "https://example.test", db, { ...historyDeps, ...deps });
  };
  const previewHistory = async (item, columns = historyColumns) => {
    await step("start", { queryId: "31053", confirmed: true });
    await execute("UPDATE stewardship_gift_import_state SET job=jsonb_set(job,'{nextCheckAt}','\"2000-01-01T00:00:00Z\"')");
    await step("check");
    return step("preview", { mapping: { columns, rules: [{ category: "Blanket", itemId: item.id, value: "Yes" }], completedValue: "Yes", confirmed: true } });
  };
  it("imports query history atomically, preserves stock, skips repeats and never invents an assistance request", async () => {
    const item = await addGift(); const before = await execute("SELECT * FROM stewardship_gift_items");
    const preview = await previewHistory(item);
    expect(preview.job.preview.rows[0].status).toBe("new");
    expect(await execute("SELECT * FROM stewardship_gift_receipts")).toHaveLength(0);
    expect((await step("commit", { confirmed: true })).job.inserted).toBe(1);
    const receipt = (await readGiftReceipts(actor, receiptFilters(new URLSearchParams()), db))[0];
    expect(receipt).toMatchObject({ source_kind: "nxt_history", request_id: null, source_snapshot: { queryId: "31053", actionId: "10" } });
    expect(await execute("SELECT * FROM stewardship_gift_items")).toEqual(before);
    expect(await execute("SELECT * FROM data_change_requests")).toHaveLength(0);
    expect(await readGiftReceipts(owner, receiptFilters(new URLSearchParams()), db)).toHaveLength(0);
    expect((await previewHistory(item)).job.preview.rows[0].status).toBe("existing");
    expect((await step("commit", { confirmed: true })).job.inserted).toBe(0);
    expect(await execute("SELECT * FROM stewardship_gift_receipts")).toHaveLength(1);
  });
  it("resolves system IDs from completed actions, checkpoints a pause and resumes without rechecking resolved actions", async () => {
    const item = await addGift();
    expect((await previewHistory(item, { ...historyColumns, constituentId: "" })).job.stage).toBe("resolving");
    let reads = 0;
    const paused = await step("resolve", {}, { action: async () => { reads++; throw Object.assign(new Error("throttle"), { httpStatus: 429 }); } });
    expect(paused.job.stage).toBe("resolving");
    expect(paused.job.error).toContain("paused");
    await step("resolve", {}, { action: async () => { reads++; } });
    expect(reads).toBe(1);
    await execute("UPDATE stewardship_gift_import_state SET job=jsonb_set(job,'{nextCheckAt}','\"2000-01-01T00:00:00Z\"')");
    const ready = await step("resolve");
    expect(ready.job.stage).toBe("preview"); expect(ready.job.error).toBeUndefined();
    expect(ready.job.preview.rows[0].constituentId).toBe("100");
    expect((await step("commit", { confirmed: true })).job.inserted).toBe(1);
  });
  it.each([
    { id: "wrong", constituent_id: "100", completed: true },
    { id: "10", constituent_id: "lookup", completed: true },
    { id: "10", constituent_id: "100", completed: false },
  ])("holds identity checks when the action is not authoritative: %o", async action => {
    await previewHistory(await addGift(), { ...historyColumns, constituentId: "" });
    expect((await step("resolve", {}, { action: async () => action })).job.error).toContain("does not confirm");
    expect(await execute("SELECT * FROM stewardship_gift_receipts")).toHaveLength(0);
  });
  it("requires a new preview after mapping failure, changed inventory or expired source", async () => {
    const item = await addGift(); await previewHistory(item);
    expect((await step("preview", { mapping: {} })).job.error).toBeTruthy();
    expect((await step("commit", { confirmed: true })).job.error).toContain("fresh preview");
    await previewHistory(item); await execute("UPDATE stewardship_gift_items SET version=version+1");
    expect((await step("commit", { confirmed: true })).job.error).toContain("changed");
    expect(await execute("SELECT * FROM stewardship_gift_receipts")).toHaveLength(0);
  });
  it("preserves imported corrections across repeated imports and archives", async () => {
    const item = await addGift(); await previewHistory(item); await step("commit", { confirmed: true });
    const [receipt] = await execute("SELECT id FROM stewardship_gift_receipts");
    expect(await writeGiftReceipt(actor, { operation: "void_imported", viewerKey: "2", id: receipt.id, reason: "Not received" }, db)).toBeTruthy();
    expect((await previewHistory(item)).job.preview.rows[0].status).toBe("corrected");
    expect((await step("commit", { confirmed: true })).job.inserted).toBe(0);
    expect(await readGiftReceipts(actor, receiptFilters(new URLSearchParams()), db)).toHaveLength(0);
    expect(await readGiftReceipts(actor, receiptFilters(new URLSearchParams("includeVoided=true")), db)).toHaveLength(1);
  });
  it("serializes competing commits and rechecks active staff role", async () => {
    await previewHistory(await addGift());
    const state = await readHistoryState(actor, db);
    const results = await Promise.allSettled([1,2].map(() => advanceHistoryImport(actor, { operation: "commit", confirmed: true, version: state.version }, "https://example.test", db, historyDeps)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await execute("SELECT * FROM stewardship_gift_receipts")).toHaveLength(1);
    await execute("UPDATE users SET role='mgo' WHERE id=2");
    await expect(advanceHistoryImport(actor, { operation: "start", version: 1, queryId: "31053", confirmed: true }, "https://example.test", db, historyDeps)).rejects.toThrow();
  });
  const choose = giftItemId => createTaskAssistance(context, 10, { ...draft, giftItemId }, db);
  it("offers only available active items without exposing staff-only storage details", async () => {
    const item = await addGift();
    expect(await readAvailableStewardshipGifts(db)).toEqual([{ id: item.id, name: "Test blanket", description: "Green blanket" }]);
    await writeGiftInventory(actor, { operation: "archive", viewerKey: "test", id: item.id, version: 1, reason: "Retired" }, db);
    expect(await readAvailableStewardshipGifts(db)).toEqual([]);
  });
  it.each(["unknown", "unavailable"])("does not offer or accept %s items", async availability => {
    const item = await addGift(availability);
    expect(await readAvailableStewardshipGifts(db)).toEqual([]);
    expect(await choose(item.id)).toBeNull();
    expect(await execute("SELECT * FROM data_change_requests")).toHaveLength(0);
  });
  it("records one immutable selection on the same request and audit, without changing inventory or the donor task", async () => {
    const item = await addGift();
    const before = await execute("SELECT * FROM stewardship_gift_items");
    const result = await choose(item.id);
    const task = await readTaskAssistance(context, 10, db);
    expect(task.request).toMatchObject({ id: result.id, stewardship_gift_item_id: item.id, stewardship_gift_item_snapshot: { id: item.id, name: "Test blanket", version: 1 } });
    expect(task.status).toBe("Open");
    expect(task.request.stewardship_gift_item_snapshot).not.toHaveProperty("location");
    expect((await execute("SELECT * FROM stewardship_request_events"))[0]).toMatchObject({ gift_item_id: item.id, gift_item_snapshot: { name: "Test blanket" } });
    expect(await execute("SELECT * FROM stewardship_gift_items")).toEqual(before);
  });
  it("preserves selected gift history across rename/archive and idempotent request retries", async () => {
    const item = await addGift(); const first = await choose(item.id);
    await writeGiftInventory(actor, { operation: "update", viewerKey: "test", id: item.id, version: 1, name: "Renamed blanket", description: "New description", location: "Elsewhere", availability: "available" }, db);
    await writeGiftInventory(actor, { operation: "archive", viewerKey: "test", id: item.id, version: 2, reason: "Retired" }, db);
    expect(await choose(item.id)).toMatchObject({ id: first.id, already_exists: true });
    const updated = await updateAssistance(actor, first.id, { version: 1, status: "In Progress", note: "Checking alternatives", giftItemId: item.id }, db);
    expect(updated.stewardship_gift_item_snapshot.name).toBe("Test blanket");
    expect((await readTaskAssistance(context, 10, db)).request.stewardship_gift_item_snapshot.name).toBe("Test blanket");
    expect((await execute("SELECT * FROM stewardship_request_events ORDER BY version"))[0].gift_item_snapshot.name).toBe("Test blanket");
  });
  it("lets staff choose or clear a gift, retaining each previous choice in audit", async () => {
    const item = await addGift(); const first = await create();
    const selected = await updateAssistance(actor, first.id, { version: 1, status: "In Progress", note: "Suggested blanket", giftItemId: item.id }, db);
    expect(selected.stewardship_gift_item_id).toBe(item.id);
    const cleared = await updateAssistance(actor, first.id, { version: 2, status: "In Progress", note: "Need another suggestion", giftItemId: null }, db);
    expect(cleared.stewardship_gift_item_id).toBeNull();
    expect(cleared.stewardship_gift_item_snapshot).toBeNull();
    expect((await execute("SELECT * FROM stewardship_request_events WHERE version=2"))[0].gift_item_snapshot.name).toBe("Test blanket");
  });
  it("blocks newly archived, nonexistent, non-gift and completed-request choices", async () => {
    const item = await addGift(); const first = await create();
    expect(await choose("999999")).toMatchObject({ id: first.id, already_exists: true });
    for (const giftItemId of ["999999", "0", true]) expect(await updateAssistance(actor, first.id, { version: 1, status: "In Progress", note: "No", giftItemId }, db)).toBeNull();
    await writeGiftInventory(actor, { operation: "archive", viewerKey: "test", id: item.id, version: 1, reason: "Retired" }, db);
    expect(await updateAssistance(actor, first.id, { version: 1, status: "In Progress", note: "No", giftItemId: item.id }, db)).toBeNull();
    await execute("UPDATE stewardship_gift_items SET archived_at=NULL; UPDATE data_change_requests SET status='Completed'");
    expect(await updateAssistance(actor, first.id, { version: 1, status: "In Progress", note: "Reopen first", giftItemId: item.id }, db)).toBeNull();
    await execute("UPDATE data_change_requests SET status='Open',request_type='Stewardship: Letter or note'");
    expect(await updateAssistance(actor, first.id, { version: 1, status: "In Progress", note: "Not a gift request", giftItemId: item.id }, db)).toBeNull();
  });
  it("serializes an archive with request creation so only a valid current choice can be attached", async () => {
    const item = await addGift();
    const [archived, request] = await Promise.all([
      writeGiftInventory(actor, { operation: "archive", viewerKey: "test", id: item.id, version: 1, reason: "Retired" }, db), choose(item.id),
    ]);
    expect(archived).toHaveLength(1);
    if (request) expect((await readTaskAssistance(context, 10, db)).request.stewardship_gift_item_snapshot.version).toBe(1);
    else expect(await execute("SELECT * FROM data_change_requests")).toHaveLength(0);
    expect(await readAvailableStewardshipGifts(db)).toHaveLength(0);
  });

  const filters = (query = "") => receiptFilters(new URLSearchParams(query));
  const receiptDraft = (requestId, itemId, changes = {}) => ({ operation: "record", viewerKey: "2", requestId, version: 1,
    itemId, token: "74512c41-89cd-41be-946e-10a056cae491", receivedOn: "2000-10-01", note: "Handed to recipient", confirmed: true, ...changes });
  const prepareReceipt = async () => { const item = await addGift(); const request = await choose(item.id); return receiptDraft(request.id, item.id); };
  it("records confirmed receipt with authoritative snapshots and an audit, without completing the request/task or changing inventory", async () => {
    const command = await prepareReceipt();
    const before = await execute("SELECT * FROM stewardship_gift_items");
    const received = await writeGiftReceipt(actor, command, db);
    expect(received).toMatchObject({ request_id: command.requestId, received_on: "2000-10-01", request_version: "2", recorded_by_name: "Admin", item_snapshot: { name: "Test blanket" } });
    const task = await readTaskAssistance(context, 10, db);
    expect(task.status).toBe("Open"); expect(task.request.status).toBe("Open");
    expect(task.request.stewardship_received_item).toMatchObject({ id: received.id, received_on: "2000-10-01" });
    expect(await execute("SELECT * FROM stewardship_gift_items")).toEqual(before);
    expect((await execute("SELECT * FROM stewardship_request_events ORDER BY version"))[1].note).toContain("Received item recorded");
    expect((await readGiftReceipts(actor, filters(), db))[0]).toMatchObject({ constituent_id: "100", constituent_name: "Sample Donor", owner_name: "Officer" });
  });
  it("makes repeated or simultaneous receipt submissions idempotent, rejecting a different token for the same request", async () => {
    const command = await prepareReceipt();
    const results = await Promise.all([writeGiftReceipt(actor, command, db), writeGiftReceipt(actor, command, db)]);
    expect(results[0].id).toBe(results[1].id);
    expect(await execute("SELECT * FROM stewardship_gift_receipts")).toHaveLength(1);
    expect(await execute("SELECT * FROM stewardship_request_events")).toHaveLength(2);
    expect(await writeGiftReceipt(actor, { ...command, version: 2, token: "74512c41-89cd-41be-946e-10a056cae492" }, db)).toBeNull();
    expect(await writeGiftReceipt(actor, { ...command, note: "Different payload" }, db)).toBeNull();
  });
  it("does not infer receipt from a completed request", async () => {
    const command = await prepareReceipt();
    await updateAssistance(actor, command.requestId, { version: 1, status: "Completed", note: "Assistance complete" }, db);
    expect(await readGiftReceipts(actor, filters(), db)).toHaveLength(0);
    expect(await writeGiftReceipt(actor, { ...command, version: 2 }, db)).not.toBeNull();
  });
  it.each([{ version: 9 }, { itemId: "99" }, { confirmed: false }, { receivedOn: "2200-01-01" }])("rejects invalid or stale receipt %o", async changes => {
    expect(await writeGiftReceipt(actor, { ...await prepareReceipt(), ...changes }, db)).toBeNull();
    expect(await readGiftReceipts(actor, filters(), db)).toHaveLength(0);
  });
  it.each(["UPDATE users SET role='mgo' WHERE id=2", "UPDATE users SET active=FALSE WHERE id=2", "UPDATE data_change_requests SET status='Declined'", "UPDATE data_change_requests SET source_pending_action_id=NULL"])("rechecks receipt authority/source: %s", async statement => {
    const command = await prepareReceipt(); await execute(statement);
    expect(await writeGiftReceipt(actor, command, db)).toBeNull();
    expect(await execute("SELECT * FROM stewardship_gift_receipts")).toHaveLength(0);
  });
  it("prevents changing a received gift, but preserves record identity through catalog archive/rename", async () => {
    const command = await prepareReceipt(); const received = await writeGiftReceipt(actor, command, db);
    expect(await updateAssistance(actor, command.requestId, { version: 2, status: "Open", note: "Clear", giftItemId: null }, db)).toBeNull();
    await writeGiftInventory(actor, { operation: "update", viewerKey: "test", id: command.itemId, version: 1, name: "New name", description: "", location: "", availability: "unavailable" }, db);
    await writeGiftInventory(actor, { operation: "archive", viewerKey: "test", id: command.itemId, version: 2, reason: "No longer offered" }, db);
    expect((await readGiftReceipts(actor, filters(`itemId=${command.itemId}`), db))[0]).toMatchObject({ id: received.id, item_snapshot: { name: "Test blanket" } });
  });
  it("allows recording a previously selected archived item as received, without offering it again", async () => {
    const command = await prepareReceipt();
    await writeGiftInventory(actor, { operation: "archive", viewerKey: "test", id: command.itemId, version: 1, reason: "Retired" }, db);
    expect(await writeGiftReceipt(actor, command, db)).not.toBeNull();
    expect(await readAvailableStewardshipGifts(db)).toHaveLength(0);
  });
  it("voids an incorrect receipt without deleting history and permits a corrected record", async () => {
    const command = await prepareReceipt(); const first = await writeGiftReceipt(actor, command, db);
    const correction = { operation: "void", viewerKey: "2", requestId: command.requestId, version: 2, id: first.id, reason: "Wrong date" };
    expect(await writeGiftReceipt(actor, correction, db)).toMatchObject({ id: first.id, request_version: "3" });
    expect(await writeGiftReceipt(actor, correction, db)).toBeNull();
    expect(await readGiftReceipts(actor, filters(), db)).toHaveLength(0);
    expect((await readGiftReceipts(actor, filters("includeVoided=true"), db))[0].void_reason).toBe("Wrong date");
    expect((await readTaskAssistance(context, 10, db)).request.stewardship_received_item).toBeNull();
    expect((await writeGiftReceipt(actor, command, db)).voided_at).not.toBeNull();
    const replacement = await writeGiftReceipt(actor, { ...command, version: 3, receivedOn: "2000-10-02", token: "74512c41-89cd-41be-946e-10a056cae492" }, db);
    expect(replacement.id).not.toBe(first.id);
    expect(await readGiftReceipts(actor, filters(), db)).toHaveLength(1);
    expect(await readGiftReceipts(actor, filters("includeVoided=true"), db)).toHaveLength(2);
    expect(await execute("SELECT * FROM stewardship_request_events")).toHaveLength(4);
  });
  it("scopes fundraiser reads, filters by item/constituent and treats search as literal text", async () => {
    const command = await prepareReceipt(); const item = await writeGiftReceipt(actor, command, db);
    expect(await readGiftReceipts(owner, filters(), db)).toHaveLength(1);
    expect(await readGiftReceipts({ ...owner, id: 8 }, filters("constituentId=100"), db)).toHaveLength(0);
    expect(await writeGiftReceipt(owner, { ...command, viewerKey: "7" }, db)).toBeNull();
    expect(await readGiftReceipts(actor, filters("search=blanket&constituentId=100"), db)).toHaveLength(1);
    for (const query of ["search=%25", "search=someone", "constituentId=101", "itemId=999", `before=${item.id}`]) expect(await readGiftReceipts(actor, filters(query), db)).toHaveLength(0);
  });
  it("serializes a receipt and selection change so only the saved selection is confirmed", async () => {
    const command = await prepareReceipt();
    const results = await Promise.all([writeGiftReceipt(actor, command, db), updateAssistance(actor, command.requestId, { version: 1, status: "Open", note: "Clear selection", giftItemId: null }, db)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const task = await readTaskAssistance(context, 10, db);
    if (results[0]) expect(task.request.stewardship_received_item).not.toBeNull();
    else expect(task.request.stewardship_gift_item_id).toBeNull();
  });
  it("rolls back receipt, request version, and audit together on an audit failure", async () => {
    const command = await prepareReceipt();
    await execute("ALTER TABLE stewardship_request_events ADD CONSTRAINT fail_receipt_audit CHECK (version < 2)");
    try { await expect(writeGiftReceipt(actor, command, db)).rejects.toThrow(); }
    finally { await execute("ALTER TABLE stewardship_request_events DROP CONSTRAINT fail_receipt_audit"); }
    expect(await execute("SELECT * FROM stewardship_gift_receipts")).toHaveLength(0);
    expect((await readTaskAssistance(context, 10, db)).request.request_version).toBe(1);
  });
});
