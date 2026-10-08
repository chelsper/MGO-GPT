import { describe, it, expect, vi } from "vitest";
vi.mock("./societyLetterFinalization", () => ({ syncLetterAppeals: vi.fn() }));
vi.mock("./societyLetterPostalBatches", () => ({
  savedPostalDocument: vi.fn(),
}));
import { finishSelectedLetterAppeals } from "./societyLetterBulkAppeals";
import { unfinishedPostalAppealLetter } from "@/utils/societyLetterBulkAppeals";

function fixture() {
  const history = ["one", "two"].map((id) => ({
    id,
    batchId: id,
    channel: "post",
    status: "prepared",
    postalDocument: { id: `doc-${id}` },
    letterAppeals: {
      status: "pending",
      members: [{ id: "10", status: "pending" }],
    },
  }));
  const store = { saveLetterAppeals: vi.fn() };
  const sync = vi.fn(async () => ({ status: "complete", stop: false }));
  const read = vi.fn();
  const body = {
    deliveryIds: ["one", "two"],
    deliveryId: "one",
    confirm: true,
  };
  const state = { history };
  const run = (overrides = {}) =>
    finishSelectedLetterAppeals(
      state,
      [],
      "2026-10-08",
      { ...body, ...overrides },
      store,
      {},
      sync,
      read,
    );
  return { state, store, sync, read, run };
}
describe("selected saved letter recovery", () => {
  it("processes only the requested saved letter across batches, checking its frozen document first", async () => {
    const f = fixture();
    expect(
      await f.run({ appeal: { id: "attacker" }, members: ["99"] }),
    ).toEqual({ deliveryId: "one", status: "complete", stop: false });
    expect(f.read).toHaveBeenCalledWith({ id: "doc-one" });
    expect(f.read.mock.invocationCallOrder[0]).toBeLessThan(
      f.sync.mock.invocationCallOrder[0],
    );
    expect(f.sync).toHaveBeenCalledExactlyOnceWith(
      f.state,
      [],
      "2026-10-08",
      { action: "continue_letter_appeals", deliveryId: "one", confirm: true },
      f.store,
      {},
    );
  });
  it.each([
    { confirm: false },
    { automatic: true },
    { deliveryIds: [] },
    { deliveryIds: ["one", "one"] },
    { deliveryIds: [null] },
    { deliveryIds: "one" },
    { deliveryId: "outside" },
    { deliveryIds: Array.from({ length: 51 }, (_, i) => String(i)) },
    { deliveryIds: ["one", "missing"] },
  ])(
    "rejects invalid selection/consent before any checks or writes: %j",
    async (body) => {
      const f = fixture();
      await expect(f.run(body)).rejects.toThrow();
      expect(f.sync).not.toHaveBeenCalled();
      expect(f.read).not.toHaveBeenCalled();
    },
  );
  it.each(["mailed", "cancelled", "draft", "pending_email"])(
    "rejects a %s letter anywhere in the selection before writes",
    async (status) => {
      const f = fixture();
      f.state.history[1].status = status;
      await expect(f.run()).rejects.toMatchObject({ status: 409 });
      expect(f.sync).not.toHaveBeenCalled();
    },
  );
  it("skips already complete letters only when all required members are confirmed", async () => {
    const f = fixture();
    const item = f.state.history[0];
    item.letterAppeals = {
      status: "complete",
      members: [{ id: "10", status: "verified" }],
    };
    expect(unfinishedPostalAppealLetter(item)).toBe(false);
    expect(await f.run()).toMatchObject({ status: "complete", stop: false });
    expect(f.sync).not.toHaveBeenCalled();
    item.letterAppeals.members.push({ id: "11", status: "pending" });
    expect(unfinishedPostalAppealLetter(item)).toBe(true);
    await f.run();
    expect(f.sync).toHaveBeenCalledOnce();
  });
  it("keeps damaged saved documents in needs attention without any NXT writes", async () => {
    const f = fixture();
    f.read.mockRejectedValue(
      Object.assign(
        new Error("Saved document does not match its approved copy."),
        { status: 409 },
      ),
    );
    expect(await f.run()).toMatchObject({
      status: "needs_review",
      stop: false,
    });
    expect(f.sync).not.toHaveBeenCalled();
    expect(f.store.saveLetterAppeals).toHaveBeenCalledWith(f.state.history[0]);
  });
  it("propagates unexpected storage failures so the selection stops", async () => {
    const f = fixture();
    f.read.mockRejectedValue(new Error("storage offline"));
    await expect(f.run()).rejects.toThrow("storage offline");
    expect(f.sync).not.toHaveBeenCalled();
  });
  it("also handles legacy reserved postal letters without creating a document", async () => {
    const f = fixture();
    delete f.state.history[0].postalDocument;
    await f.run();
    expect(f.read).not.toHaveBeenCalled();
    expect(f.sync).toHaveBeenCalledOnce();
  });
});
