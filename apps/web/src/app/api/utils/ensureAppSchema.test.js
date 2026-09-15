import { beforeEach, expect, it, vi } from "vitest";

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn().mockResolvedValue([]) }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
let ensureAppSchema;
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

it("shares one initialization across concurrent requests on a worker", async () => {
  await Promise.all([ensureAppSchema(), ensureAppSchema(), ensureAppSchema()]);
  const queries = sqlMock.mock.calls.map(([strings]) => strings.join(" "));
  expect(queries.filter(query => query.includes("CREATE TABLE IF NOT EXISTS users ("))).toHaveLength(1);
});
