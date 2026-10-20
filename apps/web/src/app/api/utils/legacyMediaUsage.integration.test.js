// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn(() => { throw new Error("Live SQL forbidden"); }) }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { reserveMediaUsage } from "./legacyEndpointAccess";
const modulePath = process.env.CAMPAIGN_PGLITE_MODULE;
const suite = modulePath ? describe : describe.skip;
suite("shared media limits in isolated PostgreSQL", () => {
  let pg;
  beforeAll(async () => {
    if (!modulePath?.startsWith("/tmp/") || !modulePath.endsWith("/dist/index.js")) throw new Error("Use isolated /tmp PGlite runtime");
    const { PGlite } = await import(/* @vite-ignore */ modulePath);
    pg = await PGlite.create();
    await pg.exec("CREATE TABLE report_snapshots_cache(report_key TEXT PRIMARY KEY,payload JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    sqlMock.mockImplementation(async (strings, ...params) => (await pg.query(
      strings.reduce((text, part, i) => text + part + (i < params.length ? `$${i + 1}` : ""), ""), params,
    )).rows);
  }, 30_000);
  afterAll(async () => { await pg?.close(); });
  it("allows exactly 60 simultaneous claims and isolates users", async () => {
    const results = await Promise.allSettled(Array.from({ length: 65 }, () => reserveMediaUsage({ id: 7 })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(60);
    expect(results.filter(result => result.status === "rejected").every(result => result.reason.status === 429)).toBe(true);
    await expect(reserveMediaUsage({ id: 8 })).resolves.toBeUndefined();
  });
  it("resets expired windows without extending them on subsequent requests", async () => {
    await pg.exec("UPDATE report_snapshots_cache SET updated_at = NOW() - INTERVAL '11 minutes' WHERE report_key='legacy-media-usage:v1:7'");
    await reserveMediaUsage({ id: 7 });
    const first = (await pg.query("SELECT * FROM report_snapshots_cache WHERE report_key='legacy-media-usage:v1:7'")).rows[0];
    await reserveMediaUsage({ id: 7 });
    const second = (await pg.query("SELECT * FROM report_snapshots_cache WHERE report_key='legacy-media-usage:v1:7'")).rows[0];
    expect(first.payload.count).toBe(1);
    expect(second.payload.count).toBe(2);
    expect(first.updated_at).toEqual(second.updated_at);
  });
});
