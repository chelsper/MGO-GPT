import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ImportFieldResults from "./ImportFieldResults";
afterEach(cleanup);
const row = { status: "Needs Review", match: { blackbaudConstituentId: "123" }, writePlan: [{ type: "phone", number: "9045551212", makePrimary: true }],
  blackbaudResult: { results: [{ writeIndex: 0, status: "applied", type: "phone" }] } };
describe("saved field results", () => {
  it("has no side effects and directs an explicit click to read-only verification", () => {
    const action = vi.fn(); render(<ImportFieldResults row={row} onAction={action} />);
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText("Phone primary setting")).toBeVisible();
    expect(screen.getAllByText("Awaiting verification")).toHaveLength(2);
    expect(screen.getByText(/Creating a record does not confirm/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Verify in NXT and finish" }));
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ kind: "verify" }));
    expect(screen.queryByRole("button", { name: /send|retry/i })).not.toBeInTheDocument();
  });
  it("disables actions during any operation or unsaved review edit", () => {
    const action = vi.fn(); const { rerender } = render(<ImportFieldResults row={row} onAction={action} busy />);
    expect(screen.getByRole("button")).toBeDisabled();
    rerender(<ImportFieldResults row={row} onAction={action} dirty />);
    fireEvent.click(screen.getByRole("button"));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText(/Unsaved edits are not reflected/)).toBeVisible();
  });
  it("offers no action during an active send", () => {
    render(<ImportFieldResults row={{ ...row, status: "Applying" }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("An import step is running");
  });
  it("navigates to a correction only after a click", () => {
    const action = vi.fn();
    render(<ImportFieldResults row={{ status: "Applied", savedContactContext: { correctionRunId: "77", omissions: [{ kind: "email", value: "test@example.test" }] } }} onAction={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Open saved contact correction" }));
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ kind: "correction", runId: "77" }));
  });
});
