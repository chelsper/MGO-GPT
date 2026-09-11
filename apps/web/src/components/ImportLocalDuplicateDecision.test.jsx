import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImportLocalDuplicateDecision from "./ImportLocalDuplicateDecision";
afterEach(cleanup);
const duplicate = { kind: "pending_row", fingerprint: "fingerprint", name: "Other Person", email: "old@example.com", lookupId: "629381" };
const row = { id: "9", input: { firstName: "Jane", lastName: "Dolphin", email: "jane@example.com" }, localDuplicate: duplicate };
const comparison = { token: "token", checkedAt: new Date().toISOString(), duplicate, current: null };

describe("review import-history holds", () => {
  it("loads an explicit comparison, not an automatic rejection or creation", async () => {
    const onAction = vi.fn().mockResolvedValue();
    render(<ImportLocalDuplicateDecision row={row} onAction={onAction} />);
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review this hold" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith("review_local_check", expect.objectContaining({ blockerFingerprint: "fingerprint" })));
    expect(screen.queryByRole("button", { name: "Different person - continue checks" })).not.toBeInTheDocument();
  });
  it("requires a note and confirmation before saving the decision", async () => {
    const onAction = vi.fn().mockResolvedValue();
    render(<ImportLocalDuplicateDecision row={{ ...row, localDuplicateReview: comparison }} onAction={onAction} />);
    expect(screen.getByText("Other saved CSV row")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Different person - continue checks" });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Verified different people sharing an address." } });
    fireEvent.click(button);
    await waitFor(() => expect(onAction).toHaveBeenCalledWith("review_local_reject", { blockerFingerprint: "fingerprint", reviewToken: "token", confirmed: true, reviewNote: "Verified different people sharing an address." }));
  });
  it("shows current NXT identity and never substitutes old CSV contact values", () => {
    render(<ImportLocalDuplicateDecision row={{ ...row, localDuplicateReview: { ...comparison, current: { blackbaudConstituentId: "77", name: "Current Person", lookupId: "729381", email: "" } } }} onAction={vi.fn()} />);
    expect(screen.getByText("Current Lookup ID: 729381")).toBeInTheDocument();
    expect(screen.queryByText("old@example.com")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open current NXT record" })).toHaveAttribute("href", "https://renxt.blackbaud.com/constituents/77");
  });
  it("does not offer dismissal for an uncertain earlier creation", () => {
    render(<ImportLocalDuplicateDecision row={{ ...row, localDuplicate: { ...duplicate, kind: "unconfirmed_creation" } }} onAction={vi.fn()} />);
    expect(screen.getByText(/cannot be dismissed/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("expires old comparisons and displays safe failure feedback", async () => {
    render(<ImportLocalDuplicateDecision row={{ ...row, localDuplicateReview: { ...comparison, checkedAt: "2020-01-01" } }} onAction={vi.fn().mockRejectedValue(new Error("NXT lookup failed. Retry."))} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review this hold" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("NXT lookup failed");
  });
});
