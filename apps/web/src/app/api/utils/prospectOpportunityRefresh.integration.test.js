// Opt-in, disposable Unix-socket database only. Never uses DATABASE_URL.
import { execFileSync } from "node:child_process";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Papa from "papaparse";
const fixture = vi.hoisted(() => ({ query: null, remote: vi.fn() }));
vi.mock("./sql", () => ({ default: (parts, ...values) => fixture.query(parts, values) }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: fixture.remote }));
import { refreshLinkedProspectOpportunities } from "./prospectOpportunityRefresh";

const socket = process.env.OPPORTUNITY_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/opportunity-refresh-pg\.[A-Za-z0-9]+$/.test(socket || "");
function execute(statement) {
  const output = execFileSync("/opt/homebrew/opt/postgresql@18/bin/psql", ["-X", "--no-password", "-q", "--csv", "-v", "ON_ERROR_STOP=1",
    "-h", socket, "-p", "55441", "-d", "postgres"], { input: statement, encoding: "utf8" });
  return output.trim() ? Papa.parse(output.trim(), { header: true }).data.map(row =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === "" ? null : value]))) : [];
}
const literal = value => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const context = { userId: 44, authUserId: 1, origin: "https://example.com", prospectId: 7, constituentId: "123" };
const remote = { id: "900", constituent_id: "123", name: "New title", status: "Solicitation", ask_amount: { value: 25000 }, expected_date: "2027-06-30" };

describe.skipIf(!enabled)("linked opportunity PostgreSQL refresh", () => {
  beforeAll(() => {
    fixture.query = async (parts, values) => execute(parts.reduce((query, part, index) => query + part + (index < values.length ? literal(values[index]) : ""), ""));
    execute(`CREATE TABLE users(id bigint PRIMARY KEY, blackbaud_summary_cache jsonb, blackbaud_summary_cache_key text, blackbaud_summary_cached_at timestamptz, updated_at timestamptz);
      CREATE TABLE prospects(id bigint PRIMARY KEY, user_id bigint, status text, ask_amount numeric, closed_amount numeric, close_date date, priority_order int, updated_at timestamptz);
      CREATE TABLE prospect_opportunities(id bigint PRIMARY KEY, prospect_id bigint, blackbaud_opportunity_id text, title text, purpose text,
        current_stage text, estimated_amount numeric, ask_date date, expected_date date, opportunity_status text, closed_amount numeric, close_date date,
        latest_notes text, updated_at timestamptz, nxt_checked_at timestamptz, nxt_retry_after timestamptz, pipeline_change_id uuid);`);
  });
  beforeEach(() => {
    fixture.remote.mockReset().mockResolvedValue(remote);
    execute(`TRUNCATE users, prospects, prospect_opportunities;
      INSERT INTO users(id,blackbaud_summary_cache) VALUES (44,'{"old":true}');
      INSERT INTO prospects VALUES (7,44,'Active',10000,NULL,NULL,3,'2026-09-01T00:00:00Z');
      INSERT INTO prospect_opportunities VALUES (301,7,'900','Old title','Campaign','Cultivation',10000,'2026-08-01','2027-05-31','Active',NULL,NULL,'Keep local notes','2026-09-01T00:00:00Z',NULL,NULL,NULL);`);
  });
  it("refreshes existing values and totals without changing priority, notes, or activity dates", async () => {
    expect(await refreshLinkedProspectOpportunities(context)).toMatchObject({ changed: 1, checked: 1 });
    const [row] = execute("SELECT title,current_stage,estimated_amount,expected_date,latest_notes,updated_at::text,nxt_checked_at::text FROM prospect_opportunities");
    expect(row).toMatchObject({ title: "New title", current_stage: "Solicitation", estimated_amount: "25000", expected_date: "2027-06-30", latest_notes: "Keep local notes" });
    expect(Date.parse(row.updated_at)).toBe(Date.parse("2026-09-01T00:00:00Z")); expect(row.nxt_checked_at).toBeTruthy();
    expect(execute("SELECT ask_amount,priority_order FROM prospects")[0]).toEqual({ ask_amount: "25000", priority_order: "3" });
    expect(execute("SELECT blackbaud_summary_cache IS NULL AS cleared FROM users")[0].cleared).toBe("t");
  });
  it("rejects a stale remote read after a concurrent local edit", async () => {
    fixture.remote.mockImplementationOnce(async () => {
      execute("UPDATE prospect_opportunities SET title='Newer local draft', updated_at=NOW()");
      return remote;
    });
    expect(await refreshLinkedProspectOpportunities(context)).toMatchObject({ checked: 0, changed: 0, deferred: 1 });
    expect(execute("SELECT title,nxt_checked_at::text FROM prospect_opportunities")[0]).toEqual({ title: "Newer local draft", nxt_checked_at: null });
  });
  it("allows only one remote read for overlapping refresh requests", async () => {
    let finish;
    fixture.remote.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = refreshLinkedProspectOpportunities(context);
    await vi.waitFor(() => expect(fixture.remote).toHaveBeenCalledTimes(1));
    expect(await refreshLinkedProspectOpportunities(context)).toMatchObject({ deferred: 1, checked: 0 });
    finish(remote); await first; expect(fixture.remote).toHaveBeenCalledTimes(1);
  });
  it("keeps archives and the last good opportunity after a failed refresh", async () => {
    execute("UPDATE prospects SET status='Archived'");
    await refreshLinkedProspectOpportunities(context);
    expect(execute("SELECT status FROM prospects")[0].status).toBe("Archived");
    execute("UPDATE prospect_opportunities SET nxt_checked_at=NULL");
    fixture.remote.mockRejectedValueOnce(new Error("NXT unavailable"));
    expect(await refreshLinkedProspectOpportunities(context)).toMatchObject({ unavailable: 1 });
    expect(execute("SELECT title,nxt_retry_after > NOW() AS cooldown FROM prospect_opportunities")[0]).toEqual({ title: "New title", cooldown: "t" });
  });
});
