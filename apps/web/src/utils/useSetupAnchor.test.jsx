import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import useSetupAnchor from "./useSetupAnchor";

function Editor({ ready }) {
  useSetupAnchor(ready);
  return ready ? (
    <section id="workspace-users">Users editor</section>
  ) : (
    <p>Loading</p>
  );
}
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
  delete Element.prototype.scrollIntoView;
  vi.restoreAllMocks();
});

it("scrolls and focuses a known section only once its editor has loaded", () => {
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  window.history.replaceState(null, "", "/#workspace-users");
  const view = render(<Editor ready={false} />);
  expect(scroll).not.toHaveBeenCalled();
  view.rerender(<Editor ready />);
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Users editor")).toHaveFocus();
  view.rerender(<Editor ready />);
  expect(scroll).toHaveBeenCalledTimes(1);
});

it("ignores unrelated fragments and removes its listener on unmount", () => {
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  window.history.replaceState(null, "", "/#not-a-setup-section");
  const { unmount } = render(<Editor ready />);
  expect(scroll).not.toHaveBeenCalled();
  window.history.replaceState(null, "", "/#workspace-users");
  act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
  expect(scroll).toHaveBeenCalledTimes(1);
  unmount();
  act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
  expect(scroll).toHaveBeenCalledTimes(1);
});
