import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImportCompletionNotice from "./ImportCompletionNotice";
afterEach(cleanup);
const row = { status: "Needs Review", writePlan: [{ type: "phone" }], match: { blackbaudConstituentId: "1" },
  blackbaudResult: { results: [{ writeIndex: 0, status: "manual_required", partialApplied: true }] } };
describe("read-only finish control", () => {
  it("requires an explicit click and never offers another send", () => {
    const onVerify = vi.fn();
    render(<ImportCompletionNotice row={row} reviewer onVerify={onVerify} />);
    expect(onVerify).not.toHaveBeenCalled();
    expect(screen.getByText(/only reads NXT; it never sends changes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Verify in NXT and finish" }));
    expect(onVerify).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /send to NXT/i })).not.toBeInTheDocument();
  });
  it("can recheck after an unsuccessful verification", () => {
    render(<ImportCompletionNotice row={{ ...row, blackbaudResult: { ...row.blackbaudResult, reconciliation: { verifiedAt: "yesterday", results: [{ writeIndex: 0, status: "needs_review" }] } } }} reviewer />);
    expect(screen.getByRole("button", { name: "Verify in NXT and finish" })).toBeEnabled();
  });
  it("shows completion and a read-only recheck after finishing", () => {
    render(<ImportCompletionNotice row={{ ...row, status: "Applied", blackbaudResult: { ...row.blackbaudResult, reconciliation: { verifiedAt: "today", results: [{ writeIndex: 0, status: "confirmed" }] } } }} reviewer />);
    expect(screen.getByRole("heading", { name: "Import complete" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing more needs to be sent/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check NXT again (read-only)" })).toBeEnabled();
  });
  it("disables during verification and hides completion for non-reviewers or active sends", () => {
    const { rerender } = render(<ImportCompletionNotice row={row} reviewer busy />);
    expect(screen.getByRole("button")).toBeDisabled();
    rerender(<ImportCompletionNotice row={row} reviewer={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<ImportCompletionNotice row={{ ...row, status: "Applying" }} reviewer />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
