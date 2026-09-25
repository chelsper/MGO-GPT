import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  readReviewCheckpoint,
  reviewScope,
  useLetterReviewRecovery,
} from "./letterReviewRecovery";

const scope = "1:2026-01-01:2026-12-31";
const key = `society-letter-review:v1:${scope}`;
const position = { ids: ["10", "20"], currentId: "20", channel: "post" };
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());
describe("private letter review recovery", () => {
  it("stores only tab-scoped position, never draft values, tokens, or approvals", () => {
    const view = renderHook(() => useLetterReviewRecovery(scope));
    act(() => {
      view.result.current.remember({ ...position, salutation: "Private name" });
      view.result.current.keepDraft("20", {
        values: { address: "Private address" },
        reviewToken: "secret",
        confirm: true,
      });
    });
    expect(JSON.parse(sessionStorage.getItem(key))).toEqual({
      ...position,
      at: expect.any(Number),
    });
    const reload = renderHook(() => useLetterReviewRecovery(scope));
    expect(reload.result.current.checkpoint.currentId).toBe("20");
    expect(reload.result.current.drafts).toEqual({});
    expect(view.result.current.drafts["20"].values.address).toBe(
      "Private address",
    );
  });
  it("scopes recovery to the signed-in reviewer and recognition period", () => {
    const view = renderHook(({ scope }) => useLetterReviewRecovery(scope), {
      initialProps: { scope },
    });
    act(() => {
      view.result.current.remember(position);
      view.result.current.keepDraft("20", {
        values: { salutation: "Private" },
      });
    });
    view.rerender({ scope: "2:2026-01-01:2026-12-31" });
    expect(view.result.current.checkpoint).toBeNull();
    expect(view.result.current.drafts).toEqual({});
    view.rerender({ scope: "1:2027-01-01:2027-12-31" });
    expect(view.result.current.checkpoint).toBeNull();
    expect(
      reviewScope({
        reviewerId: "1",
        period: { start: "2026-01-01", end: "2026-12-31" },
      }),
    ).toBe(scope);
    expect(reviewScope({ period: {} })).toBeNull();
  });
  it.each([
    { ids: [] },
    { ids: ["10", "10"] },
    { ids: ["<script>"], currentId: "<script>" },
    { ids: Array.from({ length: 51 }, (_, i) => String(i)) },
    { currentId: "99" },
    { channel: "sms" },
    { at: 1 },
    { at: Date.now() + 86400000 },
  ])("ignores an invalid or expired checkpoint: %j", (change) => {
    sessionStorage.setItem(
      key,
      JSON.stringify({ ...position, at: Date.now(), ...change }),
    );
    expect(readReviewCheckpoint(scope)).toBeNull();
  });
  it("handles malformed or blocked storage without blocking review", () => {
    sessionStorage.setItem(key, "not json");
    expect(readReviewCheckpoint(scope)).toBeNull();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const view = renderHook(() => useLetterReviewRecovery(scope));
    act(() => view.result.current.remember(position));
    expect(view.result.current.checkpoint.currentId).toBe("20");
  });
  it("warns before leaving with in-memory drafts and clears the warning after discard", () => {
    const view = renderHook(() => useLetterReviewRecovery(scope));
    act(() =>
      view.result.current.keepDraft("20", { values: { salutation: "Draft" } }),
    );
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    act(() => {
      view.result.current.keepDraft("20", null);
      view.result.current.clearCheckpoint();
    });
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    expect(sessionStorage.getItem(key)).toBeNull();
  });
});
