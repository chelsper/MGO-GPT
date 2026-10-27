import { act, cleanup, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server.node";
import { afterEach, expect, it, vi } from "vitest";
import useWorkflowReturn from "./useWorkflowReturn";

function ReturnLink({ fallback = "/" }) {
  const destination = useWorkflowReturn(fallback);
  return <a href={destination.href}>{destination.label}</a>;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

it("hydrates without replacing the page before resolving its originating workflow", async () => {
  window.history.replaceState({}, "", "/request-list?returnTo=%2Freports%2Flists");
  const container = document.createElement("div");
  container.innerHTML = renderToString(<ReturnLink fallback="/submissions" />);
  const original = container.querySelector("a");
  expect(original.getAttribute("href")).toBe("/submissions");
  const onRecoverableError = vi.fn();
  let root;
  try {
    await act(async () => { root = hydrateRoot(container, <ReturnLink fallback="/submissions" />, { onRecoverableError }); });
    expect(container.querySelector("a")).toBe(original);
    expect(original.getAttribute("href")).toBe("/reports/lists");
    expect(original.textContent).toBe("Back to Lists");
    expect(onRecoverableError).not.toHaveBeenCalled();
  } finally {
    if (root) await act(async () => root.unmount());
  }
});

it("keeps an explicit origin when the current page is reloaded with itself as referrer", () => {
  window.history.replaceState({}, "", "/settings?returnTo=%2Fintegration-health%23health-connections");
  vi.spyOn(document, "referrer", "get").mockReturnValue(window.location.href);
  render(<ReturnLink />);
  expect(screen.getByRole("link", { name: "Back to Integration Health" }))
    .toHaveAttribute("href", "/integration-health#health-connections");
});
