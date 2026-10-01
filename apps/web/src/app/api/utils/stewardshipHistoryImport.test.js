import { describe, expect, it, vi } from "vitest";
import { advanceHistoryImport, commitHistoryImport, publicHistoryState } from "./stewardshipHistoryImport";

const actor = { id: 2, name: "Staff", role: "admin", active: true };
const valid = () => ({ lease: "5c6481a7-de67-4ab2-a273-513cc062563e", job: {
  stage: "preview", actorId: "2", loadedAt: new Date().toISOString(), preview: { rows: [] },
} });

describe("gift history commit boundaries", () => {
  it.each([
    { error: "Mapping failed" }, { actorId: "3" }, { loadedAt: "invalid" },
    { loadedAt: "2000-01-01T00:00:00Z" }, { stage: "loaded" },
    { preview: { rows: [{ status: "conflict" }] } },
  ])("does not commit an unsafe saved preview: %o", async change => {
    const db = { transaction: vi.fn() };
    const state = valid(); Object.assign(state.job, change);
    expect(await commitHistoryImport(actor, state, db)).toBeNull();
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("does not lease or alter another staff member's import", async () => {
    const db = vi.fn().mockResolvedValue([{ version: 1, job: { actorId: "3", connectionKey: "another" } }]);
    await expect(advanceHistoryImport(actor, { operation: "check", version: 1 }, "https://example.test", db,
      { connection: async () => ({ connected_at: "2026-01-01T00:00:00Z" }) })).rejects.toThrow(/staff account/);
    expect(db).toHaveBeenCalledTimes(1);
    expect(db.mock.calls[0][0].join("")).toContain("SELECT");
  });
  it("never exposes the NXT job ID or connection fingerprint", () => {
    const state = { version: "2", job: { actorId: "2", connectionKey: "secret", queryJobId: "opaque", startedAt: "private" } };
    const view = publicHistoryState(state, actor);
    expect(view).toEqual({ version: 2, job: { actorId: "2", canContinue: true } });
    expect(state.job.connectionKey).toBe("secret");
  });
});
