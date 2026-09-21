import { beforeEach, expect, it, vi } from "vitest";

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn().mockResolvedValue([]) }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
let ensureAppSchema;
it("adds durable create receipts with immutable duplicate keys and a non-expiring unresolved guard", async () => {
  await ensureAppSchema();
  const query = sqlMock.mock.calls.map(([parts]) => parts.join(" ")).find(text => text.includes("DO $nxt_create_receipts_schema$"));
  expect(query).toContain("pg_advisory_xact_lock(734019, 6)");
  expect(query).toContain("UNIQUE (owner_user_id, kind, request_hash)");
  expect(query).toContain("UNIQUE (owner_user_id, kind, payload_hash)");
  expect(query).toContain("WHERE state IN ('processing', 'review', 'created')");
  expect(query).not.toMatch(/DELETE FROM|DROP TABLE|lease_until/);
});
beforeEach(async () => {
  vi.resetModules();
  sqlMock.mockReset().mockResolvedValue([]);
  ({ default: ensureAppSchema } = await import("./ensureAppSchema"));
});

it("migrates only the old Team Standings title, preserving report access and snapshots", async () => {
  await ensureAppSchema();
  const queries = sqlMock.mock.calls.map(([strings]) => strings.join(" ").replace(/\s+/g, " ").trim());
  const rename = queries.find((query) => query.startsWith("UPDATE report_configurations SET title = 'Team Standings'"));
  expect(rename).toBeDefined();
  expect(rename).toContain("WHERE report_key = 'executive-team-standings'");
  expect(rename).toContain("AND LOWER(TRIM(title)) = 'executive team standings'");
  expect(rename).not.toMatch(/visibility|specific_user_ids|snapshot|data_configuration/i);
  const initial = queries.find((query) => query.startsWith("INSERT INTO report_configurations") && query.includes("'executive-team-standings'"));
  expect(initial).toContain("'Team Standings'");
  expect(initial).toContain("ON CONFLICT (report_key) DO NOTHING");
});

it("serializes new contact schema creation inside one database transaction", async () => {
  await ensureAppSchema();
  const queries = sqlMock.mock.calls.map(([strings]) => strings.join(" "));
  const contact = queries.filter(query => query.includes("CREATE TABLE IF NOT EXISTS portfolio_contact_refresh_gates"));
  expect(contact).toHaveLength(1);
  expect(contact[0]).toContain("DO $contact_schema$");
  expect(contact[0]).toContain("pg_advisory_xact_lock(734019, 1)");
  expect(contact[0]).toContain("CREATE INDEX IF NOT EXISTS idx_blackbaud_constituent_summary_cache_contact");
});

it("retries schema initialization after a failure instead of caching the rejection", async () => {
  sqlMock.mockRejectedValueOnce(new Error("temporary catalog conflict"));
  await expect(ensureAppSchema()).rejects.toThrow("temporary catalog conflict");
  await expect(ensureAppSchema()).resolves.toBeUndefined();
  const calls = sqlMock.mock.calls.length;
  await ensureAppSchema();
  expect(sqlMock).toHaveBeenCalledTimes(calls);
});

it("serializes the activity snapshots, queue and gate schema in one transaction", async () => {
  await ensureAppSchema();
  const queries = sqlMock.mock.calls.map(([strings]) => strings.join(" "));
  const activity = queries.filter(query => query.includes("CREATE TABLE IF NOT EXISTS portfolio_activity_snapshots"));
  expect(activity).toHaveLength(1);
  expect(activity[0]).toContain("DO $activity_schema$");
  expect(activity[0]).toContain("pg_advisory_xact_lock(734019, 2)");
  expect(activity[0]).toContain("CREATE TABLE IF NOT EXISTS portfolio_activity_refresh_gates");
  expect(activity[0]).toContain("ADD COLUMN IF NOT EXISTS catchup_call_count INTEGER NOT NULL DEFAULT 0");
  expect(activity[0]).toContain("PRIMARY KEY (workspace_user_id, origin, constituent_id, kind)");
  expect(activity[0]).toContain("ALTER TABLE portfolio_activity_snapshots ADD COLUMN IF NOT EXISTS activity_details JSONB");
  expect(activity[0]).toContain("ALTER TABLE portfolio_activity_snapshots ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ");
  expect(activity[0]).not.toContain("UPDATE portfolio_activity_snapshots");
});

it("shares one initialization across concurrent requests on a worker", async () => {
  await Promise.all([ensureAppSchema(), ensureAppSchema(), ensureAppSchema()]);
  const queries = sqlMock.mock.calls.map(([strings]) => strings.join(" "));
  expect(queries.filter(query => query.includes("CREATE TABLE IF NOT EXISTS users ("))).toHaveLength(1);
});

it("adds an append-only organization settings audit without changing existing profiles or report snapshots", async () => {
  await ensureAppSchema();
  const query = sqlMock.mock.calls.map(([strings]) => strings.join(" ")).find(text => text.includes("DO $organization_audit_schema$"));
  expect(query).toContain("pg_advisory_xact_lock(734019, 3)");
  expect(query).toContain("CREATE TABLE IF NOT EXISTS organization_settings_audits");
  expect(query).not.toMatch(/UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|report_snapshots_cache/);
});

it("adds only an idempotent locked metric metadata table without seeding or rewriting reports", async () => {
  await ensureAppSchema();
  const query = sqlMock.mock.calls.map(([strings]) => strings.join(" ")).find(text => text.includes("DO $metric_library_schema$"));
  expect(query).toContain("pg_advisory_xact_lock(734019, 4)");
  expect(query).toContain("source_id TEXT NOT NULL UNIQUE");
  expect(query).toContain("published BOOLEAN NOT NULL DEFAULT FALSE");
  expect(query).not.toMatch(/INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|report_snapshots_cache/);
});

it("adds owner-scoped personal layout storage without report data or new refresh jobs", async () => {
  await ensureAppSchema();
  const query = sqlMock.mock.calls.map(([strings]) => strings.join(" ")).find(text => text.includes("DO $personal_dashboard_schema$"));
  expect(query).toContain("pg_advisory_xact_lock(734019, 5)");
  expect(query).toContain("user_id BIGINT PRIMARY KEY REFERENCES users(id)");
  expect(query).toContain("revision BIGINT NOT NULL DEFAULT 1");
  expect(query).not.toMatch(/INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|report_snapshots_cache/);
});
it("adds a nullable action-finalization marker without falsely marking historical receipts complete", async () => {
  await ensureAppSchema();
  const query = sqlMock.mock.calls.map(([parts]) => parts.join(" ")).find(text => text.includes("DO $pending_action_finalization_schema$"));
  expect(query).toContain("pg_advisory_xact_lock(734019, 7)");
  expect(query).toContain("ADD COLUMN IF NOT EXISTS local_finalized_at TIMESTAMPTZ");
  expect(query).not.toMatch(/DEFAULT|UPDATE pending_action_nxt_receipts|DELETE FROM|DROP TABLE/);
});
