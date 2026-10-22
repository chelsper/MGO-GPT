import { describe, expect, it, vi } from "vitest";
import { completedLetter } from "../../../../test/societyLetterDispatchFixture";
import { mailSelectedLetters } from "./societyLetterDispatch";

describe("record selected postal dispatch", () => {
  function fixture() {
    const first = completedLetter();
    const second = completedLetter({ id: "second" });
    return {
      state: {
        history: [
          first,
          second,
          completedLetter({
            id: "blocked",
            letterAppeals: { status: "pending" },
          }),
        ],
      },
      body: {
        batchId: first.batchId,
        deliveryIds: [first.id, second.id],
        confirm: true,
      },
      store: { mailSelectedLetters: vi.fn() },
      read: vi.fn(),
    };
  }
  it("verifies all documents before one scoped write; does not render or perform NXT calls", async () => {
    const f = fixture();
    f.read.mockImplementation(async () =>
      expect(f.store.mailSelectedLetters).not.toHaveBeenCalled(),
    );
    const before = structuredClone(f.state);
    await mailSelectedLetters(f.state, f.body, f.store, f.read);
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(f.store.mailSelectedLetters).toHaveBeenCalledExactlyOnceWith(
      f.body.batchId,
      f.state.history.slice(0, 2),
    );
    expect(f.state).toEqual(before);
  });
  it.each(["no-confirm", "automatic", "blocked", "foreign"])(
    "rejects %s without reading or writing",
    async (kind) => {
      const f = fixture();
      if (kind === "no-confirm") f.body.confirm = false;
      if (kind === "automatic") f.body.automatic = true;
      if (kind === "blocked") f.body.deliveryIds.push("blocked");
      if (kind === "foreign") f.body.batchId = "foreign";
      await expect(
        mailSelectedLetters(f.state, f.body, f.store, f.read),
      ).rejects.toThrow();
      expect(f.read).not.toHaveBeenCalled();
      expect(f.store.mailSelectedLetters).not.toHaveBeenCalled();
    },
  );
  it("changes nothing if any saved document fails integrity verification", async () => {
    const f = fixture();
    f.read
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("hash mismatch"));
    await expect(
      mailSelectedLetters(f.state, f.body, f.store, f.read),
    ).rejects.toThrow("hash mismatch");
    expect(f.store.mailSelectedLetters).not.toHaveBeenCalled();
  });
});
