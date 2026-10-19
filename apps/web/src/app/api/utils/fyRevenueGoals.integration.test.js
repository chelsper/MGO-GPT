// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Live SQL forbidden"); }) }));
import { publishRevenueState, readRevenueState } from "./fyRevenueGoals";
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
});
