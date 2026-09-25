// Opt-in: use an ephemeral local PostgreSQL cluster, never DATABASE_URL.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Papa from "papaparse";

const database = vi.hoisted(() => ({ query: null }));
vi.mock("./sql", () => ({
  default: (parts, ...values) => database.query(parts, values),
}));
import {
  acquireSocietyLetters,
  ensureSocietyLetterSchema,
  readSocietyLetterState,
} from "./societyLetterStore";

const socket = process.env.STEWARDSHIP_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/stewardship-pg\.[A-Za-z0-9]+$/.test(
  socket || "",
);
function execute(statement) {
  const output = execFileSync(
    process.env.STEWARDSHIP_TEST_PSQL || "psql",
    [
      "-X",
      "--no-password",
      "-q",
      "--csv",
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      socket,
      "-p",
      "55439",
      "-d",
      "stewardship_test",
    ],
    { input: statement, encoding: "utf8" },
  );
  return output.trim()
    ? Papa.parse(output.trim(), { header: true }).data.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            [
              "settings",
              "templates",
              "snapshot",
              "job",
              "payload",
              "exclusions",
              "recipient_reviews",
            ].includes(key)
              ? value
                ? JSON.parse(value)
                : null
              : key === "revision"
                ? Number(value)
                : value || null,
          ]),
        ),
      )
    : [];
}
function literal(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}
describe.skipIf(!enabled)("society letter PostgreSQL safeguards", () => {
  beforeAll(async () => {
    database.query = async (parts, values) =>
      execute(
        parts.reduce(
          (sql, part, index) =>
            sql + part + (index < values.length ? literal(values[index]) : ""),
          "",
        ),
      );
    execute(
      "CREATE TABLE IF NOT EXISTS users(id BIGINT PRIMARY KEY); INSERT INTO users(id) VALUES(1) ON CONFLICT DO NOTHING;",
    );
    await ensureSocietyLetterSchema();
  });
  beforeEach(() => {
    execute(
      "TRUNCATE stewardship_letter_deliveries; UPDATE stewardship_letters SET revision=0, settings=NULL, snapshot=NULL, job=NULL, templates='{}', exclusions='[]', recipient_reviews='{}', lease_token=NULL, lease_until=NULL WHERE id=1;",
    );
  });
  function item(overrides = {}) {
    return {
      id: randomUUID(),
      batchId: randomUUID(),
      householdId: "10",
      period: { key: "2026" },
      societyKey: "presidents",
      channel: "post",
      status: "prepared",
      ...overrides,
    };
  }
  it("keeps recipient choices across snapshot replacement without changing delivery history", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const state = await readSocietyLetterState();
    expect(state.recipient_reviews).toEqual({});
    state.recipient_reviews = {
      sample: {
        values: { recipientConstituentId: "10", salutation: "Alex" },
        savedBy: 1,
      },
    };
    await store.save(state);
    const reloaded = await readSocietyLetterState();
    expect(reloaded.recipient_reviews).toEqual(state.recipient_reviews);
    reloaded.snapshot = { rows: [] };
    await store.save(reloaded);
    const refreshed = await readSocietyLetterState();
    expect(refreshed.recipient_reviews).toEqual(state.recipient_reviews);
    expect(refreshed.history).toEqual([]);
    await store.release();
  });
  it("persists exclusions independently of refreshed membership and retains restoration audit", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const state = await readSocietyLetterState();
    state.exclusions = [
      {
        id: "hold",
        householdId: "10",
        members: ["10", "11"],
        reason: "Wait",
        excludedBy: 1,
      },
    ];
    await store.save(state);
    const reloaded = await readSocietyLetterState();
    expect(reloaded.exclusions).toEqual(state.exclusions);
    reloaded.snapshot = { rows: [] };
    await store.save(reloaded);
    expect((await readSocietyLetterState()).exclusions).toEqual(
      state.exclusions,
    );
    reloaded.exclusions[0].restoredBy = 1;
    reloaded.exclusions[0].restoredAt = "2026-09-24T14:00:00Z";
    await store.save(reloaded);
    expect((await readSocietyLetterState()).exclusions[0].restoredBy).toBe(1);
    expect((await readSocietyLetterState()).history).toEqual([]);
    await store.release();
    await expect(acquireSocietyLetters(1, 0)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("allows one lease and rejects stale revisions after release", async () => {
    const store = await acquireSocietyLetters(1, 0);
    await expect(acquireSocietyLetters(1, 0)).rejects.toMatchObject({
      status: 409,
    });
    const state = await readSocietyLetterState();
    state.settings = { queryId: "123" };
    await store.save(state);
    await store.release();
    expect(state.revision).toBe(1);
    await expect(acquireSocietyLetters(1, 0)).rejects.toMatchObject({
      status: 409,
    });
    await (await acquireSocietyLetters(1, 1)).release();
  });
  it("reserves a batch atomically and rolls back every row on a duplicate", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const first = item();
    await store.reserve([first]);
    await expect(
      store.reserve([item({ householdId: "20" }), item()]),
    ).rejects.toThrow();
    const state = await readSocietyLetterState();
    expect(state.history).toHaveLength(1);
    expect(state.revision).toBe(1);
    await store.release();
  });
  it("changes only the expected state and does not release an uncertain email", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const letter = item({ channel: "email", status: "pending_email" });
    await store.reserve([letter]);
    await store.transition(letter, "pending_email", "sending");
    await expect(
      store.transition(letter, "pending_email", "sending"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      store.finishBatch(letter.batchId, "cancelled"),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readSocietyLetterState()).history[0].status).toBe("sending");
    await store.release();
  });
  it("cancels only unsent letters and allows a reviewed replacement", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const first = item();
    await store.reserve([first]);
    await store.finishBatch(first.batchId, "cancelled");
    await store.reserve([item()]);
    expect(
      (await readSocietyLetterState()).history.map((row) => row.status).sort(),
    ).toEqual(["cancelled", "prepared"]);
    await store.release();
  });
  it("rejects all mutations after lease expiry", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const first = item();
    await store.reserve([first]);
    execute(
      "UPDATE stewardship_letters SET lease_until=NOW()-INTERVAL '1 second' WHERE id=1;",
    );
    await expect(
      store.reserve([item({ householdId: "20" })]),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      store.transition(first, "prepared", "mailed"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      store.save(await readSocietyLetterState()),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readSocietyLetterState()).history[0].status).toBe("prepared");
    await store.release();
  });
});
