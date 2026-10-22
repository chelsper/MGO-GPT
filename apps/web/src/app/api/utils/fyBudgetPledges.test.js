// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Live SQL forbidden"); }) }));
import { continueBudgetPledgeRefresh, inspectBudgetPledgeQuery, parseBudgetPledges, publicBudgetPledgeState, startBudgetPledgeRefresh, verifyBudgetPledge } from "./fyBudgetPledges";
import { installmentDate, suggestPledgeColumns, unrestrictedExpectedGoal, validateBudgetPledgeSource } from "@/utils/fyBudgetPledges";
const fields = ["System Record ID", "Name", "Installment Amount Due", "Installment Date Due", "Fund Description"];
const source = { queryId: "31076", queryName: "FY27 Budget Relieving Payments Due - JUMGOGPT", confirmed: true, columns: suggestPledgeColumns(fields) };
const period = { label: "FY27", startsOn: "2026-07-01", endsOn: "2027-06-30" }, now = new Date("2026-10-19T15:00:00Z");
const metadata = { id: "31076", type: "Gift", name: source.queryName, select_fields: fields.map(name => ({ query_field: { selected_field_name: name } })) };
const csv = rows => `${fields.join(",")}\n${rows}`;
const parse = (rows, count) => parseBudgetPledges(csv(rows), source, count, period);
const gift = (id = "1") => ({ id, type: "Pledge", constituent_id: "500", amount: { value: 200 }, balance: { value: 40 }, gift_splits: [{ fund_id: "10" }] });
const schedule = { installments: [{ id: "11", date: "2026-08-01", amount: { value: 100 }, balance: 0 }, { id: "12", date: "2026-12-01", amount: { value: 100 }, balance: 40 }] };
const candidate = { id: "1", name: "Fictional Donor", fundName: "Fictional Fund", schedule: [{ date: "2026-08-01", amountCents: 10000 }, { date: "2026-12-01", amountCents: 10000 }] };
describe("installment source and identity", () => {
  it("maps the five verified query outputs without confusing scheduled amounts with balances", () => {
    expect(validateBudgetPledgeSource(source)).toEqual(source);
    expect(inspectBudgetPledgeQuery(metadata, source).suggested).toEqual(source.columns);
    expect(suggestPledgeColumns([...fields, "Gift System Record ID"]).giftId).toBe("");
    expect(suggestPledgeColumns(["Gift Amount", "Pledge Balance"]).amount).toBe("");
  });
  it.each([{ queryId: "31075" }, { confirmed: false }, { userId: 4 }, { columns: { ...source.columns, giftId: "Constituent System Record ID" } },
    { columns: { ...source.columns, amount: "Gift Amount" } }, { columns: { ...source.columns, amount: "Pledge Balance" } }, { columns: { ...source.columns, dueDate: "Gift Date" } }])("rejects unsafe mapping %j", changes => {
    expect(() => validateBudgetPledgeSource({ ...source, ...changes })).toThrow();
  });
  it("validates real calendar dates, including fiscal boundaries and leap days", () => {
    expect(installmentDate("7/1/2026")).toBe("2026-07-01"); expect(installmentDate("2028-02-29")).toBe("2028-02-29");
    for (const invalid of ["02/29/2026", "2026-02-30", "13/1/2026", "10/19/26", "", "2026-10-19T00:00:00Z"]) expect(installmentDate(invalid)).toBeNull();
  });
  it("deduplicates query rows without collapsing a pledge's different dates", () => {
    const result = parse("1,A,100,7/1/2026,Fund\n1,A,100,7/1/2026,Fund\n1,A,100,6/30/2027,Fund\n2,B,90,6/30/2026,Fund\n3,C,50,7/1/2027,Fund", 5);
    expect(result).toMatchObject({ rawRows: 5, duplicateRows: 1, outsidePeriodRows: 2 });
    expect(result.pledges).toHaveLength(1); expect(result.pledges[0].schedule).toHaveLength(2);
  });
  it("validates the complete result count and refuses malformed or conflicting rows", () => {
    expect(parse("", 0).pledges).toEqual([]);
    for (const rows of ["1,A,-5,10/19/2026,Fund", "1,A,5,bad,Fund", "A,A,5,10/19/2026,Fund", "1,A,5,10/19/2026,", "1,A,5,10/19/2026,Fund\n1,B,5,10/19/2026,Fund", "1,A,5,10/19/2026,Fund\n1,A,5,10/19/2026,Other Fund"])
      expect(() => parse(rows, rows.split("\n").length)).toThrow();
    expect(() => parse("1,A,5,10/19/2026,Fund", 2)).toThrow("count");
    expect(() => parse("", null)).toThrow("count");
    expect(() => parseBudgetPledges("ID,Amount\n1,5", source, 1, period)).toThrow("missing");
  });
  it("bounds source size rather than truncating", () => {
    const rows = Array.from({ length: 2001 }, (_, i) => `${i + 1},A,100,10/19/2026,Fund`).join("\n");
    expect(() => parse(rows, 2001)).toThrow("2,000");
  });
  it("uses actual unpaid balances and stable installment IDs, including equal-date equal-amount installments", () => {
    const rows = verifyBudgetPledge(candidate, gift(), schedule);
    expect(rows.map(row => row.outstandingCents)).toEqual([0, 4000]);
    const sameDay = { ...schedule, installments: schedule.installments.map(item => ({ ...item, date: "2026-12-01" })) };
    expect(verifyBudgetPledge({ ...candidate, schedule: [candidate.schedule[1]] }, gift(), sameDay)).toHaveLength(2);
  });
  it("refuses incomplete schedules, changed dates/amounts, multiple funds and unsupported pledge types", () => {
    for (const changed of [{ ...gift(), balance: { value: 50 } }, { ...gift(), gift_splits: [] }, { ...gift(), gift_splits: [{ fund_id: "1" }, { fund_id: "2" }] }, { ...gift(), type: "MatchingGiftPledge" }, { ...gift(), type: "Donation" }])
      expect(() => verifyBudgetPledge(candidate, changed, schedule)).toThrow();
    expect(() => verifyBudgetPledge(candidate, gift(), { installments: schedule.installments.slice(1) })).toThrow("full amount");
    expect(() => verifyBudgetPledge({ ...candidate, schedule: [{ date: "2026-12-02", amountCents: 10000 }] }, gift(), schedule)).toThrow("schedule changed");
    expect(() => verifyBudgetPledge(candidate, gift(), { installments: [schedule.installments[0], schedule.installments[0]] })).toThrow();
  });
});
function fixture(state) {
  let saved = state || { revision: "before", source: { queryId: "old" }, snapshot: { outstandingCents: 99, rows: [] } };
  const db = vi.fn(async (strings, ...args) => {
    if (strings.join("").startsWith("SELECT")) return [{ payload: structuredClone(saved) }];
    saved = JSON.parse(args[0]); return [{ report_key: "saved" }];
  });
  const transport = { metadata: vi.fn().mockResolvedValue(metadata), execute: vi.fn().mockResolvedValue({ body: new TextEncoder().encode(csv("1,Fictional Donor,100,2026-08-01,Fictional Fund\n1,Fictional Donor,100,2026-12-01,Fictional Fund")), contentType: "text/csv", queryJobRowCount: 2 }),
    pledge: vi.fn(async (id, section) => section === "gift" ? gift(id) : schedule) };
  return { db, transport, input: source, revision: saved.revision, user: { id: 3 }, now, saved: () => saved };
}
describe("resumable installment balances", () => {
  it("leaves the published source and totals intact until all balances pass, then replaces everything atomically", async () => {
    const f = fixture(), pending = await startBudgetPledgeRefresh(f);
    expect(pending.snapshot.outstandingCents).toBe(99); expect(pending.source.queryId).toBe("old");
    expect(f.transport.pledge).not.toHaveBeenCalled();
    const result = await continueBudgetPledgeRefresh({ ...f, revision: pending.revision });
    expect(result).toMatchObject({ source, job: null, snapshot: { outstandingCents: 4000, installmentCount: 1, settledCount: 1, pledgeCount: 1, period } });
    expect(result.snapshot.rows[0]).toMatchObject({ name: "Fictional Donor", fundName: "Fictional Fund", dueDate: "2026-12-01", outstandingCents: 4000 });
    expect(f.transport.pledge.mock.calls).toEqual([["1", "gift"], ["1", "installments"]]);
  });
  it("publishes a verified empty result as zero, not missing", async () => {
    const f = fixture(); f.transport.execute.mockResolvedValue({ body: new TextEncoder().encode(csv("")), contentType: "text/csv", queryJobRowCount: 0 });
    expect(await startBudgetPledgeRefresh(f)).toMatchObject({ job: null, snapshot: { outstandingCents: 0, installmentCount: 0 } });
  });
  it("does not execute the query or repeat verified pledges when resuming", async () => {
    const f = fixture(), pending = await startBudgetPledgeRefresh(f);
    pending.job.pledges.push({ ...candidate, id: "2" });
    const g = fixture(pending);
    const halfway = await continueBudgetPledgeRefresh({ ...g, maxPledges: 1 });
    expect(halfway.job.cursor).toBe(1); expect(halfway.snapshot.outstandingCents).toBe(99);
    await continueBudgetPledgeRefresh({ ...g, revision: halfway.revision });
    expect(g.transport.pledge.mock.calls.map(call => call[0])).toEqual(["1", "1", "2", "2"]);
    expect(g.transport.execute).not.toHaveBeenCalled(); expect(g.saved().snapshot.outstandingCents).toBe(8000);
  });
  it("honors NXT retry timing, preserves checkpoints, and never retries inside a request", async () => {
    const f = fixture(), pending = await startBudgetPledgeRefresh(f), g = fixture(pending);
    g.transport.pledge.mockRejectedValueOnce({ httpStatus: 429, retryAfterMs: 120000 });
    const paused = await continueBudgetPledgeRefresh(g);
    expect(paused.job).toMatchObject({ cursor: 0, status: "paused", resumeAfter: "2026-10-19T15:02:00.000Z" });
    expect(paused.snapshot).toEqual(pending.snapshot);
    expect(await continueBudgetPledgeRefresh({ ...g, revision: paused.revision })).toEqual(paused);
    expect(g.transport.pledge).toHaveBeenCalledTimes(1);
    const finished = await continueBudgetPledgeRefresh({ ...g, revision: paused.revision, now: new Date("2026-10-19T15:02:01Z") });
    expect(finished.job).toBeNull();
  });
  it("blocks invalid financial data without publishing partial results", async () => {
    const f = fixture(), pending = await startBudgetPledgeRefresh(f), g = fixture(pending);
    g.transport.pledge.mockResolvedValueOnce({ ...gift(), type: "MatchingGiftPledge" });
    const result = await continueBudgetPledgeRefresh(g);
    expect(result.job.status).toBe("blocked"); expect(result.job.error).toContain("matching-gift pledge");
    expect(result.snapshot).toEqual(pending.snapshot); expect(g.transport.pledge).toHaveBeenCalledTimes(1);
  });
  it("redacts provider failures and pauses instead of spinning", async () => {
    const f = fixture(), pending = await startBudgetPledgeRefresh(f), g = fixture(pending);
    g.transport.pledge.mockRejectedValue(new Error("SECRET token donor detail"));
    const result = await continueBudgetPledgeRefresh(g);
    expect(result.job).toMatchObject({ status: "paused", resumeAfter: null });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
  it("rejects stale versions, expired runs, fiscal rollover and changed query definitions", async () => {
    const f = fixture(); await expect(startBudgetPledgeRefresh({ ...f, revision: "stale" })).rejects.toMatchObject({ status: 409 });
    expect(f.transport.execute).not.toHaveBeenCalled();
    const pending = await startBudgetPledgeRefresh(f), g = fixture(pending);
    await expect(continueBudgetPledgeRefresh({ ...g, now: new Date("2026-10-19T17:00:00Z") })).rejects.toThrow("hour");
    await expect(continueBudgetPledgeRefresh({ ...g, now: new Date("2027-07-01T12:00:00Z") })).rejects.toThrow("fiscal year");
    expect(g.transport.pledge).not.toHaveBeenCalled();
    g.transport.metadata.mockResolvedValue({ ...metadata, name: "Changed" });
    const blocked = await continueBudgetPledgeRefresh(g); expect(blocked.job.status).toBe("blocked"); expect(blocked.snapshot.outstandingCents).toBe(99);
  });
  it("propagates database and CAS failures rather than saving a provider-pause state", async () => {
    const f = fixture(), pending = await startBudgetPledgeRefresh(f), g = fixture(pending);
    g.db.mockResolvedValueOnce([{ payload: pending }]).mockRejectedValueOnce(new Error("database failed"));
    await expect(continueBudgetPledgeRefresh(g)).rejects.toThrow("database failed"); expect(g.db).toHaveBeenCalledTimes(2);
  });
});
it("paginates private saved rows without returning provisional donors, audit IDs, or unbounded results", () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ key: String(i), name: i === 100 ? "Find Me" : "Fictional", fundName: "Fund", giftId: String(i), dueDate: "2026-12-01", outstandingCents: i === 100 ? 0 : 10 }));
  const state = { revision: "one", source, updatedBy: 4, snapshot: { period, outstandingCents: 1000, rows }, job: { status: "running", pledges: [candidate], rows: [candidate], cursor: 0 } };
  const page = publicBudgetPledgeState(state, { page: 2 });
  expect(page.rows).toHaveLength(50); expect(page.pages).toBe(3); expect(page).not.toHaveProperty("updatedBy");
  expect(page.job).not.toHaveProperty("pledges"); expect(page.snapshot).not.toHaveProperty("rows");
  const filtered = publicBudgetPledgeState(state, { page: 500, search: "find me" });
  expect(filtered).toMatchObject({ page: 1, matchedCount: 1, snapshot: { outstandingCents: 1000 } });
});
it("projects expected receipts separately, respecting missing data, fiscal scope, overflow, and surplus", () => {
  const config = { ...period, cents: 10000 }, cash = { activeFiscalYear: true, totalCents: 5000 };
  const snapshot = { period, outstandingCents: 8000 };
  expect(unrestrictedExpectedGoal(config, cash, snapshot)).toMatchObject({ totalCents: 13000, remainingCents: 0, aboveGoalCents: 3000 });
  expect(cash.totalCents).toBe(5000);
  for (const s of [null, { ...snapshot, period: { ...period, startsOn: "2025-07-01" } }, { ...snapshot, outstandingCents: -1 }]) expect(unrestrictedExpectedGoal(config, cash, s).totalCents).toBeNull();
  expect(unrestrictedExpectedGoal(config, cash, { ...snapshot, outstandingCents: 0 }).totalCents).toBe(5000);
  expect(unrestrictedExpectedGoal(config, { ...cash, activeFiscalYear: false }, snapshot).totalCents).toBeNull();
  expect(unrestrictedExpectedGoal(config, cash, { ...snapshot, outstandingCents: Number.MAX_SAFE_INTEGER }).totalCents).toBeNull();
});
