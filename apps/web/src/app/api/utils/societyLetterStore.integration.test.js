// @vitest-environment node
// Opt-in: use an ephemeral PostgreSQL cluster or in-memory PGlite, never DATABASE_URL.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Papa from "papaparse";
import { readStewardshipOverview } from "./stewardshipOverview";
import { letterPeriod } from "@/utils/societyLetters";
import { unsubmittedLetter } from "../../../../test/societyLetterRecoveryFixture";

const database = vi.hoisted(() => ({ query: null }));
vi.mock("./sql", () => ({
  default: (parts, ...values) => database.query(parts, values),
}));
import {
  acquireSocietyLetters,
  ensureSocietyLetterSchema,
  readSocietyLetterState,
  readPostalDocument,
} from "./societyLetterStore";

const socket = process.env.STEWARDSHIP_TEST_PG_SOCKET;
const modulePath = process.env.STEWARDSHIP_PGLITE_MODULE;
const validSocket = /^\/(?:private\/)?tmp\/stewardship-pg\.[A-Za-z0-9]+$/.test(
  socket || "",
);
const enabled = validSocket || Boolean(modulePath);
let pg;
async function execute(statement) {
  if (pg) return (await pg.exec(statement)).flatMap((result) => result.rows);
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
              "readiness",
              "period",
              "rows",
              "history",
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
    if (modulePath) {
      if (
        socket ||
        !/^\/(?:private\/)?tmp\/.+\/node_modules\/@electric-sql\/pglite\/dist\/index\.js$/.test(
          modulePath,
        )
      ) {
        throw new Error(
          "Choose only an isolated /tmp PGlite runtime or test socket",
        );
      }
      const { PGlite } = await import(/* @vite-ignore */ modulePath);
      pg = await PGlite.create();
    }
    database.query = async (parts, values) =>
      execute(
        parts.reduce(
          (sql, part, index) =>
            sql + part + (index < values.length ? literal(values[index]) : ""),
          "",
        ),
      );
    await execute(
      "CREATE TABLE IF NOT EXISTS users(id BIGINT PRIMARY KEY); INSERT INTO users(id) VALUES(1) ON CONFLICT DO NOTHING;",
    );
    await ensureSocietyLetterSchema();
    await execute(
      "CREATE TABLE IF NOT EXISTS organization_settings(id INTEGER PRIMARY KEY, time_zone TEXT); INSERT INTO organization_settings VALUES (1, 'America/New_York') ON CONFLICT DO NOTHING; CREATE TABLE IF NOT EXISTS data_change_requests(id BIGINT PRIMARY KEY, source_pending_action_id BIGINT, status TEXT, needed_by DATE);",
    );
  }, 30000);
  afterAll(async () => {
    await pg?.close();
  });
  beforeEach(async () => {
    await execute(
      "TRUNCATE data_change_requests, stewardship_letter_postal_documents, stewardship_letter_postal_batches, stewardship_letter_deliveries; UPDATE stewardship_letters SET revision=0, settings=NULL, snapshot=NULL, job=NULL, templates='{}', exclusions='[]', recipient_reviews='{}', readiness='{}', lease_token=NULL, lease_until=NULL WHERE id=1;",
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
  it("returns one unattempted letter atomically, retaining documents, wording, and other reservations", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const original = unsubmittedLetter();
    const state = await readSocietyLetterState();
    state.recipient_reviews = {
      example: { values: { salutation: "Alex and Pat" }, savedBy: 1 },
    };
    await store.save(state);
    const draft = { id: original.batchId, status: "draft", entries: [] };
    await store.createPostalDraft(draft);
    const document = {
      id: original.postalDocument.id,
      householdId: "10",
      sha256: original.postalDocument.sha256,
      content: "ZmljdGlvbmFs",
    };
    await store.savePostalDraft(draft, document);
    const other = {
      ...unsubmittedLetter(),
      id: randomUUID(),
      householdId: "20",
      members: ["20"],
      letterAppeals: {
        status: "pending",
        members: [{ id: "20", status: "pending" }],
      },
    };
    await store.approvePostalDraft({ ...draft, status: "approved" }, [
      original,
      other,
    ]);
    await store.returnLetterToReview(original);
    const saved = await readSocietyLetterState();
    const returned = saved.history.find((i) => i.id === original.id);
    expect(returned).toMatchObject({
      status: "cancelled",
      returnToReview: { by: 1, reason: "no_nxt_submission_attempted" },
      letterAppeals: original.letterAppeals,
      postalDocument: original.postalDocument,
      postalApproval: original.postalApproval,
    });
    expect(saved.history.find((i) => i.id === other.id).status).toBe(
      "prepared",
    );
    expect(saved.recipient_reviews).toEqual(state.recipient_reviews);
    expect((await readPostalDocument(document.id)).content).toBe(
      document.content,
    );
    await expect(store.returnLetterToReview(original)).rejects.toMatchObject({
      status: 409,
    });
    await store.reserve([
      { ...original, id: randomUUID(), batchId: randomUUID() },
    ]);
    expect((await readSocietyLetterState()).history).toHaveLength(3);
    await store.release();
  });
  it("compares the durable receipt and rejects stale no-attempt claims after an intent checkpoint", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const original = unsubmittedLetter();
    await store.reserve([original]);
    const attempted = structuredClone(original);
    attempted.letterAppeals.members[1].status = "uncertain";
    attempted.letterAppeals.members[1].attemptedAt = "2026-10-09T12:00:00Z";
    await store.saveLetterAppeals(attempted);
    await expect(store.returnLetterToReview(original)).rejects.toMatchObject({
      status: 409,
    });
    expect((await readSocietyLetterState()).history[0]).toMatchObject({
      status: "prepared",
      letterAppeals: attempted.letterAppeals,
    });
    await expect(store.returnLetterToReview(attempted)).rejects.toMatchObject({
      status: 409,
    });
    await store.release();
  });
  it("cannot return a letter with an expired or replaced lease", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const original = unsubmittedLetter();
    await store.reserve([original]);
    await execute(
      "UPDATE stewardship_letters SET lease_until=NOW()-INTERVAL '1 second' WHERE id=1;",
    );
    await expect(store.returnLetterToReview(original)).rejects.toMatchObject({
      status: 409,
    });
    const state = await readSocietyLetterState();
    const next = await acquireSocietyLetters(1, state.revision);
    await expect(store.returnLetterToReview(original)).rejects.toMatchObject({
      status: 409,
    });
    expect((await readSocietyLetterState()).history[0].status).toBe("prepared");
    await next.release();
  });
  it("reads the overview with real JSONB projections without changing saved work", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const state = await readSocietyLetterState();
    state.settings = { periodBasis: "calendar_year" };
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
    }).format(new Date());
    const period = letterPeriod(state.settings, day);
    const row = (id) => ({
      householdId: id,
      members: [id],
      period,
      rank: 1,
      societyKey: "ood",
    });
    state.snapshot = {
      period,
      generatedAt: new Date().toISOString(),
      rows: [row("10"), row("20"), row("30")],
    };
    state.exclusions = [row("20")];
    await store.save(state);
    await store.reserve([
      item({
        ...row("30"),
        channel: "post",
        coveredKeys: ["ood"],
        letterAppeals: {
          status: "complete",
          members: [{ id: "30", status: "verified" }],
        },
      }),
    ]);
    await store.createPostalDraft({
      id: randomUUID(),
      status: "draft",
      entries: [],
    });
    await execute(
      "INSERT INTO data_change_requests VALUES (1, 100, 'Open', '2000-01-01'), (2, 101, 'In Progress', '2100-01-01'), (3, 102, 'Completed', '2000-01-01'), (4, NULL, 'Open', '2000-01-01');",
    );
    const before = await readSocietyLetterState();
    const db = (parts, ...values) => database.query(parts, values);
    expect(await readStewardshipOverview(db)).toMatchObject({
      holding: 1,
      readyToMail: 1,
      inProgress: 1,
      hasDraft: true,
      requests: { open: 1, inProgress: 1, overdue: 1 },
    });
    expect(await readSocietyLetterState()).toEqual(before);
    await store.release();
  });
  it("saves immutable documents and atomically reserves an approved multi-household batch", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const draft = { id: randomUUID(), status: "draft", entries: [] };
    await store.createPostalDraft(draft);
    const document = {
      id: randomUUID(),
      householdId: "10",
      sha256: "hash",
      content: "ZmljdGlvbmFs",
    };
    draft.entries = [{ householdId: "10", document: { id: document.id } }];
    await store.savePostalDraft(draft, document);
    expect(await readPostalDocument(document.id)).toEqual({
      sha256: "hash",
      content: document.content,
    });
    await expect(
      store.savePostalDraft(draft, { ...document, content: "changed" }),
    ).rejects.toThrow();
    expect((await readPostalDocument(document.id)).content).toBe(
      document.content,
    );
    const revision = (await readSocietyLetterState()).revision;
    await store.release();
    const next = await acquireSocietyLetters(1, revision);
    await expect(store.savePostalDraft(draft)).rejects.toMatchObject({
      status: 409,
    });
    draft.status = "approved";
    const deliveries = [
      item({ batchId: draft.id, postalDocument: draft.entries[0].document }),
      item({ batchId: draft.id, householdId: "20" }),
    ];
    await next.approvePostalDraft(draft, deliveries);
    const saved = await readSocietyLetterState();
    expect(saved.postalDraft).toBeNull();
    expect(saved.history).toHaveLength(2);
    expect(
      saved.history.find((i) => i.householdId === "10").postalDocument,
    ).toEqual(draft.entries[0].document);
    await next.release();
  });
  it("rolls back the whole approval on a duplicate reservation and preserves its draft", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const draft = { id: randomUUID(), status: "draft", entries: [] };
    await store.createPostalDraft(draft);
    const existing = item();
    await store.reserve([existing]);
    const revision = (await readSocietyLetterState()).revision;
    await expect(
      store.approvePostalDraft({ ...draft, status: "approved" }, [
        item({ batchId: draft.id, householdId: "20" }),
        item({ batchId: draft.id }),
      ]),
    ).rejects.toThrow();
    const state = await readSocietyLetterState();
    expect(state.postalDraft).toEqual(draft);
    expect(state.revision).toBe(revision);
    expect(state.history.map((i) => i.id)).toEqual([existing.id]);
    await expect(
      store.createPostalDraft({ ...draft, id: randomUUID() }),
    ).rejects.toThrow();
    await store.release();
  });
  it("persists each letter appeal receipt across leases without altering its frozen letter", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const delivery = item({
      members: ["10", "11"],
      addressee: "Alex and Pat",
      selectionSummary: {
        version: 1,
        total: 6,
        selected: 1,
        notSelected: 5,
        excluded: 0,
        covered: 0,
        reserved: 0,
      },
      letterAppeals: {
        status: "pending",
        members: [
          { id: "10", status: "pending" },
          { id: "11", status: "pending" },
        ],
      },
    });
    await store.reserve([delivery]);
    delivery.letterAppeals.members[0].status = "uncertain";
    delivery.letterAppeals.comments =
      "Legacy audit comment retained in the saved receipt";
    delivery.letterAppeals.members[0].submittedComments = `JUMGOGPT ${delivery.id}`;
    delivery.addressee = "MUST NOT CHANGE";
    delivery.selectionSummary.total = 999;
    await store.saveLetterAppeals(delivery);
    await store.release();
    const saved = await readSocietyLetterState();
    expect(saved.history[0].addressee).toBe("Alex and Pat");
    expect(saved.history[0].selectionSummary).toMatchObject({
      total: 6,
      selected: 1,
      notSelected: 5,
    });
    expect(saved.history[0].letterAppeals.members[0].status).toBe("uncertain");
    expect(saved.history[0].letterAppeals.comments).toBe(
      delivery.letterAppeals.comments,
    );
    expect(saved.history[0].letterAppeals.members[0].submittedComments).toBe(
      `JUMGOGPT ${delivery.id}`,
    );
    expect(
      saved.history[0].letterAppeals.members[1].submittedComments,
    ).toBeUndefined();
    const next = await acquireSocietyLetters(1, saved.revision);
    await expect(store.saveLetterAppeals(delivery)).rejects.toMatchObject({
      status: 409,
    });
    delivery.letterAppeals.members[0].status = "verified";
    await next.saveLetterAppeals(delivery);
    await next.release();
    expect(
      (await readSocietyLetterState()).history[0].letterAppeals.members[0]
        .status,
    ).toBe("verified");
    expect(
      (await readSocietyLetterState()).history[0].letterAppeals.members[0]
        .submittedComments,
    ).toBe(`JUMGOGPT ${delivery.id}`);
  });
  it("does not mail partial appeal updates or cancel NXT-linked letters", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const delivery = item({
      letterAppeals: {
        status: "pending",
        members: [{ id: "10", status: "pending" }],
      },
    });
    await store.reserve([delivery]);
    await expect(
      store.finishBatch(delivery.batchId, "mailed"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      store.finishBatch(delivery.batchId, "cancelled"),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readSocietyLetterState()).history[0].status).toBe("prepared");
    delivery.letterAppeals = {
      status: "complete",
      members: [{ id: "10", status: "verified" }],
    };
    await store.saveLetterAppeals(delivery);
    await store.finishBatch(delivery.batchId, "mailed");
    await expect(store.saveLetterAppeals(delivery)).rejects.toMatchObject({
      status: 409,
    });
    expect((await readSocietyLetterState()).history[0].status).toBe("mailed");
    await store.release();
  });
  it("keeps an uncertain exclusion POST across lease release and later acquisition", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const state = await readSocietyLetterState();
    state.readiness = {
      exclusionPolicy: { periodKey: "2026", appeals: { ood: { id: "772" } } },
    };
    state.exclusions = [
      {
        id: "exclude-test",
        members: ["10", "11"],
        nxt: {
          appeal: { id: "772" },
          date: "2026-09-25",
          comments: "Pilot reason",
          members: [
            { id: "10", status: "uncertain" },
            { id: "11", status: "pending" },
          ],
        },
      },
    ];
    await store.save(state);
    await store.release();
    await expect(acquireSocietyLetters(1, 0)).rejects.toMatchObject({
      status: 409,
    });
    const reloaded = await readSocietyLetterState();
    const next = await acquireSocietyLetters(1, reloaded.revision);
    expect(reloaded.exclusions).toEqual(state.exclusions);
    expect(reloaded.readiness).toEqual(state.readiness);
    expect(reloaded.history).toEqual([]);
    await next.release();
  });
  it("persists readiness checkpoints independently without reserving letters", async () => {
    const store = await acquireSocietyLetters(1, 0);
    const state = await readSocietyLetterState();
    expect(state.readiness).toEqual({});
    state.readiness = {
      policy: { periodKey: "2026" },
      job: { id: "check", cursor: 2, status: "paused" },
      results: { sample: { status: "needs_review" } },
    };
    await store.save(state);
    const reloaded = await readSocietyLetterState();
    expect(reloaded.readiness).toEqual(state.readiness);
    reloaded.snapshot = { rows: [] };
    reloaded.recipient_reviews = { sample: { values: { salutation: "Alex" } } };
    await store.save(reloaded);
    const updated = await readSocietyLetterState();
    expect(updated.readiness).toEqual(state.readiness);
    expect(updated.history).toEqual([]);
    await store.release();
  });
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
    await execute(
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
