import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import QueueImportLink from "./QueueImportLink";
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });

describe("queue import batch handoff", () => {
  it("opens the exact saved batch only after an explicit click", async () => {
    window.history.replaceState({}, "", "/constituency-import?queueRun=17");
    const open = vi.fn();
    render(<QueueImportLink onOpen={open} />);
    const button = await screen.findByRole("button", { name: "Open saved batch #17" });
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(open).toHaveBeenCalledWith("17");
  });

  it("does not suggest reopening an already loaded batch or accept malformed IDs", () => {
    window.history.replaceState({}, "", "/constituency-import?queueRun=17");
    const { unmount } = render(<QueueImportLink loadedRunId="17" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/This batch is loaded below/)).toBeInTheDocument();
    unmount();
    window.history.replaceState({}, "", "/constituency-import?queueRun=bad-id");
    render(<QueueImportLink />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
