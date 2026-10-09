import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LetterReleaseNotice from "./LetterReleaseNotice";

const current = "a".repeat(40);
const newer = {
  commitSha: "b".repeat(40),
  deploymentId: "dpl_new",
  environment: "production",
};
const respond = (value) => ({ ok: true, json: async () => value });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("society-letter release discovery", () => {
  it("bypasses the version cookie without credentials and requires confirmation before navigation", async () => {
    const fetch = vi.fn().mockResolvedValue(respond(newer));
    const assign = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("location", {
      pathname: "/stewardship/society-letters",
      search: "?view=history",
      hash: "#saved",
      assign,
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<LetterReleaseNotice buildCommit={current} />);
    const button = await screen.findByRole("button", {
      name: "Load latest version",
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/version",
      expect.objectContaining({
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(assign).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(assign).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(button);
    const destination = new URL(assign.mock.calls[0][0], "https://ju.test");
    expect(destination.pathname).toBe(
      "/api/stewardship/society-letters/reload",
    );
    expect(destination.searchParams.get("dpl")).toBe("dpl_new");
    expect(destination.searchParams.get("expectedDeployment")).toBe("dpl_new");
    expect(destination.searchParams.get("returnTo")).toBe(
      "/stewardship/society-letters?view=history#saved",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...newer, commitSha: current },
    { ...newer, environment: "preview" },
    { ...newer, commitSha: null },
    { ...newer, deploymentId: "https://other.test" },
  ])(
    "does not prompt for the same release or invalid metadata: %j",
    async (value) => {
      const fetch = vi.fn().mockResolvedValue(respond(value));
      vi.stubGlobal("fetch", fetch);
      render(<LetterReleaseNotice buildCommit={current} />);
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    },
  );
  it("does not interrupt busy work and cleans up in-flight checks", async () => {
    const fetch = vi.fn().mockResolvedValue(respond(newer));
    vi.stubGlobal("fetch", fetch);
    const view = render(<LetterReleaseNotice buildCommit={current} busy />);
    expect(
      await screen.findByRole("button", { name: "Load latest version" }),
    ).toBeDisabled();
    view.unmount();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    fireEvent.focus(window);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds focus checks and can recover after a timeout without an automatic retry loop", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        (_url, { signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () =>
              reject(new Error("timeout")),
            ),
          ),
      )
      .mockResolvedValue(respond(newer));
    vi.stubGlobal("fetch", fetch);
    render(<LetterReleaseNotice buildCommit={current} />);
    fireEvent.focus(window);
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(10000));
    fireEvent.focus(window);
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(50000));
    await act(async () => {
      fireEvent.focus(window);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(false);
  });
  it("does nothing in local builds without release metadata", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<LetterReleaseNotice buildCommit="" />);
    expect(fetch).not.toHaveBeenCalled();
  });
});
