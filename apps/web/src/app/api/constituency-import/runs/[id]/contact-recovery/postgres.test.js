// @vitest-environment node
// Optional PostgreSQL validation on an isolated local test cluster or in-memory PGlite.
// IMPORT_RECOVERY_TEST_SOCKET=/tmp/<cluster> IMPORT_RECOVERY_TEST_PORT=55449 npm test -- contact-recovery/postgres.test.js
import { execFileSync } from "node:child_process";
import Papa from "papaparse";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { email: "reviewer@example.test" } }) }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: async () => ({ sessionUser: { id: 7, role: "admin" } }) }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: async () => {} }));
import { POST } from "./route";

const socket = process.env.IMPORT_RECOVERY_TEST_SOCKET;
const pgliteModule = process.env.IMPORT_RECOVERY_TEST_PGLITE;
const schema = `import_recovery_test_${process.pid}`;
let db;
async function query(sql) {
  if (db) {
    const results = await db.exec(`SET search_path TO ${schema}; ${sql}`);
    return (results.at(-1)?.rows || []).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
      value == null || typeof value === "object" ? value : String(value),
    ])));
  }
  if (!socket?.startsWith("/tmp/") && !socket?.startsWith("/private/tmp/")) throw new Error("Use an isolated local test socket, never a production connection.");
  const output = execFileSync("psql", ["-X", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-h", socket,
    "-p", process.env.IMPORT_RECOVERY_TEST_PORT || "55449", "-d", "postgres", "-c", `SET search_path TO ${schema}; ${sql}`], { encoding: "utf8" });
  return Papa.parse(output.trim(), { header: true, skipEmptyLines: true }).data.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (["preview", "raw_row", "requested_writes", "blackbaud_result", "defaults", "mappings", "summary", "warnings"].includes(key)) return [key, value ? JSON.parse(value) : null];
    return [key, value === "" ? null : value];
  })));
}
const literal = (value) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const request = (ids = ["9"]) => POST(new Request("https://example.test/api/constituency-import/runs/42/contact-recovery", {
  method: "POST", body: JSON.stringify({ confirmed: true, rowIds: ids }),
}), { params: { id: "42" } });

describe.skipIf(!socket && !pgliteModule)("atomic contact corrections in PostgreSQL", () => {
  beforeAll(async () => {
    if (pgliteModule) {
      const { PGlite } = await import(/* @vite-ignore */ pgliteModule);
      db = new PGlite();
    }
  });
  beforeEach(async () => {
    await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema}; SET search_path TO ${schema};
      CREATE TABLE constituency_import_runs (
        id BIGSERIAL PRIMARY KEY, created_by_user_id BIGINT, workspace_user_id BIGINT, status TEXT, source_filename TEXT,
        mappings JSONB, defaults JSONB, warnings JSONB, summary JSONB, row_count INTEGER, ready_count INTEGER,
        needs_review_count INTEGER, conflict_count INTEGER, skipped_count INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
      );
      CREATE TABLE constituency_import_rows (
        id BIGSERIAL PRIMARY KEY, run_id BIGINT REFERENCES constituency_import_runs(id), row_number INTEGER CHECK(row_number > 0),
        status TEXT, match_status TEXT, match_method TEXT, confidence INTEGER, matched_blackbaud_constituent_id TEXT,
        matched_lookup_id TEXT, constituent_name TEXT, created_blackbaud_constituent_id TEXT, created_blackbaud_lookup_id TEXT,
        quick_create_status TEXT, raw_row JSONB, preview JSONB, requested_writes JSONB, blackbaud_result JSONB,
        created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, UNIQUE(run_id, row_number)
      );
      INSERT INTO constituency_import_runs (id, mappings, defaults) VALUES (42, '{"email":"Email","emailType":"Type","emailMakePrimary":"Primary"}', '{"updateEmailFields":false}');
      INSERT INTO constituency_import_rows (id, run_id, row_number, status, created_blackbaud_constituent_id, matched_blackbaud_constituent_id, raw_row, preview, requested_writes, blackbaud_result)
      VALUES (9, 42, 1, 'Applied', '123', '123', '{"Email":"alex@example.test","Type":"Personal","Primary":"yes"}',
        '{"input":{"firstName":"Alex","lastName":"Example"},"match":{"blackbaudConstituentId":"123","name":"Alex Example"}}',
        '[{"type":"constituent_code"}]', '{"results":[{"writeIndex":0,"type":"constituent_code","status":"applied"}]}');
      SELECT setval('constituency_import_runs_id_seq', 42); SELECT setval('constituency_import_rows_id_seq', 9);
    `);
    mocks.sql.mockReset().mockImplementation(async (strings, ...values) => query(strings.reduce((sql, part, index) => sql + part + (index < values.length ? literal(values[index]) : ""), "")));
  });
  afterAll(async () => {
    if (db) await db.close();
    else if (socket) await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  });

  it("commits the original link, correction, and child rows together and reopens idempotently", async () => {
    const original = (await query("SELECT * FROM constituency_import_rows WHERE id=9"))[0];
    const response = await request();
    expect(response.status).toBe(200);
    const { runId } = await response.json();
    expect((await query("SELECT defaults FROM constituency_import_runs WHERE id=42"))[0].defaults.contactRecoveryRuns[9]).toBe(runId);
    const [child] = await query(`SELECT * FROM constituency_import_rows WHERE run_id=${Number(runId)}`);
    expect(child.matched_blackbaud_constituent_id).toBe("123");
    expect(child.preview.input.emailUpdates[0].makePrimary).toBe(true);
    expect(child.created_blackbaud_constituent_id).toBeNull();
    expect((await query("SELECT * FROM constituency_import_rows WHERE id=9"))[0]).toEqual(original);
    expect(await (await request()).json()).toMatchObject({ runId, reused: true });
    expect((await query("SELECT COUNT(*) AS count FROM constituency_import_runs"))[0].count).toBe("2");
  });
  it("creates only one correction when requests race with the same old source snapshot", async () => {
    const responses = await Promise.all([request(), request()]);
    expect(responses.map((value) => value.status).sort()).toEqual([200, 409]);
    expect((await query("SELECT COUNT(*) AS count FROM constituency_import_runs"))[0].count).toBe("2");
  });
  it("rolls the link back when child insertion fails", async () => {
    await query("ALTER TABLE constituency_import_rows ADD CONSTRAINT reject_test_child CHECK(run_id=42)");
    expect((await request()).status).toBe(500);
    expect((await query("SELECT defaults FROM constituency_import_runs WHERE id=42"))[0].defaults).toEqual({ updateEmailFields: false });
    expect((await query("SELECT COUNT(*) AS count FROM constituency_import_runs"))[0].count).toBe("1");
  });
  it("permits a later correction for a different omitted source row without overwriting the first link", async () => {
    const first = await (await request()).json();
    await query(`INSERT INTO constituency_import_rows (run_id, row_number, status, created_blackbaud_constituent_id, matched_blackbaud_constituent_id, raw_row, preview)
      VALUES (42, 2, 'Applied', '456', '456', '{"Email":"other@example.test","Type":"Personal"}', '{"input":{"firstName":"Other","lastName":"Example"},"match":{"blackbaudConstituentId":"456","name":"Other Example"}}')`);
    const [{ id }] = await query("SELECT id FROM constituency_import_rows WHERE run_id=42 AND row_number=2");
    const secondResponse = await request([id]);
    expect(secondResponse.status).toBe(200);
    const second = await secondResponse.json();
    expect((await query("SELECT defaults FROM constituency_import_runs WHERE id=42"))[0].defaults.contactRecoveryRuns).toEqual({ 9: first.runId, [id]: second.runId });
  });
});
