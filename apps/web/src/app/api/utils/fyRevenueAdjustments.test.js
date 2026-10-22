// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Live database forbidden"); }) }));
import { adjustmentAmount, manualGoalConfig, saveManualGoalEntry } from "./fyRevenueAdjustments";
import { countableInstallment, publicBudgetPledgeState, savePledgeAdjustment, startBudgetPledgeRefresh, continueBudgetPledgeRefresh } from "./fyBudgetPledges";
import { unrestrictedExpectedGoal, suggestPledgeColumns } from "@/utils/fyBudgetPledges";
import { unrestrictedRevenueGoal } from "@/utils/unrestrictedRevenueGoal";
const now = new Date("2026-10-19T15:00:00Z"), user = { id: 7, name: "Test Administrator" };
const period = { label: "FY27", startsOn: "2026-07-01", endsOn: "2027-06-30" };
const cashInput = { key: null, label: "Example receipt A", amount: "125.01", receivedDate: "2026-10-18", reason: "Separate receipt verified", confirmed: true };
const row = { key: "1:11", giftId: "1", installmentId: "11", name: "Fictional Donor", fundName: "Example fund", dueDate: "2026-12-01", scheduledCents: 100000, outstandingCents: 100000 };
function fixture(state = { revision: null }) {
  let stored = structuredClone(state);
  const db = vi.fn(async (strings, ...args) => {
    if (strings[0].startsWith("SELECT")) return [{ payload: structuredClone(stored) }];
    stored = JSON.parse(strings[0].startsWith("INSERT") ? args[1] : args[0]); return [{ report_key: "saved" }];
  });
  return { db, user, now, revision: stored.revision, state: () => stored };
}
it("parses cents exactly, including zero, without accepting exponent, negative or excessive precision", () => {
  expect(adjustmentAmount("125.01")).toBe(12501); expect(adjustmentAmount("0")).toBe(0); expect(adjustmentAmount("1.2")).toBe(120);
  for (const value of [1, "-1", "1e3", "1.001", "", "Infinity", "0x10", "99999999999999", "$1,000"]) expect(() => adjustmentAmount(value)).toThrow();
});
it("preserves the three original cash entries and adds a new receipt exactly once", async () => {
  const f = fixture(); const initial = manualGoalConfig(f.state());
  expect(initial.fixedContributions.reduce((sum, item) => sum + item.cents, 0)).toBe(303000000); expect(f.db).not.toHaveBeenCalled();
  const goal = await saveManualGoalEntry({ ...f, operation: "save", input: cashInput });
  expect(goal.fixedContributions).toHaveLength(4); expect(goal.manual.historyCount).toBe(1);
  expect(goal.manual.history[0]).toMatchObject({ userId: 7, by: user.name, reason: cashInput.reason, before: null });
  expect(manualGoalConfig(f.state())).toEqual(goal);
  const rollup = unrestrictedRevenueGoal(goal, { receivedCents: 10000 }, { receivedCents: 20000 }, now);
  expect(rollup.totalCents).toBe(303033501);
  await expect(saveManualGoalEntry({ ...f, operation: "save", input: cashInput })).rejects.toMatchObject({ status: 409 });
});
it("edits, archives, and restores the same original entry with retained history", async () => {
  const f = fixture();
  let goal = await saveManualGoalEntry({ ...f, operation: "save", input: { ...cashInput, key: "lovett", label: "Lovett Trust", amount: "240000", receivedDate: "" } });
  expect(goal.fixedContributions.find(item => item.key === "lovett").cents).toBe(24000000);
  goal = await saveManualGoalEntry({ ...f, revision: goal.manual.revision, operation: "archive", input: { key: "lovett", reason: "Now included in source", confirmed: false } });
  expect(goal.fixedContributions.some(item => item.key === "lovett")).toBe(false);
  expect(goal.manual.entries.find(item => item.key === "lovett").archived).toBe(true);
  goal = await saveManualGoalEntry({ ...f, revision: goal.manual.revision, operation: "restore", input: { key: "lovett", reason: "Receipt remains separate", confirmed: true } });
  expect(goal.fixedContributions.find(item => item.key === "lovett").cents).toBe(24000000); expect(goal.manual.historyCount).toBe(3);
});
it.each([{ confirmed: false }, { label: " " }, { label: "PARMELEE ESTATE" }, { amount: "0" }, { amount: "-1" },
  { receivedDate: "2025-10-18" }, { receivedDate: "2026-10-20" }, { receivedDate: "" }, { reason: "" }, { userId: 123 }, { key: "missing" }])("rejects unsafe cash entry %j without writing", async changes => {
  const f = fixture(); await expect(saveManualGoalEntry({ ...f, operation: "save", input: { ...cashInput, ...changes } })).rejects.toThrow();
  expect(f.db).toHaveBeenCalledTimes(1);
});
it("refuses wrong-fiscal-year entries, overflow and out-of-date goal configuration", async () => {
  expect(() => manualGoalConfig({ revision: null, period: "2025-07-01", entries: [] })).toThrow("another fiscal year");
  expect(() => manualGoalConfig({ period: period.startsOn, entries: [{ cents: Number.MAX_SAFE_INTEGER }, { cents: 1 }] })).toThrow("range");
  const f = fixture(); await expect(saveManualGoalEntry({ ...f, now: new Date("2027-07-02"), operation: "save", input: cashInput })).rejects.toThrow("fiscal-year goal");
});
it("stores a reduction separately, preserves payments conservatively, and permits a reset", async () => {
  const f = fixture({ revision: "initial", snapshot: { period, rows: [row], outstandingCents: 100000 } });
  const state = await savePledgeAdjustment({ ...f, operation: "adjust", input: { key: row.key, amount: "600", reason: "Only part is eligible" } });
  expect(state.snapshot.outstandingCents).toBe(100000); expect(state.adjustmentHistory).toHaveLength(1);
  let view = publicBudgetPledgeState(state); expect(view.snapshot.countableCents).toBe(60000); expect(view.rows[0].adjustment.excludedCents).toBe(40000);
  const saved = state.adjustments[`${period.startsOn}:${row.key}`];
  expect(countableInstallment({ ...row, outstandingCents: 80000 }, saved).countableCents).toBe(40000);
  expect(countableInstallment({ ...row, outstandingCents: 30000 }, saved).countableCents).toBe(0);
  expect(countableInstallment({ ...row, outstandingCents: 150000 }, saved).countableCents).toBe(60000);
  expect(unrestrictedExpectedGoal({ ...period, cents: 1000000 }, { activeFiscalYear: true, totalCents: 10000 }, view.snapshot).totalCents).toBe(70000);
  const restored = await savePledgeAdjustment({ ...f, revision: state.revision, operation: "reset-adjustment", input: { key: row.key, reason: "Full amount now eligible" } });
  view = publicBudgetPledgeState(restored); expect(view.snapshot.countableCents).toBe(100000); expect(restored.adjustmentHistory).toHaveLength(2);
});
it("requires review when the installment's underlying fund, schedule or date changes", () => {
  const adjustment = { approvedCents: 60000, excludedCents: 40000, dueDate: row.dueDate, fundName: row.fundName, scheduledCents: row.scheduledCents };
  for (const changes of [{ fundName: "Another fund" }, { dueDate: "2026-12-02" }, { scheduledCents: 110000 }])
    expect(countableInstallment({ ...row, ...changes }, adjustment)).toMatchObject({ countableCents: 0, adjustment: { needsReview: true } });
});
it.each([{ amount: "1000.01" }, { amount: "-1" }, { reason: "" }, { key: "missing" }, { userId: 1 }])("rejects invalid adjustment %j", async changes => {
  const f = fixture({ revision: "initial", snapshot: { period, rows: [row], outstandingCents: 100000 } });
  await expect(savePledgeAdjustment({ ...f, operation: "adjust", input: { key: row.key, amount: "600", reason: "Partial", ...changes } })).rejects.toThrow();
  expect(f.db).toHaveBeenCalledTimes(1);
});
it("rejects adjustments during refreshes and after fiscal rollover", async () => {
  const f = fixture({ revision: "initial", snapshot: { period, rows: [row] }, job: { status: "paused" } });
  await expect(savePledgeAdjustment({ ...f, operation: "adjust", input: { key: row.key, amount: "0", reason: "None" } })).rejects.toThrow("Finish");
  const g = fixture({ revision: "initial", snapshot: { period, rows: [row] } });
  await expect(savePledgeAdjustment({ ...g, now: new Date("2027-07-02"), operation: "adjust", input: { key: row.key, amount: "0", reason: "None" } })).rejects.toThrow("current fiscal year");
});
it("keeps adjustments and audit history across an actual refresh and uses filtered totals globally", async () => {
  const f = fixture({ revision: "initial", snapshot: { period, rows: [row], outstandingCents: 100000 } });
  const saved = await savePledgeAdjustment({ ...f, operation: "adjust", input: { key: row.key, amount: "600", reason: "Partial" } });
  const fields = ["System Record ID", "Name", "Installment Amount Due", "Installment Date Due", "Fund Description"];
  const source = { queryId: "31076", queryName: "Pledges", columns: suggestPledgeColumns(fields), confirmed: true };
  const transport = { metadata: async () => ({ id: "31076", name: "Pledges", type: "Gift", select_fields: fields.map(name => ({ query_field: { selected_field_name: name } })) }),
    execute: async () => ({ body: new TextEncoder().encode(`${fields.join(",")}\n1,Fictional Donor,1000,12/01/2026,Example fund`), contentType: "text/csv", queryJobRowCount: 1 }),
    pledge: async (id, section) => section === "gift" ? { id, type: "Pledge", constituent_id: "5", amount: { value: 1000 }, balance: { value: 800 }, gift_splits: [{ fund_id: "10" }] }
      : { installments: [{ id: "11", date: "2026-12-01", amount: { value: 1000 }, balance: 800 }] } };
  const pending = await startBudgetPledgeRefresh({ ...f, revision: saved.revision, input: source, transport });
  const result = await continueBudgetPledgeRefresh({ ...f, revision: pending.revision, transport });
  expect(result.adjustmentHistory).toEqual(saved.adjustmentHistory); expect(result.adjustments).toEqual(saved.adjustments);
  const view = publicBudgetPledgeState(result, { search: "no match" });
  expect(view.rows).toEqual([]); expect(view.snapshot).toMatchObject({ outstandingCents: 80000, countableCents: 40000, adjustedCount: 1 });
});
