// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Live SQL forbidden"); }) }));
import schema from "./campaignPrioritiesSchema";
import { campaignRead, editCampaign, saveCampaignConfig } from "./campaignPriorityStore";
import { advanceCampaignRefresh, stageCampaignRows } from "./campaignPriorityRefresh";
import { campaignHash, campaignBaseHash } from "./campaignPriorityQuery";
import { BlackbaudQuotaExceededError } from "./blackbaud";
import { campaignRow } from "@/utils/campaignPriorities";
import { LEGACY_CAMPAIGN_IMPORT_ERROR } from "./campaignPriorityDiagnostics";

// Optional local PostgreSQL WASM runtime, never a DATABASE_URL or production connection.
const modulePath = process.env.CAMPAIGN_PGLITE_MODULE;
const suite = modulePath ? describe : describe.skip;
suite("campaign SQL integration in isolated PostgreSQL", () => {
  let pg, db, run;
  const actor = { id: 1, role: "admin", name: "Test Admin" };
  const config = { queryId: "27460", queryName: "Campaign", mode: "split", columns: { giftId: "Gift", splitId: "Split", fundId: "Fund System Record ID", fundName: "Fund", amount: "Amount" }, sourceKey: "source-a", connectionKey: "connection-a" };
  const metadata = { id: "27460", name: "Campaign", type: "Gift", select_fields: Object.values(config.columns).map(name => ({ query_field: { selected_field_name: name } })) };
  const giftConfig = { ...config, mode: "gift", columns: { ...config.columns, splitId: "" } };
  function wholeGift(id, fund, cents) {
    const value = { itemKey: id, giftId: id, splitId: null, fundId: fund, fundName: `Fund ${fund}`, amountCents: cents, donorName: "", giftDate: "2026-10-07", giftType: "One-Time Gift" };
    return { ...value, rowHash: campaignHash(value), baseHash: campaignHash([id,null,fund,cents]) };
  }
  const twoSplitGifts = () => [wholeGift("11","4",10000),wholeGift("11","5",10000),wholeGift("12","5",5300),wholeGift("12","8",5300)];
  function giftTransport(rows = twoSplitGifts()) {
    const t = transport(rows);
    t.gift = vi.fn(async id => ({ id, amount: { value: id === "11" ? 100 : 53 }, gift_splits: id === "11" ? [
      { id: "71",fund_id: "4",amount: { value: 50 } }, { id: "72",fund_id: "5",amount: { value: 50 } },
    ] : [ { id: "81",fund_id: "5",amount: { value: 26.5 } }, { id: "82",fund_id: "8",amount: { value: 26.5 } } ] }));
    return t;
  }
  function row(split, amount = 6000, fund = "4") {
    const value = { itemKey: `10:${split}`, giftId: "10", splitId: String(split), fundId: fund, fundName: `Fund ${fund}`, amountCents: amount, donorName: "Fictional Donor", giftDate: "2026-10-06", giftType: "Gift" };
    return { ...value, rowHash: campaignHash(value), baseHash: campaignHash([value.giftId,value.splitId,value.fundId,value.amountCents]) };
  }
  async function stage(rows, runId = run) {
    const lease = randomUUID();
    await db`UPDATE campaign_priority_state SET lease=${lease}::uuid,lease_until=NOW()+INTERVAL '5 minutes' WHERE id=1`;
    await stageCampaignRows({ lease, job: { runId } }, rows, db);
    await db`UPDATE campaign_priority_state SET lease=NULL,lease_until=NULL WHERE id=1`;
  }
  const read = () => campaignRead(new URLSearchParams(), true, db);
  const edit = async (operation, input, version) => editCampaign(actor, version ?? (await read()).version, run, operation, input, db);
  const transport = (rows = [row(1), row(2,4000,"5")]) => ({ connectionKey: config.connectionKey, metadata: vi.fn(async () => metadata), create: vi.fn(async () => ({ id: "job-1" })), poll: vi.fn(async () => ({ id: "job-1", status: "Completed", row_count: rows.length, sas_uri: "https://nsa-pusa01.app.blackbaud.net/fixture.csv" })), read: vi.fn(async (_url,_config,_count,save) => { await save(rows); return { rawRows: rows.length }; }) });
  async function start(t) {
    await advanceCampaignRefresh(actor, (await read()).version, "start", t, db);
    await db`UPDATE campaign_priority_state SET job=jsonb_set(job,'{nextCheckAt}','"2000-01-01T00:00:00Z"') WHERE id=1`;
  }
  const financialConfig = { ...config, columns: { ...config.columns, writeOff: "Split Write-off Amount", pledgeBalance: "Split Pledge Balance" } };
  function financialRow(value, writeOffCents, pledgeBalanceCents) {
    const { rowHash: _rowHash, baseHash: _baseHash, ...original } = value;
    const financial = { ...original, writeOffCents, pledgeBalanceCents };
    return { ...financial, rowHash: campaignHash(financial), baseHash: campaignBaseHash(financial) };
  }
  async function publishFinancial(rows, source = financialConfig, t = transport(rows)) {
    t.metadata.mockResolvedValue({ ...metadata, select_fields: Object.values(source.columns).filter(Boolean).map(name => ({ query_field: { selected_field_name: name } })) });
    await saveCampaignConfig(actor, (await read()).version, source, db);
    await start(t);
    await advanceCampaignRefresh(actor, (await read()).version, "continue", t, db);
    if ((await read()).job.stage === "resolving") await advanceCampaignRefresh(actor, (await read()).version, "continue", t, db);
    const saved = await read();
    if (saved.job.stage === "complete") run = saved.runId;
    return saved;
  }
  beforeAll(async () => {
    if (!modulePath?.startsWith("/tmp/") || !modulePath.endsWith("/dist/index.js")) throw new Error("Use an isolated /tmp PGlite runtime");
    const { PGlite } = await import(/* @vite-ignore */ modulePath);
    pg = await PGlite.create();
    db = (strings, ...values) => {
      const text = strings.reduce((s, part, i) => s+part+(i < values.length ? `$${i+1}` : ""), "");
      const params = values.map(value => value === undefined ? null : value);
      const spec = { text, params };
      return { spec, then(resolve,reject) { return pg.query(text,params).then(result => result.rows).then(resolve,reject); }, catch(reject) { return this.then(undefined,reject); } };
    };
    db.transaction = statements => pg.transaction(async tx => {
      const results = [];
      for (const { spec } of statements) results.push((await tx.query(spec.text,spec.params)).rows);
      return results;
    });
    await pg.exec("CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,active BOOLEAN); INSERT INTO users VALUES(1,'admin',true)");
    await schema(db); await schema(db);
  }, 30000);
  afterAll(async () => { await pg?.close(); });
  beforeEach(async () => {
    await pg.exec("TRUNCATE campaign_priority_rows,campaign_priority_runs,campaign_priority_overrides,campaign_priority_funds,campaign_priority_events; UPDATE users SET role='admin',active=true WHERE id=1");
    run = randomUUID();
    await db`UPDATE campaign_priority_state SET version=1,config=${JSON.stringify(config)}::jsonb,published_run=${run}::uuid,job=NULL,lease=NULL,lease_until=NULL WHERE id=1`;
    await db`INSERT INTO campaign_priority_runs(id,source_key,query_id,config,created_by,status,raw_rows,unique_rows,completed_at) VALUES(${run}::uuid,'source-a','27460',${JSON.stringify(config)}::jsonb,1,'complete',2,2,NOW())`;
    await stage([row(1), row(2,4000,"5")]);
  });
  it("deduplicates by allocation and reconciles fund moves, overrides, zero, and revert", async () => {
    await stage([row(1),row(1)]);
    expect((await read()).total).toBe(2); expect((await read()).effectiveCents).toBe(10000);
    await edit("funds", { fundIds: ["4","5"], priority: "scholarships" });
    expect((await read()).priorities).toMatchObject([{ priority: "scholarships", effective_cents: 10000 }]);
    await edit("override", { itemKey: "10:1", priority: "campus-planning", amount: "50", reason: "Campaign recognition" });
    const saved = await read();
    expect(saved.originalCents).toBe(10000); expect(saved.effectiveCents).toBe(9000);
    expect(saved.rows.find(r => r.item_key === "10:2").effective_cents).toBe(4000);
    await edit("override", { itemKey: "10:1", priority: null, amount: "0", reason: "Not countable" });
    expect((await read()).effectiveCents).toBe(4000);
    await edit("override", { itemKey: "10:1", revert: true, reason: "Restore original" });
    expect((await read()).effectiveCents).toBe(10000);
    expect((await db`SELECT * FROM campaign_priority_events`)).toHaveLength(4);
  });
  it("reconciles write-offs, committed and received across funds, priorities and original-gift fiscal years", async () => {
    await edit("funds", { fundIds: ["4"], priority: "scholarships" });
    const a = financialRow({ ...row(1,600000), giftDate: "2026-06-30" }, 100000, 200000);
    const b = financialRow(row(2,400000,"5"), 0, 50000);
    const saved = await publishFinancial([a,a,b]);
    expect(saved.job.stage).toBe("complete");
    expect(saved.uniqueRows).toBe(2); expect(saved.rawRows).toBe(3);
    expect(saved).toMatchObject({ originalCents: 1000000, writeOffCents: 100000, netCents: 900000, effectiveCents: 900000, pledgeBalanceCents: 250000, sourceChanged: false });
    expect(saved.segments.committed).toMatchObject({ status: "ready", cents: 900000 });
    expect(saved.segments.received).toMatchObject({ status: "ready", cents: 650000 });
    expect(saved.priorities.find(p => p.priority === "scholarships")).toMatchObject({ effective_cents: 500000, received_cents: 300000 });
    expect(saved.funds.find(f => f.fund_id === "4")).toMatchObject({ fund_priority: "scholarships", original_cents: 600000, write_off_cents: 100000, pledge_balance_cents: 200000, received_cents: 300000 });
    expect(saved.segments.fiscalYears).toMatchObject([
      { fiscal_year: 2027, effective_cents: 400000, received_cents: 350000 },
      { fiscal_year: 2026, effective_cents: 500000, received_cents: 300000 },
    ]);
    const filtered = await campaignRead(new URLSearchParams({ fund: "4" }), false, db);
    expect(filtered.rows).toHaveLength(1); expect(filtered.segments).toEqual(saved.segments);
    expect(filtered.rows[0]).toMatchObject({ amount_cents: 600000, net_cents: 500000, effective_cents: 500000, received_cents: 300000 });
  });
  it("preserves assignments but blocks edits against an older snapshot until financial mapping refresh completes", async () => {
    await edit("funds", { fundIds: ["4"], priority: "healthcare-business" });
    await saveCampaignConfig(actor, (await read()).version, financialConfig, db);
    const saved = await read();
    expect(saved.sourceChanged).toBe(true);
    expect(saved.effectiveCents).toBe(10000); expect(saved.segments.committed.status).toBe("source_needed");
    await expect(edit("funds", { fundIds: ["4"], priority: "scholarships" })).rejects.toMatchObject({ status: 409 });
    expect((await read()).funds.find(f => f.fund_id === "4").fund_priority).toBe("healthcare-business");
    const refreshed = await publishFinancial([financialRow(row(1),0,1000),financialRow(row(2,4000,"5"),0,0)]);
    expect(refreshed.sourceChanged).toBe(false);
    expect(refreshed.funds.find(f => f.fund_id === "4").fund_priority).toBe("healthcare-business");
    await expect(edit("funds", { fundIds: ["4"], priority: "scholarships" })).resolves.toBeTypeOf("number");
  });
  it("keeps legacy and partial snapshots unavailable instead of assuming missing write-offs or balances are zero", async () => {
    expect((await read()).writeOffCents).toBeNull();
    expect((await read()).segments.received.cents).toBeNull();
    const partial = await publishFinancial([financialRow(row(1),0,null)], { ...financialConfig, columns: { ...financialConfig.columns, pledgeBalance: "" } });
    expect(partial.segments.committed).toMatchObject({ status: "ready", cents: 6000 });
    expect(partial.segments.received).toMatchObject({ status: "source_needed", cents: null });
    expect(partial.rows[0].received_cents).toBeNull();
    const zero = await publishFinancial([financialRow(row(1),0,0)]);
    expect(zero.segments.received).toMatchObject({ status: "ready", cents: 6000 });
    const empty = await publishFinancial([]);
    expect(empty.segments.committed).toMatchObject({ status: "ready", cents: 0 });
    expect(empty.segments.received).toMatchObject({ status: "ready", cents: 0 });
  });
  it("keeps approved net overrides across balance changes but requires review after a new write-off", async () => {
    await edit("override", { itemKey: "10:1", priority: "scholarships", amount: "50", reason: "Net campaign recognition" });
    let saved = await publishFinancial([financialRow(row(1),0,1000)]);
    expect(saved.rows[0]).toMatchObject({ effective_cents: 5000, received_cents: 4000, needs_review: false });
    saved = await publishFinancial([financialRow(row(1),1000,1000)]);
    expect(saved.rows[0]).toMatchObject({ net_cents: 5000, effective_cents: 5000, received_cents: 4000, needs_review: true });
    await edit("override", { itemKey: "10:1", priority: "scholarships", amount: "45", reason: "Reviewed net amount" });
    expect((await read()).rows[0]).toMatchObject({ effective_cents: 4500, received_cents: 3500, needs_review: false });
    saved = await publishFinancial([financialRow(row(1),1000,500)]);
    expect(saved.rows[0]).toMatchObject({ effective_cents: 4500, received_cents: 4000, needs_review: false });
    await edit("override", { itemKey: "10:1", revert: true, reason: "Use net NXT value" });
    expect((await read()).rows[0]).toMatchObject({ effective_cents: 5000, received_cents: 4500, has_override: false });
  });
  it("leaves the published snapshot intact when duplicate rows disagree on deductions", async () => {
    const priorRun = run;
    const saved = await publishFinancial([financialRow(row(1),0,1000),financialRow(row(1),0,2000)]);
    expect(saved.job.stage).toBe("failed"); expect(saved.job.error).toContain("conflicting");
    expect(saved.runId).toBe(priorRun); expect(saved.effectiveCents).toBe(10000);
    expect(saved.segments.received.status).toBe("source_needed");
  });
  it("allocates whole-gift deductions once, with exact cents, during verified split publication", async () => {
    const rows = twoSplitGifts().map(value => financialRow(value, value.giftId === "11" ? 1001 : 0, value.giftId === "11" ? 3001 : 0));
    const source = { ...giftConfig, columns: { ...giftConfig.columns, writeOff: "Gift Write-off Amount", pledgeBalance: "Gift Pledge Balance" } };
    const saved = await publishFinancial(rows, source, giftTransport(rows));
    expect(saved.job.stage).toBe("complete"); expect(saved.gifts).toBe(2); expect(saved.uniqueRows).toBe(4);
    expect(saved).toMatchObject({ originalCents: 15300, writeOffCents: 1001, effectiveCents: 14299, pledgeBalanceCents: 3001 });
    expect(saved.segments.received.cents).toBe(11298);
    expect(saved.rows.reduce((sum,r) => sum+r.write_off_cents,0)).toBe(1001);
    expect(saved.rows.reduce((sum,r) => sum+r.pledge_balance_cents,0)).toBe(3001);
    expect(saved.rows.every(r => r.received_cents >= 0)).toBe(true);
  });
  it("retains negative received results for review rather than silently clamping balances", async () => {
    const saved = await publishFinancial([financialRow(row(1),1000,6000)]);
    expect(saved.segments.received.cents).toBe(-1000);
    expect(saved.rows[0].received_cents).toBe(-1000);
  });
  it("upgrades the existing PostgreSQL view without changing historical amounts, assignments or exceptions", async () => {
    await edit("funds", { fundIds: ["4"], priority: "scholarships" });
    await edit("override", { itemKey: "10:1", priority: null, amount: "50", reason: "Existing approved exception" });
    await pg.exec(`DROP VIEW campaign_priority_effective;
      ALTER TABLE campaign_priority_rows DROP COLUMN write_off_cents, DROP COLUMN pledge_balance_cents;
      CREATE VIEW campaign_priority_effective AS
      SELECT g.*,r.source_key,COALESCE(f.priority,'unassigned') AS fund_priority,
        CASE WHEN o.base_hash=g.base_hash THEN COALESCE(o.priority,f.priority,'unassigned') ELSE COALESCE(f.priority,'unassigned') END AS priority,
        CASE WHEN o.base_hash=g.base_hash THEN COALESCE(o.amount_cents,g.amount_cents) ELSE g.amount_cents END AS effective_cents,
        o.item_key IS NOT NULL AS has_override,(o.item_key IS NOT NULL AND o.base_hash<>g.base_hash) AS needs_review,
        o.priority AS override_priority,o.amount_cents AS override_cents,o.reason,o.updated_by_name,o.updated_at AS override_updated_at
      FROM campaign_priority_rows g JOIN campaign_priority_runs r ON r.id=g.run_id
        LEFT JOIN campaign_priority_funds f ON f.source_key=r.source_key AND f.fund_id=g.fund_id
        LEFT JOIN campaign_priority_overrides o ON o.source_key=r.source_key AND o.item_key=g.item_key`);
    await schema(db); await schema(db);
    const saved = await read();
    expect(saved).toMatchObject({ originalCents: 10000, netCents: 10000, effectiveCents: 9000, writeOffCents: null, pledgeBalanceCents: null });
    expect(saved.rows.find(r => r.item_key === "10:1")).toMatchObject({ effective_cents: 5000, priority: "scholarships", needs_review: false, received_cents: null });
    expect(await db`SELECT * FROM campaign_priority_events`).toHaveLength(2);
  });
  it("groups the entire snapshot by JU fiscal year, independently of gift detail filters", async () => {
    await db`UPDATE campaign_priority_rows SET gift_date=CASE WHEN item_key='10:1' THEN '6/30/2026' ELSE '2026-07-01' END WHERE run_id=${run}::uuid`;
    const saved = await campaignRead(new URLSearchParams({ fund: "4" }), true, db);
    expect(saved.rows).toHaveLength(1);
    expect(saved.segments.fiscalYearStartMonth).toBe(7);
    expect(saved.segments.fiscalYears).toMatchObject([
      { fiscal_year: 2027, allocations: 1, original_cents: 4000, effective_cents: 4000 },
      { fiscal_year: 2026, allocations: 1, original_cents: 6000, effective_cents: 6000 },
    ]);
    expect(saved.segments.committed).toMatchObject({ status: "source_needed", cents: null });
    expect(saved.segments.received).toMatchObject({ status: "source_needed", cents: null });
  });
  it("fiscal-year recognition includes local exceptions but does not rewrite original amounts", async () => {
    await edit("override", { itemKey: "10:1", priority: "scholarships", amount: "50", reason: "Approved recognition" });
    const saved = await read();
    expect(saved.segments.fiscalYears).toMatchObject([{ fiscal_year: 2027, allocations: 2, original_cents: 10000, effective_cents: 9000 }]);
    expect(saved.segments.fiscalYears.reduce((sum, year) => sum+year.effective_cents, 0)).toBe(saved.effectiveCents);
  });
  it("keeps missing and invalid dates visible without normalizing impossible days into another year", async () => {
    await db`DELETE FROM campaign_priority_rows WHERE run_id=${run}::uuid`;
    const dates = ["", "not a date", "2026-02-29", "02/30/2024", "2026-13-01", "2026-00-01", "2026-01-00", "0000-01-01", "9999-12-31", "2026-07-01junk", "2026-06-31", "2024-02-29", " 2/29/2024 "];
    await stage(dates.map((date, i) => ({ ...row(i+1,100), giftDate: date })));
    const saved = await read();
    expect(saved.segments.fiscalYears).toMatchObject([
      { fiscal_year: 2024, allocations: 2, original_cents: 200, effective_cents: 200 },
      { fiscal_year: null, allocations: 11, original_cents: 1100, effective_cents: 1100 },
    ]);
    expect(saved.segments.fiscalYears.reduce((sum, year) => sum+year.effective_cents, 0)).toBe(saved.effectiveCents);
  });
  it("returns an empty year list for an empty snapshot and read-only viewers see the same totals", async () => {
    expect((await campaignRead(new URLSearchParams(), false, db)).segments).toEqual((await read()).segments);
    await db`DELETE FROM campaign_priority_rows WHERE run_id=${run}::uuid`;
    expect((await read()).segments.fiscalYears).toEqual([]);
  });
  it("never lets a stale version one behind authorize any write or audit", async () => {
    await edit("funds", { fundIds: ["4"], priority: "scholarships" });
    await expect(edit("funds", { fundIds: ["4"], priority: "campus-planning" }, 1)).rejects.toMatchObject({ status: 409 });
    await expect(edit("override", { itemKey: "10:1", priority: null, amount: "1", reason: "Stale" }, 1)).rejects.toMatchObject({ status: 409 });
    expect(await db`SELECT * FROM campaign_priority_overrides`).toHaveLength(0);
    expect(await db`SELECT * FROM campaign_priority_events`).toHaveLength(1);
    expect((await read()).effectiveCents).toBe(10000);
  });
  it("rejects unknown allocations/funds, changed source and revoked editors without side effects", async () => {
    await expect(edit("funds", { fundIds: ["999"], priority: "scholarships" })).rejects.toThrow();
    await expect(edit("override", { itemKey: "99:9", priority: null, amount: "1", reason: "Wrong" })).rejects.toThrow();
    await db`UPDATE users SET active=false WHERE id=1`;
    await expect(edit("funds", { fundIds: ["4"], priority: "scholarships" })).rejects.toThrow();
    await db`UPDATE users SET active=true WHERE id=1`;
    await saveCampaignConfig(actor,1,{ ...config, sourceKey: "new-source" },db);
    await expect(edit("funds", { fundIds: ["4"], priority: "scholarships" })).rejects.toThrow();
    expect((await read()).sourceChanged).toBe(true);
    expect(await db`SELECT * FROM campaign_priority_funds`).toHaveLength(0);
  });
  it("leaves the published snapshot unchanged while staging and on duplicate conflict", async () => {
    const t = transport([row(1),row(1,9999)]); await start(t);
    expect((await read()).runId).toBe(run);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).job.stage).toBe("failed");
    expect((await read()).job.error).toContain("1 gift allocation has conflicting query rows");
    expect((await read()).job.error).toContain("Gift system record IDs to check: 10");
    expect((await read()).runId).toBe(run); expect((await read()).effectiveCents).toBe(10000);
  });
  it("explains a saved legacy failure without rerunning or changing the saved job and hides it from viewers", async () => {
    const t = transport([row(1), row(1,9999)]); await start(t);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    await db`UPDATE campaign_priority_state SET job=jsonb_set(job,'{error}',${JSON.stringify(LEGACY_CAMPAIGN_IMPORT_ERROR)}::jsonb) WHERE id=1`;
    const [before] = await db`SELECT version,job FROM campaign_priority_state WHERE id=1`;
    const data = await read();
    expect(data.job.error).toContain("1 gift allocation has conflicting query rows");
    expect(data.job.error).toContain("1 fund was found, below");
    expect((await campaignRead(new URLSearchParams(),false,db)).job).toBeNull();
    expect((await db`SELECT version,job FROM campaign_priority_state WHERE id=1`)[0]).toEqual(before);
    expect(t.create).toHaveBeenCalledTimes(1); expect(t.read).toHaveBeenCalledTimes(1);
    expect(data.runId).toBe(run); expect(data.effectiveCents).toBe(10000);
  });
  it("reports an actual fund-limit failure independently of duplicate conflicts", async () => {
    const rows = Array.from({length:2001},(_,i) => row(i+1,100,String(i+1)));
    const t = transport(rows);
    t.read.mockImplementation(async (_url,_config,_count,save) => {
      for (let i=0; i<rows.length; i+=500) await save(rows.slice(i,i+500));
      return {rawRows:rows.length};
    });
    await start(t); await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    const data = await read();
    expect(data.job.error).toContain("contains 2,001 funds");
    expect(data.job.error).not.toContain("conflicting");
    expect(data.runId).toBe(run); expect(data.effectiveCents).toBe(10000);
  });
  it("publishes only a complete query, collapsing identical duplicates across batches", async () => {
    const t = transport([row(1),row(1),row(2,4000,"5")]);
    t.read.mockImplementation(async (_url,_config,_count,save) => { await save([row(1)]); await save([row(1),row(2,4000,"5")]); return { rawRows: 3 }; });
    await start(t);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    const data = await read(); expect(data.runId).not.toBe(run); expect(data.job.stage).toBe("complete");
    expect(data.rawRows).toBe(3); expect(data.uniqueRows).toBe(2); expect(data.effectiveCents).toBe(10000);
  });
  it.each([false, true])("whole-gift mode deduplicates gifts and requires verification for multiple funds: conflict=%s", async conflict => {
    const giftConfig = { ...config, mode: "gift", columns: { ...config.columns, splitId: "" } };
    const headers = Object.values(giftConfig.columns).filter(Boolean);
    const makeGift = fund => {
      const values = { Gift: "10", "Fund System Record ID": fund, Fund: `Fund ${fund}`, Amount: "100.00" };
      const value = campaignRow(headers.map(header => values[header]), headers, giftConfig);
      return { ...value, rowHash: campaignHash(value), baseHash: campaignHash([value.giftId, value.splitId, value.fundId, value.amountCents]) };
    };
    await saveCampaignConfig(actor, 1, giftConfig, db);
    const t = transport([makeGift("4"), makeGift(conflict ? "5" : "4")]); await start(t);
    await advanceCampaignRefresh(actor, (await read()).version, "continue", t, db);
    if (conflict) {
      expect((await read()).job.stage).toBe("resolving");
      await advanceCampaignRefresh(actor, (await read()).version, "continue", t, db);
    }
    const data = await read();
    if (conflict) {
      expect(data.job.stage).toBe("failed"); expect(data.runId).toBe(run); expect(data.effectiveCents).toBe(10000);
    } else {
      expect(data.job.stage).toBe("complete"); expect(data.runId).not.toBe(run);
      expect(data.uniqueRows).toBe(1); expect(data.effectiveCents).toBe(10000); expect(data.rows[0].split_id).toBeNull();
    }
  });
  it("publishes four fund allocations totaling $153 from two gifts without counting either whole amount twice", async () => {
    await saveCampaignConfig(actor,1,giftConfig,db);
    const t = giftTransport(); await start(t);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).job.stage).toBe("resolving"); expect((await read()).runId).toBe(run);
    expect(t.gift).not.toHaveBeenCalled();
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    const data = await read();
    expect(data.job.stage).toBe("complete"); expect(data.uniqueRows).toBe(4); expect(data.gifts).toBe(2);
    expect(data.originalCents).toBe(15300); expect(data.effectiveCents).toBe(15300);
    expect(data.rows.map(row => [row.item_key,row.fund_id,row.amount_cents])).toEqual([
      ["11:71","4",5000],["11:72","5",5000],["12:81","5",2650],["12:82","8",2650],
    ]);
    expect(t.gift.mock.calls).toEqual([["11"],["12"]]);
    expect(t.read).toHaveBeenCalledTimes(1); expect(t.poll).toHaveBeenCalledTimes(1);
  });
  it("keeps ordinary gift overrides and fund assignments and allows independent split overrides across refreshes", async () => {
    await saveCampaignConfig(actor,1,giftConfig,db);
    const rows = [...twoSplitGifts(),wholeGift("13","9",1000)];
    const t = giftTransport(rows); await start(t);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    run = (await read()).runId;
    await edit("funds",{ fundIds: ["4","5"],priority: "scholarships" });
    await edit("override",{ itemKey: "13",priority: null,amount: "9",reason: "Ordinary gift exception" });
    await edit("override",{ itemKey: "11:71",priority: "campus-planning",amount: "45",reason: "Only this fund allocation" });
    await start(t);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    const data = await read();
    expect(data.effectiveCents).toBe(15700); expect(data.orphaned).toBe(0);
    expect(data.rows.find(row => row.item_key === "13")).toMatchObject({ effective_cents: 900,needs_review: false });
    expect(data.rows.find(row => row.item_key === "11:71")).toMatchObject({ effective_cents: 4500,priority: "campus-planning",needs_review: false });
    expect(data.rows.find(row => row.item_key === "11:72")).toMatchObject({ effective_cents: 5000,priority: "scholarships" });
    expect(t.gift.mock.calls.map(([id]) => id)).not.toContain("13");
  });
  it("deduplicates repeated whole-gift/fund rows across batches before split resolution", async () => {
    await saveCampaignConfig(actor,1,giftConfig,db);
    const t = giftTransport();
    t.read.mockImplementation(async (_url,_config,_count,save) => {
      await save(twoSplitGifts()); await save(twoSplitGifts()); return {rawRows:8};
    });
    await start(t); await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).effectiveCents).toBe(15300); expect((await read()).rawRows).toBe(8);
    expect(t.gift).toHaveBeenCalledTimes(2);
  });
  it("pauses split checks without redownloading the query or rechecking a completed gift", async () => {
    await saveCampaignConfig(actor,1,giftConfig,db);
    const t = giftTransport(), detail = t.gift.getMockImplementation();
    t.gift.mockImplementationOnce(detail).mockRejectedValueOnce(new BlackbaudQuotaExceededError({retryAfterMs:120000}));
    await start(t); await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    const paused = await read(); expect(paused.job.stage).toBe("resolving"); expect(paused.runId).toBe(run);
    expect(Date.parse(paused.job.nextCheckAt)).toBeGreaterThan(Date.now()+110000);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect(t.gift).toHaveBeenCalledTimes(2);
    await db`UPDATE campaign_priority_state SET job=jsonb_set(job,'{nextCheckAt}','"2000-01-01T00:00:00Z"') WHERE id=1`;
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).effectiveCents).toBe(15300);
    expect(t.gift.mock.calls).toEqual([["11"],["12"],["12"]]);
    expect(t.create).toHaveBeenCalledTimes(1); expect(t.poll).toHaveBeenCalledTimes(1); expect(t.read).toHaveBeenCalledTimes(1);
  });
  it("rejects conflicting rows within the same gift and fund without requesting gift details", async () => {
    await saveCampaignConfig(actor,1,giftConfig,db);
    const t = giftTransport([...twoSplitGifts(),wholeGift("11","4",9999)]);
    await start(t); await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).job.stage).toBe("failed"); expect((await read()).runId).toBe(run);
    expect(t.gift).not.toHaveBeenCalled();
  });
  it("preserves the last snapshot when a split response contains an unqueried fund", async () => {
    await saveCampaignConfig(actor,1,giftConfig,db);
    const t = giftTransport(), detail = t.gift.getMockImplementation();
    t.gift.mockImplementation(async id => { const gift = await detail(id); gift.gift_splits[0].fund_id = "999"; return gift; });
    await start(t); await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    const data = await read(); expect(data.job.stage).toBe("failed"); expect(data.job.error).toContain("could not be reconciled");
    expect(data.runId).toBe(run); expect(data.effectiveCents).toBe(10000);
  });
  it("bounds split lookups to ten per request and resumes the remaining gift only", async () => {
    await saveCampaignConfig(actor,1,giftConfig,db);
    const rows = Array.from({length:11},(_,i) => [wholeGift(String(i+20),"4",10000),wholeGift(String(i+20),"5",10000)]).flat();
    const t = giftTransport(rows);
    t.gift.mockImplementation(async id => ({ id,amount: { value: 100 },gift_splits: [
      {id:`${id}1`,fund_id:"4",amount:{value:60}},{id:`${id}2`,fund_id:"5",amount:{value:40}},
    ] }));
    await start(t); await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).job.stage).toBe("resolving"); expect((await read()).runId).toBe(run);
    expect(t.gift).toHaveBeenCalledTimes(10);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).job.stage).toBe("complete"); expect((await read()).effectiveCents).toBe(110000);
    expect(t.gift).toHaveBeenCalledTimes(11); expect(t.read).toHaveBeenCalledTimes(1);
  });
  it("rejects excessive multi-fund gifts before spending API capacity", async () => {
    await saveCampaignConfig(actor,1,giftConfig,db);
    const rows = Array.from({length:101},(_,i) => [wholeGift(String(i+20),"4",10000),wholeGift(String(i+20),"5",10000)]).flat();
    const t = giftTransport(rows); await start(t);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).job.error).toContain("Map split system IDs and split amounts");
    expect((await read()).runId).toBe(run); expect(t.gift).not.toHaveBeenCalled();
  });
  it("does not replace staging rows or publish when the lease expires during a gift lookup", async () => {
    await saveCampaignConfig(actor,1,giftConfig,db);
    const t = giftTransport(), detail = t.gift.getMockImplementation();
    t.gift.mockImplementation(async id => {
      await db`UPDATE campaign_priority_state SET lease_until=NOW()-INTERVAL '1 second' WHERE id=1`;
      return detail(id);
    });
    await start(t); await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    const [before] = await db`SELECT job FROM campaign_priority_state WHERE id=1`;
    await expect(advanceCampaignRefresh(actor,(await read()).version,"continue",t,db)).rejects.toMatchObject({status:409});
    const staged = await db`SELECT item_key,split_id,amount_cents FROM campaign_priority_rows WHERE run_id=${before.job.runId}::uuid ORDER BY item_key`;
    expect(staged).toHaveLength(4); expect(staged.every(row => row.split_id === null && row.item_key.includes(":fund:"))).toBe(true);
    expect((await read()).runId).toBe(run); expect((await read()).effectiveCents).toBe(10000);
  });
  it("requires the same connection and blocks source edits during split verification; cancellation is read-only", async () => {
    await saveCampaignConfig(actor,1,giftConfig,db);
    const t = giftTransport(); await start(t);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    await expect(saveCampaignConfig(actor,(await read()).version,giftConfig,db)).rejects.toThrow();
    await advanceCampaignRefresh(actor,(await read()).version,"continue",{...t,connectionKey:"another-connection"},db);
    expect((await read()).job.stage).toBe("failed"); expect(t.gift).not.toHaveBeenCalled();
    await start(t); await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    await advanceCampaignRefresh(actor,(await read()).version,"cancel",null,db);
    expect((await read()).job.stage).toBe("cancelled"); expect((await read()).runId).toBe(run);
    expect(t.gift).not.toHaveBeenCalled();
  });
  it("marks changed source allocations for review rather than reapplying old exceptions", async () => {
    await edit("override", { itemKey: "10:1", priority: "campus-planning", amount: "50", reason: "Exception" });
    const t = transport([row(1,7000),row(2,4000,"5")]); await start(t);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    const data = await read(); expect(data.effectiveCents).toBe(11000);
    expect(data.rows.find(r => r.item_key === "10:1")).toMatchObject({ needs_review: true, priority: "unassigned", override_cents: 5000 });
  });
  it("retains a checkpoint on throttling without resubmitting the query", async () => {
    const t = transport(); await start(t);
    t.poll.mockRejectedValueOnce({ httpStatus: 429, retryAfterMs: 120000 });
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).job.stage).toBe("waiting");
    expect(Date.parse((await read()).job.nextCheckAt)).toBeGreaterThan(Date.now()+110000);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect(t.poll).toHaveBeenCalledTimes(1); expect(t.create).toHaveBeenCalledTimes(1);
    expect((await read()).runId).toBe(run);
  });
  it("recognizes the application's quota exception and preserves the waiting job", async () => {
    const t = transport(); await start(t);
    t.poll.mockRejectedValueOnce(new BlackbaudQuotaExceededError({ retryAfterMs: 600000 }));
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).job).toMatchObject({ stage: "waiting",error: expect.stringContaining("cooldown") });
    expect(Date.parse((await read()).job.nextCheckAt)).toBeGreaterThan(Date.now()+590000);
    expect((await read()).runId).toBe(run);
  });
  it("does not publish partially downloaded rows on an interrupted result", async () => {
    const t = transport(); t.read.mockImplementation(async (_url,_config,_count,save) => { await save([row(1,9999)]); throw new Error("stream interrupted"); });
    await start(t); await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).job.stage).toBe("failed"); expect((await read()).effectiveCents).toBe(10000);
  });
  it("disallows source changes during a job and can cancel without an NXT connection", async () => {
    const t = transport(); await start(t);
    await expect(saveCampaignConfig(actor,(await read()).version,config,db)).rejects.toThrow();
    await advanceCampaignRefresh(actor,(await read()).version,"cancel",null,db);
    expect((await read()).job.stage).toBe("cancelled"); expect((await read()).runId).toBe(run);
  });
  it("does not expose query job IDs or configuration to viewers", async () => {
    await start(transport()); const data = await campaignRead(new URLSearchParams(),false,db);
    expect(data.config).toBeUndefined(); expect(data.job).toBeNull(); expect(JSON.stringify(data)).not.toContain("job-1");
  });
  it("checks editor roles again at the service boundary", async () => {
    const viewer = { id: 1, role: "mgo" };
    await expect(editCampaign(viewer,1,run,"funds",{ fundIds: ["4"], priority: "scholarships" },db)).rejects.toMatchObject({ status: 403 });
    await expect(saveCampaignConfig(viewer,1,config,db)).rejects.toMatchObject({ status: 403 });
    await expect(advanceCampaignRefresh(viewer,1,"start",transport(),db)).rejects.toMatchObject({ status: 403 });
    expect(await db`SELECT * FROM campaign_priority_events`).toHaveLength(0);
  });
  it("rejects an over-limit publication without breaking the saved dashboard", async () => {
    const t = transport(Array.from({ length: 50 },(_,i) => row(i+1,1e14)));
    await start(t); await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).job).toMatchObject({ stage: "failed",error: expect.stringContaining("exact-amount") });
    expect((await read()).effectiveCents).toBe(10000);
  });
  it("keeps exceptions orphaned but unapplied when a gift leaves the source", async () => {
    await edit("override",{ itemKey: "10:1",priority: null,amount: "50",reason: "Previously approved" });
    const t = transport([row(2,4000,"5")]); await start(t);
    await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).orphaned).toBe(1); expect((await read()).effectiveCents).toBe(4000);
    expect(await db`SELECT * FROM campaign_priority_overrides`).toHaveLength(1);
  });
  it("does not transfer exceptions or fund defaults when the configured source changes", async () => {
    await edit("funds",{ fundIds: ["4"],priority: "scholarships" });
    await edit("override",{ itemKey: "10:1",priority: null,amount: "50",reason: "Old source" });
    await saveCampaignConfig(actor,(await read()).version,{ ...config,sourceKey: "source-b" },db);
    const t = transport(); await start(t); await advanceCampaignRefresh(actor,(await read()).version,"continue",t,db);
    expect((await read()).effectiveCents).toBe(10000); expect((await read()).priorities[0].priority).toBe("unassigned");
    expect((await read()).rows.every(r => !r.has_override)).toBe(true);
  });
});
