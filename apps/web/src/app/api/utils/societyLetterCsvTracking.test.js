import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { templateFixture } from "../../../../test/societyLetterFixture";
import { societyQuerySettings } from "../../../../test/societyQueryFixture";
import { validateLetterTemplate } from "./societyLetterDocuments";
import { getDefaultGivingSocietyConfigurations } from "./givingSocietyDefinitions";
import { letterPeriod, letterHierarchy } from "@/utils/societyLetters";
import {
  letterSourceSignature,
  letterWorkspace,
  updateLetterRecipient,
} from "./societyLetterWorkflow";
import {
  createTrackedCsvRun,
  assertCsvRun,
  confirmCsvLetters,
  mailSelectedCsvLetters,
} from "./societyLetterCsvTracking";
import { completedCsvFixture } from "../../../../test/societyLetterCsvTrackingFixture";

vi.mock("./blackbaud", () => ({
  blackbaudApiFetch: vi.fn(() => {
    throw new Error("No live calls allowed");
  }),
  isBlackbaudQuotaExceededError: () => false,
}));
const today = "2026-10-12",
  ctx = { user: { id: 1 } };
const definitions = getDefaultGivingSocietyConfigurations();
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function fixture(count = 1) {
  const settings = societyQuerySettings(),
    period = letterPeriod(settings, today);
  const template = {
    ...validateLetterTemplate(templateFixture()),
    societyKey: "presidents_society",
    sequence: 1,
  };
  const state = {
    revision: 1,
    settings,
    templates: { [template.version]: template },
    history: [],
    exclusions: [],
    readiness: {},
  };
  state.readiness.policy = {
    periodKey: period.key,
    hierarchySignature: hash(
      letterHierarchy(definitions, settings).map((d) => [
        d.key,
        d.displayOrder,
      ]),
    ),
    appeals: Object.fromEntries(
      settings.societyKeys.map((key, index) => [
        key,
        { id: String(100 + index), description: `2026 ${key} letter` },
      ]),
    ),
  };
  state.snapshot = {
    signature: letterSourceSignature(state, definitions),
    period,
    generatedAt: new Date().toISOString(),
    sources: settings.societyKeys.map((societyKey) => ({ societyKey })),
    rows: Array.from({ length: count }, (_, index) => ({
      householdId: String(10 + index * 2),
      members: [String(10 + index * 2), String(11 + index * 2)],
      address: "10 Test St\nJacksonville, FL 32211",
      period,
      sourceMode: "society_queries",
      name: `Alex & Pat Example ${index}`,
      societyKey: "presidents_society",
      societyName: "President's Society",
      qualifiedKeys: settings.societyKeys,
      coveredKeys: settings.societyKeys,
      rank: 0,
      recipientCandidates: [
        {
          constituentId: String(10 + index * 2),
          addressee: "Alex & Pat Example",
          salutation: "Alex and Pat",
          address: "10 Test St\nJacksonville, FL 32211",
        },
      ],
    })),
  };
  const store = {
    save: vi.fn(),
    reserve: vi.fn(async (items) => {
      state.history.push(...structuredClone(items));
    }),
    createCsvRun: vi.fn(),
  };
  for (const row of state.snapshot.rows) {
    await updateLetterRecipient(
      state,
      definitions,
      today,
      {
        householdId: row.householdId,
        reviewToken: letterWorkspace(state, definitions, today).rows.find(
          (item) => item.householdId === row.householdId,
        ).recipientReview.token,
        recipientConstituentId: row.householdId,
        addressConstituentId: row.householdId,
        addressee: "Alex & Pat Example",
        salutation: "Alex and Pat",
        address: "10 Test St\nJacksonville, FL 32211",
        email: "",
        confirm: true,
      },
      store,
      1,
    );
  }
  const request = {
    revision: state.revision,
    societyKey: "presidents_society",
    letterDate: today,
    periodKey: period.key,
    householdIds: state.snapshot.rows.map((row) => row.householdId),
  };
  await createTrackedCsvRun(state, definitions, today, request, store, ctx);
  const run = store.createCsvRun.mock.calls[0][0];
  const body = {
    runId: run.id,
    sha256: run.sha256,
    householdIds: request.householdIds,
    confirm: true,
  };
  return { state, store, run, body };
}
beforeEach(() => vi.clearAllMocks());
describe("durable CSV workflow", () => {
  it("saves all merge rows without reserving letters, marking mailed or contacting NXT", async () => {
    const { state, store, run } = await fixture(2);
    expect(assertCsvRun(run)).toBe(run);
    expect(run.csv).toContain('"10|11"');
    expect(run.count).toBe(2);
    expect(store.createCsvRun).toHaveBeenCalledOnce();
    expect(store.createCsvRun.mock.calls[0][1]).not.toHaveProperty("csv");
    expect(store.reserve).not.toHaveBeenCalled();
    expect(state.history).toEqual([]);
  });
  it("records exactly the confirmed subset, both household members and highest society, without making another document", async () => {
    const { state, store, run, body } = await fixture(2);
    const ids = await confirmCsvLetters(
      state,
      definitions,
      today,
      { ...body, householdIds: ["10"] },
      store,
      ctx,
      run,
    );
    expect(ids).toHaveLength(1);
    expect(state.history).toHaveLength(1);
    const item = state.history[0];
    expect(item).toMatchObject({
      members: ["10", "11"],
      status: "prepared",
      societyKey: "presidents_society",
      coveredKeys: ["presidents_society", "order_of_the_dolphin"],
      letterDate: today,
      csvMailMerge: { runId: run.id, csvSha256: run.sha256, confirmedBy: 1 },
    });
    expect(item.letterAppeals.members).toEqual([
      { id: "10", status: "pending" },
      { id: "11", status: "pending" },
    ]);
    expect(item.postalDocument).toBeUndefined();
    expect(item.mailDispatch).toBeUndefined();
    expect(
      await confirmCsvLetters(
        state,
        definitions,
        today,
        { ...body, householdIds: ["10"] },
        store,
        ctx,
        run,
      ),
    ).toEqual(ids);
    expect(store.reserve).toHaveBeenCalledOnce();
  });
  it.each([
    "no_confirmation",
    "automatic",
    "wrong_hash",
    "duplicate",
    "unknown",
    "empty",
    "too_many",
    "changed_csv",
    "changed_review",
    "expired_review",
    "new_template",
    "changed_period",
    "new_member",
    "held",
    "draft",
    "returned",
  ])("fails closed before reservation: %s", async (mode) => {
    const { state, store, run, body } = await fixture();
    if (mode === "no_confirmation") body.confirm = false;
    if (mode === "automatic") body.automatic = true;
    if (mode === "wrong_hash") body.sha256 = "b".repeat(64);
    if (mode === "duplicate") body.householdIds = ["10", "10"];
    if (mode === "unknown") body.householdIds = ["20"];
    if (mode === "empty") body.householdIds = [];
    if (mode === "too_many")
      body.householdIds = Array.from({ length: 51 }, (_, index) =>
        String(index),
      );
    if (mode === "changed_csv") run.csv += "tamper";
    if (mode === "changed_review")
      Object.values(state.recipient_reviews)[0].values.salutation = "Different";
    if (mode === "expired_review")
      Object.values(state.recipient_reviews)[0].savedAt = "2025-01-01";
    if (mode === "new_template") {
      const template = Object.values(state.templates)[0];
      state.templates.new = {
        ...template,
        sequence: 2,
        version: "b".repeat(64),
      };
    }
    if (mode === "changed_period") run.periodKey = "2025";
    if (mode === "new_member") state.snapshot.rows[0].members.push("99");
    if (mode === "held")
      state.history.push({
        ...state.snapshot.rows[0],
        id: "other",
        status: "prepared",
      });
    if (mode === "draft")
      state.postalDraft = { entries: [{ householdId: "10" }] };
    if (mode === "returned")
      state.history.push({
        householdId: "10",
        status: "cancelled",
        csvMailMerge: { runId: run.id },
      });
    await expect(
      confirmCsvLetters(state, definitions, today, body, store, ctx, run),
    ).rejects.toThrow();
    expect(store.reserve).not.toHaveBeenCalled();
  });
  it("keeps unchanged exports valid after a membership timestamp refresh", async () => {
    const { state, store, run, body } = await fixture();
    state.snapshot.generatedAt = new Date(Date.now() - 1000).toISOString();
    await expect(
      confirmCsvLetters(state, definitions, today, body, store, ctx, run),
    ).resolves.toHaveLength(1);
  });
  it("validates every selected row before reserving any", async () => {
    const { state, store, run, body } = await fixture(2);
    state.snapshot.rows[1].members = ["99"];
    await expect(
      confirmCsvLetters(state, definitions, today, body, store, ctx, run),
    ).rejects.toThrow();
    expect(store.reserve).not.toHaveBeenCalled();
  });
  it("requires explicit dispatch and complete appeals for selected CSV letters only", async () => {
    const item = completedCsvFixture();
    const state = { history: [item] },
      store = { mailSelectedLetters: vi.fn() };
    const body = {
      batchId: item.batchId,
      deliveryIds: [item.id],
      confirm: true,
    };
    await expect(
      mailSelectedCsvLetters(state, { ...body, confirm: false }, store),
    ).rejects.toThrow();
    await expect(
      mailSelectedCsvLetters(state, { ...body, automatic: true }, store),
    ).rejects.toThrow();
    expect(store.mailSelectedLetters).not.toHaveBeenCalled();
    await mailSelectedCsvLetters(state, body, store);
    expect(store.mailSelectedLetters).toHaveBeenCalledWith(
      item.batchId,
      [item],
      "csv",
    );
  });
});
