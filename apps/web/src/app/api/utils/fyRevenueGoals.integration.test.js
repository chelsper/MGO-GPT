// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Live SQL forbidden"); }) }));
import { publishRevenueState, readRevenueState } from "./fyRevenueGoals";
import { aggregateBudgetCashCsv, BUDGET_CASH_CACHE_KEY, readBudgetCashState, refreshBudgetCash } from "./fyBudgetCash";
import { defaultBudgetFundNames } from "@/utils/fyBudgetCash";
import { readBudgetPledgeState, startBudgetPledgeRefresh, continueBudgetPledgeRefresh, publicBudgetPledgeState, savePledgeAdjustment } from "./fyBudgetPledges";
import { readManualGoalConfig, saveManualGoalEntry } from "./fyRevenueAdjustments";
import { suggestPledgeColumns } from "@/utils/fyBudgetPledges";
const modulePath = process.env.CAMPAIGN_PGLITE_MODULE;
const suite = modulePath ? describe : describe.skip;
suite("FY revenue snapshot compare-and-swap in isolated PostgreSQL", () => {
  let pg, db;
  beforeAll(async () => {
    if (!modulePath?.startsWith("/tmp/") || !modulePath.endsWith("/dist/index.js")) throw new Error("Use isolated /tmp PGlite runtime");
    const { PGlite } = await import(/* @vite-ignore */ modulePath);
    pg = await PGlite.create();
    await pg.exec("CREATE TABLE report_snapshots_cache(report_key TEXT PRIMARY KEY,payload JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    db = async (strings, ...params) => (await pg.query(strings.reduce((s, part, i) => s + part + (i < params.length ? `$${i + 1}` : ""), ""), params)).rows;
  }, 30000);
  afterAll(async () => { await pg?.close(); });
  it("publishes initial totals once, then only replaces the exact previous version", async () => {
    expect(await readRevenueState(db)).toEqual({ revision: null, source: null, snapshot: null });
    const first = { revision: "first", source: { queryId: "31074" }, snapshot: { receivedCents: 10000 } };
    await publishRevenueState(null, first, db);
    expect(await readRevenueState(db)).toEqual(first);
    await expect(publishRevenueState(null, { revision: "late-first" }, db)).rejects.toMatchObject({ status: 409 });
    const second = { ...first, revision: "second", snapshot: { receivedCents: 20000 } };
    await publishRevenueState("first", second, db);
    await expect(publishRevenueState("first", { revision: "late-second" }, db)).rejects.toMatchObject({ status: 409 });
    expect(await readRevenueState(db)).toEqual(second);
  });
  it("isolates budget cash from re-investment totals and rejects a stale cash update", async () => {
    const original = await readRevenueState(db);
    expect(await readBudgetCashState(db)).toEqual({ revision: null, source: null, snapshot: null });
    const cash = { revision: "cash-first", source: { queryId: "31075" }, snapshot: { receivedCents: 7500 } };
    await publishRevenueState(null, cash, db, BUDGET_CASH_CACHE_KEY);
    expect(await readBudgetCashState(db)).toEqual(cash);
    await expect(publishRevenueState(null, { revision: "late-cash" }, db, BUDGET_CASH_CACHE_KEY)).rejects.toMatchObject({ status: 409 });
    expect(await readRevenueState(db)).toEqual(original);
    expect(await readBudgetCashState(db)).toEqual(cash);
  });
  it("persists corrected fund names and matching groups together across reloads", async () => {
    const originalRevenue = await readRevenueState(db);
    const source = { queryId: "31075", queryName: "Budget Cash", mode: "gift", confirmed: true, fundNames: defaultBudgetFundNames(),
      columns: { giftId: "System Record ID", fundId: "Fund System Record ID", fundName: "Fund Description", amount: "Gift Amount" } };
    const legacySource = { ...source, fundNames: { ...source.fundNames, parent: "JU Parent Fund", future_rising: "Future Rising Scholarship Fund" } };
    const content = `${Object.values(source.columns).join(",")}\n1,101,JU Parents Fund,100\n2,102,Future. Rising. Scholarship Fund,50`;
    const before = { revision: "legacy-names", source: legacySource, snapshot: aggregateBudgetCashCsv(content, legacySource, 2) };
    await publishRevenueState((await readBudgetCashState(db)).revision, before, db, BUDGET_CASH_CACHE_KEY);
    const transport = {
      metadata: async () => ({ id: "31075", name: source.queryName, type: "Gift", select_fields: Object.values(source.columns).map(name => ({ query_field: { selected_field_name: name } })) }),
      execute: async () => ({ body: new TextEncoder().encode(content), contentType: "text/csv", queryJobRowCount: 2 }),
    };
    const result = await refreshBudgetCash({ input: source, revision: before.revision, user: { id: 1 }, db, transport });
    const reloaded = await readBudgetCashState(db);
    expect(reloaded).toEqual(result);
    expect(reloaded.source.fundNames).toEqual(defaultBudgetFundNames());
    expect(reloaded.snapshot.receivedCents).toBe(before.snapshot.receivedCents);
    expect(reloaded.snapshot.groups.map(group => group.receivedCents)).toEqual([0, 10000, 0, 5000, 0, 0]);
    await expect(refreshBudgetCash({ input: legacySource, revision: before.revision, user: { id: 1 }, db, transport })).rejects.toMatchObject({ status: 409 });
    expect(await readBudgetCashState(db)).toEqual(result);
    expect(await readRevenueState(db)).toEqual(originalRevenue);
  });
  it("checkpoints pledge reads and publishes donor detail separately without changing either cash source", async () => {
    const revenueBefore = await readRevenueState(db), cashBefore = await readBudgetCashState(db);
    const fields = ["System Record ID", "Name", "Installment Amount Due", "Installment Date Due", "Fund Description"];
    const source = { queryId: "31076", queryName: "FY27 installments", columns: suggestPledgeColumns(fields), confirmed: true };
    const metadata = { id: "31076", name: source.queryName, type: "Gift", select_fields: fields.map(name => ({ query_field: { selected_field_name: name } })) };
    const content = `${fields.join(",")}\n1,Fictional Donor,100,12/01/2026,Fictional Fund\n2,Example Foundation,200,01/01/2027,Fictional Fund`;
    const transport = { metadata: async () => metadata, execute: async () => ({ body: new TextEncoder().encode(content), contentType: "text/csv", queryJobRowCount: 2 }),
      pledge: vi.fn(async (id, section) => section === "gift" ? { id, type: "Pledge", constituent_id: "5", amount: { value: Number(id) * 100 }, balance: { value: Number(id) * 50 }, gift_splits: [{ fund_id: "10" }] }
        : { installments: [{ id: "1", date: id === "1" ? "2026-12-01" : "2027-01-01", amount: { value: Number(id) * 100 }, balance: Number(id) * 50 }] }) };
    const args = { db, transport, user: { id: 1 }, now: new Date("2026-10-19T15:00:00Z") };
    const started = await startBudgetPledgeRefresh({ ...args, input: source, revision: null });
    expect(await readBudgetPledgeState(db)).toEqual(started); expect(started.source).toBeNull(); expect(started.snapshot).toBeNull();
    const checkpoint = await continueBudgetPledgeRefresh({ ...args, revision: started.revision, maxPledges: 1 });
    expect(checkpoint.job.cursor).toBe(1); expect(checkpoint.snapshot).toBeNull();
    await expect(continueBudgetPledgeRefresh({ ...args, revision: started.revision })).rejects.toMatchObject({ status: 409 });
    const completed = await continueBudgetPledgeRefresh({ ...args, revision: checkpoint.revision });
    expect(await readBudgetPledgeState(db)).toEqual(completed);
    expect(completed.job).toBeNull(); expect(completed.snapshot.outstandingCents).toBe(15000);
    expect(publicBudgetPledgeState(completed, { search: "Foundation" })).toMatchObject({ matchedCount: 1, snapshot: { outstandingCents: 15000 } });
    expect(transport.pledge.mock.calls.map(call => call[0])).toEqual(["1", "1", "2", "2"]);
    expect(await readRevenueState(db)).toEqual(revenueBefore); expect(await readBudgetCashState(db)).toEqual(cashBefore);
  });
  it("saves local installment reductions with CAS and never changes either cash source", async () => {
    const revenueBefore = await readRevenueState(db), cashBefore = await readBudgetCashState(db), before = await readBudgetPledgeState(db);
    const args = { db, user: { id: 7, name: "Test Admin" }, now: new Date("2026-10-19T15:00:00Z"), operation: "adjust", revision: before.revision,
      input: { key: before.snapshot.rows[0].key, amount: "25", reason: "Only half eligible" } };
    const result = await savePledgeAdjustment(args);
    expect((await readBudgetPledgeState(db)).adjustmentHistory).toHaveLength(1);
    expect(publicBudgetPledgeState(result).snapshot).toMatchObject({ outstandingCents: 15000, countableCents: 12500 });
    await expect(savePledgeAdjustment(args)).rejects.toMatchObject({ status: 409 });
    expect(await readRevenueState(db)).toEqual(revenueBefore); expect(await readBudgetCashState(db)).toEqual(cashBefore);
  });
  it("seeds manual contributions once, retains history, and prevents concurrent lost updates", async () => {
    const before = await readManualGoalConfig(db), revenueBefore = await readRevenueState(db), pledgeBefore = await readBudgetPledgeState(db);
    const args = { db, user: { id: 7, name: "Test Admin" }, now: new Date("2026-10-19T15:00:00Z"), operation: "save", revision: before.manual.revision,
      input: { key: null, label: "Fictional additional receipt", amount: "123.45", receivedDate: "2026-10-18", reason: "Verified separate", confirmed: true } };
    const result = await saveManualGoalEntry(args); expect(result.fixedContributions).toHaveLength(4);
    expect(await readManualGoalConfig(db)).toEqual(result);
    await expect(saveManualGoalEntry(args)).rejects.toMatchObject({ status: 409 });
    const archived = await saveManualGoalEntry({ ...args, operation: "archive", revision: result.manual.revision, input: { key: result.manual.entries[3].key, reason: "Now in cash query" } });
    expect(archived.fixedContributions).toHaveLength(3); expect(archived.manual.historyCount).toBe(2);
    expect(await readRevenueState(db)).toEqual(revenueBefore); expect(await readBudgetPledgeState(db)).toEqual(pledgeBefore);
  });
});
