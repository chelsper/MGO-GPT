// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./reportRefresh", () => ({ getReportRefreshUser: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn(), getBlackbaudConnection: vi.fn() }));
vi.mock("./savedQueryExecution", () => ({ executeSavedQueryResults: vi.fn() }));
vi.mock("./givingSocietyConfigurations", () => ({ listGivingSocietyConfigurations: vi.fn() }));
import { publicLifetimeState, refreshLifetimeHistory, updateLifetimeGroup, updateLifetimeRecord } from "./lifetimeSocieties";
import { lifetimeRecordKey, lifetimeMilestoneKey } from "./lifetimeRecordDecisions";
import { lifetimeCoverage, lifetimeCsv, lifetimeVisibleRows } from "@/utils/lifetimeSocieties";
import { lifetimeQueryFixture, lifetimeRules, lifetimeCsvFixture } from "../../../../test/lifetimeQueryFixture";

async function fixture(rows = [{}], options = { identity: false }) {
  let state = { revision: null, snapshot: null };
  const db = vi.fn(async (strings, ...values) => {
    if (strings.join().startsWith("SELECT")) return [{ payload: state }];
    state = JSON.parse(values.find(value => typeof value === "string" && value.startsWith('{"')));
    return [{ report_key: "saved" }];
  });
  const transport = { metadata: vi.fn().mockResolvedValue(lifetimeQueryFixture(options)), execute: vi.fn() };
  const rules = vi.fn().mockResolvedValue(lifetimeRules), user = { id: 81 };
  async function refresh(next = rows) {
    transport.execute.mockResolvedValue({ body: new TextEncoder().encode(lifetimeCsvFixture(next, options)), contentType: "text/csv", queryJobRowCount: next.length });
    return refreshLifetimeHistory({ revision: state.revision, user, db, rules, transport });
  }
  const command = (operation, values) => updateLifetimeRecord({ revision: state.revision, user, db, rules, operation, ...values });
  await refresh();
  return { db, rules, transport, user, command, refresh, state: () => state, view: () => publicLifetimeState(state, lifetimeRules),
    group: (operation, groupId) => updateLifetimeGroup({ revision: state.revision, user, db, rules, operation, groupId }) };
}

it("archives only display records, retaining company gifts credited to an individual and their household across refresh and restore", async () => {
  const rows = [
    { id: "9", name: "Example Corporation", constituentType: "O", amount: "100000" },
    { id: "9", name: "Example Corporation", constituentType: "O", giftId: "102", amount: "500000" },
    { name: "Fictional Spouse A", credit: "Soft Credit Recipient", spouseId: "DEMO-2", maritalStatus: "Married" },
    { id: "2", name: "Fictional Spouse B", credit: "Soft Credit Recipient", spouseId: "DEMO-1", maritalStatus: "Married" },
  ];
  const f = await fixture(rows, { identity: false, spouses: true });
  const before = f.view().snapshot, company = before.rows.find(row => row.constituentType === "organization");
  await f.command("archive-record", { recordKey: company.recordKey });
  let snapshot = f.view().snapshot;
  expect(snapshot.rows).toHaveLength(before.rows.length);
  expect(snapshot.sharedGroups[0].rows[0]).toMatchObject({ totalCents: 10000000, date: "2020-01-01" });
  expect(lifetimeVisibleRows(snapshot)).toHaveLength(2);
  expect(lifetimeVisibleRows(snapshot).every(row => row.members)).toBe(true);
  expect(lifetimeCsv(lifetimeVisibleRows(snapshot))).not.toContain("Example Corporation");
  const own = snapshot.rows.find(row => row.name === "Fictional Spouse A" && row.societyKey === lifetimeRules[0].key);
  expect(own).toMatchObject({ totalCents: 10000000, date: "2020-01-01" });
  expect(lifetimeVisibleRows(snapshot, true, "archived")).toHaveLength(2);
  expect(lifetimeCsv(lifetimeVisibleRows(snapshot, true, "archived"))).toContain("Archived - credit retained");
  await f.refresh(); snapshot = f.view().snapshot;
  expect(snapshot.rows.find(row => row.recordKey === company.recordKey).archived).toBe(true);
  expect(snapshot.sharedGroups[0].rows).toEqual(before.sharedGroups[0].rows);
  await f.command("restore-record", { recordKey: company.recordKey });
  expect(lifetimeVisibleRows(f.view().snapshot)).toHaveLength(4);
});

it("does not let archived gift owners bypass conflict checks for kept soft-credit recipients", async () => {
  const rows = [{ id: "9", name: "Example Corporation", constituentType: "O" }, { credit: "Soft Credit Recipient" }];
  const f = await fixture(rows);
  await f.command("archive-record", { recordKey: f.view().snapshot.rows.find(row => row.constituentType === "organization").recordKey });
  await f.refresh([{ ...rows[0], amount: "500000" }, rows[1]]);
  const kept = lifetimeVisibleRows(f.view().snapshot)[0];
  expect(kept).toMatchObject({ date: null, totalCents: null, supportedCents: null, status: "review" });
  expect(kept.reasons.join()).toMatch(/conflict/);
});

it("confirms the server's saved date once, skips future crossing calculations and still updates history totals", async () => {
  const f = await fixture();
  const row = f.view().snapshot.rows[0];
  await f.command("confirm-date", { milestoneKey: row.milestoneKey });
  expect(f.view().snapshot.rows[0]).toMatchObject({ date: "2020-01-01", status: "confirmed" });
  const earlier = { giftId: "102", date: "1/1/2010", amount: "1000000" };
  await f.refresh([{}, earlier]);
  expect(f.state().snapshot.rows[0]).toMatchObject({ date: null, calculationSkipped: true, totalCents: 110000000 });
  expect(f.view().snapshot.rows[0]).toMatchObject({ date: "2020-01-01", status: "confirmed", totalCents: 110000000 });
  expect(f.view().snapshot.rows[1]).toMatchObject({ date: "2010-01-01", status: "provisional", calculationSkipped: false });
  expect(lifetimeCoverage(f.view().snapshot.rows)).toMatchObject({ confirmed: 1, provisional: 1, review: 0 });
  expect(lifetimeCsv(f.view().snapshot.rows)).toContain("Staff-confirmed entry date");
  await expect(f.command("confirm-date", { milestoneKey: row.milestoneKey })).rejects.toThrow(/supported provisional|already confirmed/);
  await f.command("reopen-date", { milestoneKey: row.milestoneKey });
  expect(f.view().snapshot.rows[0]).toMatchObject({ date: null, status: "review", reasons: [expect.stringContaining("Refresh gift history")] });
  await f.refresh([{}, earlier]);
  expect(f.view().snapshot.rows[0]).toMatchObject({ date: "2010-01-01", status: "provisional", calculationSkipped: false });
});

it("keeps confirmed dates but exposes new gift-quality issues and rule changes", async () => {
  const f = await fixture(); const key = f.view().snapshot.rows[0].milestoneKey;
  await f.command("confirm-date", { milestoneKey: key });
  await f.refresh([{}, { giftId: "102", type: "Pledge" }]);
  expect(f.view().snapshot.rows[0]).toMatchObject({ date: "2020-01-01", status: "confirmed", totalCents: null, reasons: [expect.stringContaining("complex gifts")] });
  f.rules.mockResolvedValue(lifetimeRules.map(s => ({ ...s, minimumAmount: s.minimumAmount + 100 })));
  await f.refresh();
  const next = publicLifetimeState(f.state(), await f.rules());
  expect(next.snapshot.rows[0]).toMatchObject({ date: "2020-01-01", status: "confirmed", confirmationNote: expect.stringContaining("rules have changed") });
});

it("retains off-query decisions and exposes restore/reopen without a current snapshot or NXT calls", async () => {
  const f = await fixture(); const row = f.view().snapshot.rows[0];
  await f.command("confirm-date", { milestoneKey: row.milestoneKey });
  await f.command("archive-record", { recordKey: row.recordKey });
  await f.refresh([]);
  expect(f.view().savedDecisions.archives[0].matched).toBe(false);
  expect(f.view().savedDecisions.milestones[0].matched).toBe(false);
  f.state().snapshot.ruleVersion = -1;
  f.transport.execute.mockClear(); f.transport.metadata.mockClear();
  await f.command("restore-record", { recordKey: row.recordKey });
  await f.command("reopen-date", { milestoneKey: row.milestoneKey });
  expect(f.view().savedDecisions).toEqual({ archives: [], milestones: [] });
  expect(f.transport.execute).not.toHaveBeenCalled(); expect(f.transport.metadata).not.toHaveBeenCalled();
  expect(f.state().recordDecisions.audit).toHaveLength(4);
  expect(JSON.stringify(f.view())).not.toMatch(/userId|updatedBy|sourceFingerprint|audit/);
});

it("retains dates and archives across harmless query-output changes, but never guesses after identity changes", async () => {
  const f = await fixture(); const row = f.view().snapshot.rows[0];
  await f.command("confirm-date", { milestoneKey: row.milestoneKey });
  await f.command("archive-record", { recordKey: row.recordKey });
  f.transport.metadata.mockResolvedValue({ ...lifetimeQueryFixture({ identity: false }), name: "Renamed query" });
  await f.refresh();
  expect(f.view().snapshot.rows[0]).toMatchObject({ status: "confirmed", archived: true });
  await f.refresh([{ name: "Changed Identity Details" }]);
  expect(f.view().snapshot.rows[0]).toMatchObject({ status: "provisional", archived: false });
  expect(f.view().savedDecisions.archives[0].matched).toBe(false);
  expect(f.view().savedDecisions.milestones[0].matched).toBe(false);
  expect(lifetimeRecordKey(row)).not.toBe(lifetimeRecordKey({ ...row, id: '["system","DEMO-1"]' }));
  expect(lifetimeRecordKey(row)).not.toBe(lifetimeRecordKey({ ...row, lookupId: "demo-1" }));
});

it("binds household dates to the same member identities, not changing gift evidence, and never transfers them to members", async () => {
  const rows = [{ spouseId: "DEMO-2", maritalStatus: "Married" },
    { id: "2", name: "Fictional Spouse", giftId: "102", spouseId: "DEMO-1", maritalStatus: "Married" }];
  const f = await fixture(rows, { identity: false, spouses: true });
  const group = f.view().snapshot.sharedGroups[0], row = group.rows[0];
  await f.command("confirm-date", { milestoneKey: row.milestoneKey });
  await f.refresh([...rows, { ...rows[0], giftId: "103", date: "1/1/2010" }]);
  expect(f.view().snapshot.sharedGroups[0].rows[0]).toMatchObject({ status: "confirmed", date: "2020-01-01", calculationSkipped: true });
  expect(f.view().snapshot.rows.every(row => row.status !== "confirmed")).toBe(true);
  await f.group("remove-group", f.view().snapshot.sharedGroups[0].id);
  expect(f.view().savedDecisions.milestones[0].matched).toBe(false);
  expect(lifetimeVisibleRows(f.view().snapshot).every(row => row.status !== "confirmed")).toBe(true);
  await f.refresh([{ ...rows[0], spouseId: "DEMO-3" }, { ...rows[1], id: "3" }]);
  expect(f.view().snapshot.sharedGroups[0].rows[0].status).toBe("provisional");
});

it("archiving spouses retains household credit while a member is active and restores each separately", async () => {
  const f = await fixture([{ spouseId: "DEMO-2", maritalStatus: "Married" },
    { id: "2", name: "Fictional Spouse", giftId: "102", spouseId: "DEMO-1", maritalStatus: "Married" }], { identity: false, spouses: true });
  const keys = [...new Set(f.view().snapshot.rows.map(row => row.recordKey))];
  await f.command("archive-record", { recordKey: keys[0] });
  expect(lifetimeVisibleRows(f.view().snapshot)[0]).toMatchObject({ totalCents: 20000000, archived: false });
  expect(lifetimeVisibleRows(f.view().snapshot)[0].members.some(member => member.archived)).toBe(true);
  expect(lifetimeVisibleRows(f.view().snapshot, false)).toHaveLength(2);
  await f.command("archive-record", { recordKey: keys[1] });
  expect(lifetimeVisibleRows(f.view().snapshot)).toHaveLength(0);
  expect(lifetimeVisibleRows(f.view().snapshot, true, "archived")).toHaveLength(4);
  await f.command("restore-record", { recordKey: keys[0] });
  expect(lifetimeVisibleRows(f.view().snapshot)[0].totalCents).toBe(20000000);
});

it("rejects unsupported, archived, invented and stale confirmations without changing saved data", async () => {
  const f = await fixture(); const [row, unsupported] = f.view().snapshot.rows;
  for (const key of [unsupported.milestoneKey, "0".repeat(64)]) await expect(f.command("confirm-date", { milestoneKey: key })).rejects.toThrow(/supported provisional/);
  await expect(f.command("archive-record", { recordKey: "0".repeat(64) })).rejects.toThrow(/Choose a constituent/);
  await expect(f.command("restore-record", { recordKey: row.recordKey })).rejects.toThrow(/no longer saved/);
  await expect(f.command("reopen-date", { milestoneKey: row.milestoneKey })).rejects.toThrow(/no longer saved/);
  await f.command("archive-record", { recordKey: row.recordKey });
  await expect(f.command("confirm-date", { milestoneKey: row.milestoneKey })).rejects.toThrow(/active record/);
  await expect(f.command("archive-record", { recordKey: row.recordKey })).rejects.toThrow(/already archived/);
  await expect(f.command("restore-record", { recordKey: row.recordKey, revision: "old" })).rejects.toThrow(/Saved history changed/);
});

it("fails closed when a concurrent refresh/decision wins the compare-and-swap", async () => {
  const f = await fixture(); const row = f.view().snapshot.rows[0];
  const db = vi.fn().mockResolvedValueOnce([{ payload: f.state() }]).mockResolvedValue([]);
  await expect(updateLifetimeRecord({ revision: f.state().revision, operation: "confirm-date", milestoneKey: row.milestoneKey,
    db, rules: f.rules, user: f.user })).rejects.toThrow(/Saved history changed/);
  expect(db.mock.calls[1][0].join()).toContain("payload->>'revision'");
  expect(f.state().recordDecisions).toBeUndefined();
});
