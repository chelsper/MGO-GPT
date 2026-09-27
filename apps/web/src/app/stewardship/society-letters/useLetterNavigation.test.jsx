import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import useLetterNavigation from "./useLetterNavigation";
import {
  LETTER_VIEWS,
  letterViewHref,
  societyLetterReturnPath,
} from "@/utils/societyLetterNavigation";

beforeEach(() =>
  window.history.replaceState(
    { unrelated: "retained" },
    "",
    letterViewHref("ready"),
  ),
);

it("supports browser Back and Forward without reloading the workspace", async () => {
  const { result } = renderHook(useLetterNavigation);
  act(() => result.current.navigate("setup"));
  act(() => result.current.navigate("fields"));
  expect(result.current.tab).toBe("settings");
  expect(result.current.showMappings).toBe(true);
  expect(result.current.backLabel).toBe("Back to Setup checklist");
  expect(window.history.state.unrelated).toBe("retained");
  await act(async () => window.history.back());
  await waitFor(() => expect(result.current.tab).toBe("setup"));
  await act(async () => window.history.forward());
  await waitFor(() => expect(result.current.view).toBe("fields"));
  expect(result.current.showMappings).toBe(true);
});

it.each(Object.keys(LETTER_VIEWS))(
  "restores a directly opened %s screen with a safe parent",
  (view) => {
    window.history.replaceState({}, "", letterViewHref(view));
    const { result } = renderHook(useLetterNavigation);
    expect(result.current.view).toBe(view);
    expect(result.current.backHref).toBe(
      view === "ready"
        ? "/stewardship"
        : view === "fields"
          ? letterViewHref("settings")
          : ["settings", "templates", "appeals"].includes(view)
            ? letterViewHref("setup")
            : letterViewHref("ready"),
    );
  },
);

it("uses the last visited screen, not always the setup checklist", () => {
  const { result } = renderHook(useLetterNavigation);
  act(() => result.current.navigate("excluded"));
  act(() => result.current.navigate("appeals"));
  expect(result.current.backHref).toBe(letterViewHref("excluded"));
  const before = window.history.length;
  act(() => result.current.navigate("appeals"));
  expect(window.history.length).toBe(before);
});

it("uses a parent for direct links without depending on unrelated browser history", () => {
  window.history.replaceState({}, "", letterViewHref("templates"));
  const { result } = renderHook(useLetterNavigation);
  act(() => result.current.back({ button: 0, preventDefault() {} }));
  expect(result.current.view).toBe("setup");
  expect(result.current.backHref).toBe(letterViewHref("ready"));
});

it("honors modified link clicks and ignores invalid views and stale trails", () => {
  window.history.replaceState(
    { societyLetterNavigation: { view: "history", trail: ["templates"] } },
    "",
    `${letterViewHref("ready")}?view=unknown`,
  );
  const { result } = renderHook(useLetterNavigation);
  expect(result.current.backHref).toBe("/stewardship");
  act(() => result.current.navigate("templates"));
  act(() =>
    result.current.back({
      button: 0,
      ctrlKey: true,
      preventDefault() {
        throw new Error("Should allow new tab");
      },
    }),
  );
  expect(result.current.tab).toBe("templates");
});

it("allows only canonical society-workspace return links", () => {
  expect(
    societyLetterReturnPath(
      `${letterViewHref("settings")}&secret=ignore#anything`,
    ),
  ).toBe(letterViewHref("settings"));
  for (const value of [
    null,
    "https://evil.example",
    "//evil.example/stewardship/society-letters",
    "/api/stewardship/society-letters",
    "/stewardship/society-letters/../api",
    "/setup",
  ])
    expect(societyLetterReturnPath(value)).toBe("");
  expect(
    societyLetterReturnPath(`${letterViewHref("ready")}?view=unknown`),
  ).toBe(letterViewHref("ready"));
});
