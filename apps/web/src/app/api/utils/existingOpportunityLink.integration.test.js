// Real PostgreSQL, fictional data, local Unix socket only. Never reads DATABASE_URL.
import { spawn } from "node:child_process";
import Papa from "papaparse";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ query: null, transaction: null, remote: vi.fn() }));
vi.mock("./sql", () => ({ default: Object.assign((...args) => fixture.query(...args), { transaction: (...args) => fixture.transaction(...args) }) }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: fixture.remote }));
vi.mock("./ensureAppSchema", () => ({ default: vi.fn() }));
import { linkExistingOpportunity } from "./existingOpportunityLink";
import { saveProspectOpportunity } from "./prospectOpportunities";
import { upsertProspectOpportunity } from "./bootstrapMgoPortfolio";
import { withProspectDisplayData, matchesProspectFiscalYear } from "@/utils/prospectDisplay";
const socket = process.env.OPPORTUNITY_LINK_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/opportunity-link-pg\.[A-Za-z0-9]+$/.test(socket || "");
const literal = value => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const parse = text => text.trim() ? Papa.parse(text.trim(), { header: true, skipEmptyLines: true }).data.map(row =>
  Object.fromEntries(Object.entries(row).map(([key,value]) => [key, value === "" ? null : value === "t" ? true : value === "f" ? false : value]))) : [];
function run(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn("/opt/homebrew/opt/postgresql@18/bin/psql", ["-Xq", "--csv", "--no-password", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "55449", "-d", "postgres"]);
    let out = "", error = "";
    child.stdout.on("data", value => out += value); child.stderr.on("data", value => error += value);
    child.on("error", reject); child.on("close", code => code ? reject(new Error(error)) : resolve(out));
    child.stdin.end(`SET search_path = opportunity_link_fixture; SET TIME ZONE 'UTC';\n${statement}`);
  });
}
const execute = async text => parse(await run(text));
const prospect = { id: 7, user_id: 44, constituent_id: 6, nxtId: "123", fundraiser_id: "777" };
const context = { userId: 44, authUserId: 1, origin: "https://example.com" };
const remote = { id: "900", constituent_id: "123", name: "Fictional Scholarship", status: "Solicitation", purpose: "College of Law",
  date_added: "2026-03-31T12:00:00Z", ask_amount: { value: 25000 }, fundraisers: [{ constituent_id: "777" }] };

describe.skipIf(!enabled)("existing opportunity local PostgreSQL links", () => {
  beforeAll(async () => {
    fixture.query = (parts, ...values) => {
      const text = parts.reduce((query, part, i) => query + part + (i < values.length ? literal(values[i]) : ""), "");
      return { text, then: (resolve,reject) => execute(text).then(resolve,reject) };
    };
    fixture.transaction = async statements => {
      const output = await run(`BEGIN ISOLATION LEVEL READ COMMITTED;\n${statements.map((s,i) => `\\echo __QUERY_${i}__\n${s.text};`).join("\n")}\nCOMMIT;`);
      return output.split(/__QUERY_\d+__\n/).slice(1).map(parse);
    };
    await execute(`DROP SCHEMA IF EXISTS opportunity_link_fixture CASCADE; CREATE SCHEMA opportunity_link_fixture; SET search_path = opportunity_link_fixture;
      CREATE TABLE users(id bigint PRIMARY KEY, active boolean DEFAULT true, blackbaud_constituent_id text, blackbaud_summary_cache jsonb, blackbaud_summary_cache_key text, blackbaud_summary_cached_at timestamptz);
      CREATE TABLE constituents(id bigint PRIMARY KEY, blackbaud_constituent_id text);
      CREATE TABLE prospects(id bigint PRIMARY KEY, user_id bigint, constituent_id bigint, blackbaud_constituent_id text, prospect_name text, status text,
        ask_amount numeric, closed_amount numeric, close_date date, decline_reason text, priority_order int, updated_at timestamptz);
      CREATE TABLE prospect_opportunities(id bigserial PRIMARY KEY, prospect_id bigint REFERENCES prospects(id), constituent_id bigint, blackbaud_opportunity_id text,
        title text, purpose text, current_stage text, opportunity_status text, estimated_amount numeric, ask_date date, expected_date date,
        closed_amount numeric, close_date date, decline_reason text, latest_notes text, joint_mgo_user_ids jsonb, shared_opportunity_key text,
        last_submission_id bigint, nxt_checked_at timestamptz, pipeline_change_id uuid, created_at timestamptz DEFAULT NOW(), updated_at timestamptz DEFAULT NOW());
      CREATE TABLE portfolio_constituent_snapshots(workspace_user_id bigint, constituent_id text, stale_after timestamptz, summary_payload jsonb);`);
  });
  beforeEach(async () => {
    fixture.remote.mockReset().mockResolvedValue(remote);
    await execute(`TRUNCATE users,constituents,prospects,prospect_opportunities,portfolio_constituent_snapshots RESTART IDENTITY;
      INSERT INTO users VALUES(44,true,'777','{"saved":true}',NULL,NULL), (45,true,'888','{}',NULL,NULL);
      INSERT INTO constituents VALUES(6,'123'),(8,'999');
      INSERT INTO prospects VALUES(7,44,6,NULL,'Fictional Donor','Active',0,NULL,NULL,NULL,18,'2026-11-02'),
        (8,44,6,NULL,'Duplicate donor','Active',0,NULL,NULL,NULL,19,'2026-11-02'),
        (9,45,6,NULL,'Joint donor','Active',0,NULL,NULL,NULL,1,'2026-11-02');
      INSERT INTO portfolio_constituent_snapshots VALUES(44,'123','2099-01-01','{"keep":true}');`);
  });
  it("links undated data, updates saved totals, preserves ranking/activity, and stays out of FY totals", async () => {
    expect(await linkExistingOpportunity(context, prospect, "900")).toMatchObject({ alreadyLinked: false, expectedDateNeeded: true });
    const [saved] = await execute("SELECT * FROM prospect_opportunities");
    expect(saved).toMatchObject({ blackbaud_opportunity_id: "900", estimated_amount: "25000", expected_date: null, opportunity_status: "Active" });
    const [parent] = await execute("SELECT * FROM prospects WHERE id=7");
    expect(parent).toMatchObject({ ask_amount: "25000", priority_order: "18" });
    expect(Date.parse(parent.updated_at)).toBe(Date.parse("2026-11-02T00:00:00Z"));
    const display = withProspectDisplayData(parent, [saved]);
    expect(display.open_opportunity_undated_count).toBe(1); expect(matchesProspectFiscalYear(display, "FY27")).toBe(false);
    expect((await execute("SELECT blackbaud_summary_cache IS NULL AS cleared FROM users WHERE id=44"))[0].cleared).toBe(true);
    expect((await execute("SELECT stale_after <= NOW() AS stale, summary_payload IS NOT NULL AS kept FROM portfolio_constituent_snapshots"))[0]).toEqual({ stale: true, kept: true });
  });
  it("serializes simultaneous clicks and retries to one local row", async () => {
    const results = await Promise.all([linkExistingOpportunity(context, prospect, "900"), linkExistingOpportunity(context, prospect, "900")]);
    expect(results.map(row => row.alreadyLinked).sort()).toEqual([false,true]);
    expect((await execute("SELECT COUNT(*) AS count FROM prospect_opportunities"))[0].count).toBe("1");
    expect(await linkExistingOpportunity(context, prospect, "900")).toMatchObject({ alreadyLinked: true });
  });
  it("does not duplicate the NXT create-and-save path when it overlaps a manual link", async () => {
    await Promise.all([
      linkExistingOpportunity(context, prospect, "900"),
      saveProspectOpportunity({ userId:44, prospectId:7, constituentId:6, blackbaudOpportunityId:"900", title:remote.name,
        purpose:remote.purpose, currentStage:"Solicitation", askAmount:25000, jointMgoUserIds:[44] }),
    ]);
    expect((await execute("SELECT COUNT(*) AS count FROM prospect_opportunities"))[0].count).toBe("1");
  });
  it("does not reparent an opportunity already linked elsewhere in this workspace", async () => {
    await linkExistingOpportunity(context, { ...prospect, id:8 }, "900");
    await expect(linkExistingOpportunity(context, prospect, "900")).rejects.toThrow(/conflicts/);
    expect((await execute("SELECT prospect_id FROM prospect_opportunities"))[0].prospect_id).toBe("8");
  });
  it("does not duplicate a manual link when the existing importer overlaps it", async () => {
    await Promise.all([linkExistingOpportunity(context, prospect, "900"),
      upsertProspectOpportunity({ prospectId:7, constituentId:6, opportunity:remote })]);
    expect((await execute("SELECT COUNT(*) AS count FROM prospect_opportunities"))[0].count).toBe("1");
  });
  it("keeps ordinary app-only and closed opportunity creation working", async () => {
    const saved = await saveProspectOpportunity({ userId:44, prospectId:7, constituentId:6, title:"App-only gift", currentStage:"Funded", askAmount:5000 });
    expect(saved.opportunity).toMatchObject({ blackbaud_opportunity_id:null, opportunity_status:"Closed \u2013 Gift Secured", closed_amount:"5000" });
  });
  it.each(["UPDATE prospects SET status='Archived' WHERE id=7", "UPDATE prospects SET user_id=45 WHERE id=7", "UPDATE prospects SET blackbaud_constituent_id='999' WHERE id=7", "UPDATE users SET blackbaud_constituent_id='888' WHERE id=44", "UPDATE constituents SET blackbaud_constituent_id='999' WHERE id=6"])("rechecks local identity/status after the provider read: %s", async change => {
    fixture.remote.mockImplementationOnce(async () => { await execute(change); return remote; });
    await expect(linkExistingOpportunity(context, prospect, "900")).rejects.toThrow();
    expect((await execute("SELECT COUNT(*) AS count FROM prospect_opportunities"))[0].count).toBe("0");
  });
  it("refuses pending or conflicting shared copies, retaining all saved data", async () => {
    await execute("INSERT INTO prospect_opportunities(prospect_id,blackbaud_opportunity_id,pipeline_change_id) VALUES(9,'900','a303c1f0-b129-4acb-9004-cd4825e685cf')");
    await expect(linkExistingOpportunity(context, prospect, "900")).rejects.toThrow();
    await execute("UPDATE prospect_opportunities SET pipeline_change_id=NULL, constituent_id=8");
    await expect(linkExistingOpportunity(context, prospect, "900")).rejects.toThrow();
    expect((await execute("SELECT COUNT(*) AS count FROM prospect_opportunities"))[0].count).toBe("1");
  });
  it("rolls the link and aggregate back if cache invalidation fails, then retries safely", async () => {
    await execute("ALTER TABLE users ADD CONSTRAINT block_cache_clear CHECK(blackbaud_summary_cache IS NOT NULL)");
    try { await expect(linkExistingOpportunity(context, prospect, "900")).rejects.toThrow(); }
    finally { await execute("ALTER TABLE users DROP CONSTRAINT block_cache_clear"); }
    expect((await execute("SELECT COUNT(*) AS count FROM prospect_opportunities"))[0].count).toBe("0");
    expect((await execute("SELECT ask_amount FROM prospects WHERE id=7"))[0].ask_amount).toBe("0");
    expect(await linkExistingOpportunity(context, prospect, "900")).toMatchObject({ alreadyLinked:false });
  });
});
