import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useUser from "./useUser";

describe("useUser", () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", vi.fn());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it("refreshes on focus without returning an already loaded page to loading", async () => {
    let resolveFocusRequest;
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { id: "1", email: "mgo@example.edu" } }),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFocusRequest = resolve;
          }),
      );

    let latestUserState;
    function UserStateProbe() {
      const userState = useUser();
      useEffect(() => {
        latestUserState = userState;
      }, [userState]);
      return null;
    }

    await act(async () => {
      root.render(<UserStateProbe />);
      await Promise.resolve();
    });

    expect(latestUserState.loading).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(latestUserState.loading).toBe(false);

    await act(async () => {
      resolveFocusRequest({
        ok: true,
        json: async () => ({ user: { id: "1", email: "mgo@example.edu" } }),
      });
    });
  });
});
