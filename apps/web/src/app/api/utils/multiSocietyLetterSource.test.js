import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultGivingSocietyConfigurations } from "./givingSocietyDefinitions";
import {
  constituentQueryDefinition,
  constituentQueryOutput,
  societyQuerySettings,
} from "../../../../test/societyQueryFixture";
import { templateFixture } from "../../../../test/societyLetterFixture";
import { advanceQueryList } from "./constituentQueryList";
import { getBlackbaudSavedQueryById } from "./blackbaud";
import {
  letterWorkspace,
  letterSourceSignature,
  prepareLetterBatch,
  refreshLetterSource,
  saveLetterTemplate,
} from "./societyLetterWorkflow";
import { letterPeriod } from "@/utils/societyLetters";

vi.mock("./constituentQueryList", () => ({ advanceQueryList: vi.fn() }));
vi.mock("./blackbaud", () => ({ getBlackbaudSavedQueryById: vi.fn() }));
vi.mock("./sendSubmissionEmail", () => ({ buildResendFromAddress: vi.fn() }));
const definitions = getDefaultGivingSocietyConfigurations();
const today = "2026-09-24";
const context = { user: { id: 1 }, origin: "https://example.org" };
const setup = () => {
  const state = {
    revision: 0,
    settings: societyQuerySettings(),
    history: [],
    templates: {},
    job: null,
    snapshot: {
      rows: [],
      period: letterPeriod(societyQuerySettings(), today),
      generatedAt: "2026-09-23T12:00:00Z",
      signature: "old",
    },
  };
  const store = { save: vi.fn(), reserve: vi.fn() };
  const run = (body = { action: "refresh" }, day = today, ctx = context) =>
    refreshLetterSource(state, definitions, day, body, store, ctx);
  const resume = () => run({ action: "resume", jobId: state.job.id });
  return { state, store, run, resume };
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T13:00:00Z"));
  getBlackbaudSavedQueryById.mockResolvedValue(constituentQueryDefinition());
  advanceQueryList.mockImplementation(async ({ job, source }) => ({
    job: { ...job, stage: "complete" },
    snapshot: constituentQueryOutput(
      source.queryId === "100"
        ? [{ constituentId: "11", spouseId: "10" }]
        : [{ constituentId: "10", spouseId: "11" }],
    ),
  }));
});
afterEach(() => vi.useRealTimers());

describe("bounded multiple society refresh", () => {
  it("checks one source per request and publishes only a complete combined snapshot", async () => {
    const { state, run, resume, store } = setup();
    const previous = state.snapshot;
    await run();
    expect(advanceQueryList).toHaveBeenCalledTimes(1);
    expect(state.snapshot).toBe(previous);
    expect(state.job).toMatchObject({ status: "running", sourceIndex: 1 });
    await resume();
    expect(advanceQueryList).toHaveBeenCalledTimes(2);
    expect(getBlackbaudSavedQueryById).toHaveBeenCalledTimes(4);
    expect(state.job.status).toBe("complete");
    expect(state.snapshot.rows).toHaveLength(1);
    expect(state.snapshot.rows[0].societyKey).toBe("presidents_society");
    expect(state.snapshot.sources).toHaveLength(2);
    expect(state.snapshot.signature).toBe(
      letterSourceSignature(state, definitions),
    );
    expect(store.reserve).not.toHaveBeenCalled();
    expect(advanceQueryList.mock.calls.map(([args]) => args.source)).toEqual([
      { source: "query", queryId: "100", leadFundraiser: { enabled: false } },
      { source: "query", queryId: "101", leadFundraiser: { enabled: false } },
    ]);
  });
  it("resumes a running source without recreating it or rechecking initial metadata", async () => {
    const { state, run, resume } = setup();
    advanceQueryList.mockImplementationOnce(async ({ job }) => ({
      job: { ...job, stage: "query", queryJobId: "nxt-1" },
      snapshot: null,
    }));
    await run();
    expect(state.job.sourceIndex).toBe(0);
    expect(getBlackbaudSavedQueryById).toHaveBeenCalledTimes(1);
    await resume();
    expect(advanceQueryList.mock.calls[1][0].job.stage).toBe("query");
    expect(advanceQueryList.mock.calls[1][0].job.queryJobId).toBe("nxt-1");
    expect(getBlackbaudSavedQueryById).toHaveBeenCalledTimes(2);
    expect(state.job.sourceIndex).toBe(1);
  });
  it("retains all prior data if a later source fails instead of publishing a partial cohort", async () => {
    const { state, run, resume } = setup();
    const previous = state.snapshot;
    state.history.push({ id: "saved-letter" });
    await run();
    advanceQueryList.mockRejectedValueOnce(new Error("timeout"));
    await resume();
    expect(state.snapshot).toBe(previous);
    expect(state.history).toEqual([{ id: "saved-letter" }]);
    expect(state.job.status).toBe("needs_review");
    expect(state.job.message).toMatch(/Order of the Dolphin/);
    await expect(resume()).rejects.toThrow(/uncertain/);
    expect(advanceQueryList).toHaveBeenCalledTimes(2);
  });
  it("verifies each source's system IDs before query execution", async () => {
    const { state, run } = setup();
    getBlackbaudSavedQueryById.mockResolvedValueOnce({ select_fields: [] });
    await run();
    expect(advanceQueryList).not.toHaveBeenCalled();
    expect(state.job.message).toMatch(/System Record ID/);
  });
  it("restores the previous preview if publishing the complete snapshot fails", async () => {
    const { state, run, resume, store } = setup();
    const previous = state.snapshot;
    await run();
    store.save.mockImplementation(async () => {
      if (state.job.status === "complete") throw new Error("save failed");
    });
    await resume();
    expect(state.snapshot).toBe(previous);
    expect(state.job.status).toBe("needs_review");
  });
  it("rejects a missing verification time from any source", async () => {
    const { state, run, resume } = setup();
    const previous = state.snapshot;
    await run();
    advanceQueryList.mockImplementationOnce(async ({ job }) => ({
      job,
      snapshot: { ...constituentQueryOutput(), generatedAt: undefined },
    }));
    await resume();
    expect(state.snapshot).toBe(previous);
    expect(state.job.status).toBe("needs_review");
    expect(state.job.message).toMatch(/verification time/);
  });
  it("retains the previous snapshot if metadata changes or spouses conflict across sources", async () => {
    const { state, run, resume } = setup();
    const previous = state.snapshot;
    getBlackbaudSavedQueryById
      .mockResolvedValueOnce(constituentQueryDefinition())
      .mockResolvedValueOnce({
        ...constituentQueryDefinition(),
        filter_fields: [{ changed: true }],
      });
    await run();
    expect(state.job.message).toMatch(/changed during/);
    expect(state.snapshot).toBe(previous);
    await run({ action: "restart", confirm: true });
    advanceQueryList.mockImplementationOnce(async ({ job }) => ({
      job,
      snapshot: constituentQueryOutput([
        { constituentId: "10", spouseId: "12" },
      ]),
    }));
    await resume();
    expect(state.job.message).toMatch(/conflicting spouse/);
    expect(state.snapshot).toBe(previous);
  });
  it("cannot replay an uncertain job submission without explicit restart", async () => {
    const { state, run, resume, store } = setup();
    advanceQueryList.mockImplementationOnce(async () => {
      expect(state.job.status).toBe("starting");
      expect(store.save).toHaveBeenCalled();
      throw new Error("response lost after NXT accepted job");
    });
    await run();
    await expect(resume()).rejects.toThrow(/uncertain/);
    await expect(run({ action: "restart" })).rejects.toThrow(/Confirm/);
    expect(advanceQueryList).toHaveBeenCalledTimes(1);
    await run({ action: "restart", confirm: true });
    expect(advanceQueryList).toHaveBeenCalledTimes(2);
  });
  it("requires matching owner, revision context and period when resuming", async () => {
    const { state, run } = setup();
    await run();
    const body = { action: "resume", jobId: state.job.id };
    await expect(
      run(body, today, { ...context, user: { id: 2 } }),
    ).rejects.toThrow(/context/);
    await expect(run(body, "2027-01-01")).rejects.toThrow(
      /qualification dates/,
    );
    state.settings.societySources[1].queryId = "999";
    await expect(run(body)).rejects.toThrow(/context/);
    expect(advanceQueryList).toHaveBeenCalledTimes(1);
  });
  it("keeps the oldest source timestamp rather than overstating freshness", async () => {
    const { state, run, resume } = setup();
    advanceQueryList.mockImplementationOnce(async ({ job }) => ({
      job,
      snapshot: {
        ...constituentQueryOutput(),
        generatedAt: "2026-09-23T23:00:00Z",
      },
    }));
    await run();
    await resume();
    expect(state.snapshot.generatedAt).toBe("2026-09-23T23:00:00Z");
  });
  it("does not submit queries or make letters deliverable just by loading the workspace", async () => {
    const { state, run, resume, store } = setup();
    await run();
    await resume();
    vi.clearAllMocks();
    const view = letterWorkspace(state, definitions, today);
    expect(view.sourceIssue).toMatch(/preview only/);
    expect(view.templates).toHaveLength(2);
    expect(view.sources).toHaveLength(2);
    expect(advanceQueryList).not.toHaveBeenCalled();
    expect(getBlackbaudSavedQueryById).not.toHaveBeenCalled();
    await expect(
      prepareLetterBatch(
        state,
        definitions,
        today,
        { householdIds: ["10"], channel: "post", confirm: true },
        store,
        1,
      ),
    ).rejects.toThrow(/preview only/);
    expect(store.reserve).not.toHaveBeenCalled();
  });
  it("permits separate annual templates before query setup without changing history or source", async () => {
    const { state, store } = setup();
    state.settings = null;
    state.snapshot = null;
    expect(letterWorkspace(state, definitions, today).templates).toHaveLength(
      2,
    );
    for (const definition of definitions) {
      await saveLetterTemplate(
        state,
        { societyKey: definition.key, template: templateFixture() },
        today,
        store,
        1,
        definitions,
      );
    }
    expect(Object.keys(state.templates)).toHaveLength(2);
    expect(state.settings).toBeNull();
    expect(state.history).toEqual([]);
    await expect(
      saveLetterTemplate(
        state,
        { societyKey: "lifetime", template: templateFixture() },
        today,
        store,
        1,
        [{ key: "lifetime", active: true, basis: "lifetime" }],
      ),
    ).rejects.toThrow(/annual/);
    expect(advanceQueryList).not.toHaveBeenCalled();
  });
});
