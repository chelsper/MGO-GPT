import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import QueueImportLink from "./QueueImportLink";
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });

describe("queue import batch handoff", () => {
  it("requests the exact blocking row without starting any create or apply action", async () => {
    window.history.replaceState({}, "", "/constituency-import?queueRun=88&queueRow=2712");
    const open = vi.fn();
    render(<QueueImportLink onOpen={open} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open blocking import row" }));
    expect(open).toHaveBeenCalledWith("88", { focusRowId: "2712", preload: false });
  });
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
