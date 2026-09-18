import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ImportWorkspaceNavigation from "./ImportWorkspaceNavigation";
import WorkflowReturnLink from "./WorkflowReturnLink";
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState({}, "", "/"); });

it("provides an accessible labeled return link with no requests", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  render(<WorkflowReturnLink href="/my-top-prospects?tab=portfolio" />);
  const link = screen.getByRole("link", { name: "Back to My Portfolio" });
  expect(link).toHaveAttribute("href", "/my-top-prospects?tab=portfolio");
  expect(link).toHaveClass("min-h-11");
  expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(fetch).not.toHaveBeenCalled();
});
it("returns to import results by default, and remembers the current batch and row for the history round-trip", () => {
  render(<ImportWorkspaceNavigation runId="42" rowId="9" />);
  const results = new URL(screen.getByRole("link", { name: "Back to Import History" }).href);
  expect(results.pathname).toBe("/import-history");
  expect(results.searchParams.get("returnTo")).toBe("/constituency-import?queueRun=42&queueRow=9");
  expect(screen.queryByRole("link", { name: "View import results" })).not.toBeInTheDocument();
});
it("returns a comparison to its source batch without loading it or changing NXT", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  window.history.replaceState({}, "", `/constituency-import?queueRun=88&queueRow=2712&${new URLSearchParams({ returnTo: "/constituency-import?queueRun=42&queueRow=9" })}`);
  render(<ImportWorkspaceNavigation />);
  expect(screen.getByRole("link", { name: "Back to Import Batch #42" })).toHaveAttribute("href", "/constituency-import?queueRun=42&queueRow=9");
  expect(fetch).not.toHaveBeenCalled();
});
