import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import useAutomaticAppealVerification from "./useAutomaticAppealVerification";
import {
  beginAutomaticAppealCheck,
  finishAutomaticAppealCheck,
} from "@/utils/societyLetterVerification";

const now = Date.parse("2026-10-08T12:00:00Z");
const workspace = () => ({
  reviewerId: "1",
  revision: 1,
  history: [
    {
      id: "letter",
      channel: "post",
      status: "prepared",
      letterAppeals: {
        status: "needs_review",
        checkedAt: new Date(now).toISOString(),
        members: [
          {
            id: "10",
            status: "uncertain",
            attemptedAt: new Date(now).toISOString(),
          },
        ],
      },
    },
  ],
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const advance = (ms) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("automatic appeal verification while the workspace is open", () => {
  it("runs a single read-only action without a confirmation click, then stops on success", async () => {
    const data = workspace();
    const verify = vi.fn().mockResolvedValue(data);
    const { rerender } = renderHook(useAutomaticAppealVerification, {
      initialProps: { data, paused: false, verify },
    });
    await advance(4999);
    expect(verify).not.toHaveBeenCalled();
    await advance(1);
    expect(verify).toHaveBeenCalledExactlyOnceWith({
      action: "verify_letter_appeals",
      deliveryId: "letter",
      automatic: true,
    });
    const complete = structuredClone(data);
    complete.revision++;
    complete.history[0].letterAppeals.status = "complete";
    rerender({ data: complete, paused: false, verify });
    await advance(600000);
    expect(verify).toHaveBeenCalledTimes(1);
  });
  it("pauses for editing, hidden tabs, and unmount", async () => {
    const props = { data: workspace(), paused: true, verify: vi.fn() };
    const { rerender, unmount } = renderHook(useAutomaticAppealVerification, {
      initialProps: props,
    });
    await advance(10000);
    expect(props.verify).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    rerender({ ...props, paused: false });
    await advance(10000);
    expect(props.verify).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    unmount();
    await advance(10000);
    expect(props.verify).not.toHaveBeenCalled();
  });
  it("checks one receipt at a time even when the revision changes during a request", async () => {
    let resolve;
    const verify = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValue({});
    const data = workspace();
    const { rerender } = renderHook(useAutomaticAppealVerification, {
      initialProps: { data, paused: false, verify },
    });
    await advance(5000);
    const next = {
      ...data,
      revision: 2,
      history: [{ ...data.history[0], id: "second" }],
    };
    rerender({ data: next, paused: false, verify });
    await advance(60000);
    expect(verify).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(data);
    });
    await advance(1000);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify.mock.calls[1][0].deliveryId).toBe("second");
  });
  it.each([null, "throw"])(
    "does not loop after a %s transport failure",
    async (failure) => {
      const verify =
        failure === "throw"
          ? vi.fn().mockRejectedValue(new Error("offline"))
          : vi.fn().mockResolvedValue(null);
      const { result, rerender } = renderHook(useAutomaticAppealVerification, {
        initialProps: { data: workspace(), paused: false, verify },
      });
      await advance(5000);
      await advance(600000);
      expect(verify).toHaveBeenCalledTimes(1);
      expect(result.current).toContain("Reload this page");
      const confirmed = workspace();
      confirmed.revision++;
      confirmed.history[0].letterAppeals.status = "complete";
      rerender({ data: confirmed, paused: false, verify });
      expect(result.current).toBe("");
    },
  );
  it("follows persisted cooldowns and stops after the bounded checks", async () => {
    let data = workspace();
    let rerender;
    const verify = vi.fn(async () => {
      data = structuredClone(data);
      const receipt = data.history[0].letterAppeals;
      beginAutomaticAppealCheck(receipt);
      finishAutomaticAppealCheck(receipt, { retryAfterMs: 90000 });
      data.revision++;
      rerender({ data, paused: false, verify });
      return data;
    });
    ({ rerender } = renderHook(useAutomaticAppealVerification, {
      initialProps: { data, paused: false, verify },
    }));
    await advance(5000);
    await advance(89999);
    expect(verify).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(verify).toHaveBeenCalledTimes(2);
    await advance(120000);
    expect(verify).toHaveBeenCalledTimes(3);
    await advance(86400000);
    expect(verify).toHaveBeenCalledTimes(3);
  });
});
