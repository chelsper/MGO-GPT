import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImportMatchReview from "./ImportMatchReview";
import { ManualNxtMatchSearchPanel } from "@/app/constituency-import/page";
import { rejectedImportMatchPreview } from "@/utils/importMatchReview";

afterEach(cleanup);
const row = { id: "9", status: "Needs Review", input: { constituentName: "CSV Person", email: "csv@example.com" }, match: { blackbaudConstituentId: "123", name: "NXT Person", lookupId: "ABC" } };

describe("import match comparison", () => {
  it("compares source and selected identities and opens the selected system ID, not the lookup ID", () => {
    const onReject = vi.fn();
    render(<ImportMatchReview row={row} reviewer saved onReject={onReject} />);
    expect(screen.getByText("CSV Person")).toBeInTheDocument();
    expect(screen.getByText("NXT Person")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Open NXT record for NXT Person/ });
    expect(link).toHaveAttribute("href", "https://renxt.blackbaud.com/constituents/123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(screen.getByRole("button", { name: "Not a match" }));
    expect(onReject).toHaveBeenCalledOnce();
  });
  it("does not allow rejecting an already-created record", () => {
    render(<ImportMatchReview row={{ ...row, createdBlackbaudConstituentId: "123" }} reviewer saved />);
    expect(screen.queryByRole("button", { name: "Not a match" })).not.toBeInTheDocument();
    expect(screen.getByText(/created in NXT, not suggested/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toBeInTheDocument();
  });
  it("keeps an unsaved preview read-only and still allows opening NXT", () => {
    render(<ImportMatchReview row={row} reviewer saved={false} />);
    expect(screen.getByRole("button", { name: "Not a match" })).toBeDisabled();
    expect(screen.getByRole("link")).toBeInTheDocument();
  });
  it("shows a saved rejection and its historical link, without a selected record", () => {
    const rejected = rejectedImportMatchPreview(row, { decision: "rejected" });
    rejected.rejectedMatches = [{ constituentId: "123", name: "NXT Person" }];
    render(<ImportMatchReview row={rejected} reviewer saved />);
    expect(screen.getByText("No match selected")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("does not approve creating");
    expect(screen.queryByRole("button", { name: "Not a match" })).not.toBeInTheDocument();
  });
  it("gives each search result its own profile link before selection", () => {
    const select = vi.fn();
    render(<ManualNxtMatchSearchPanel row={row} query="Person" results={[row.match, { blackbaudConstituentId: "456", name: "Other Person" }]} onSelect={select} />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /for Other Person/ })).toHaveAttribute("href", "https://renxt.blackbaud.com/constituents/456");
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Use this NXT match" })[1]);
    expect(select).toHaveBeenCalledWith({ blackbaudConstituentId: "456", name: "Other Person" });
  });
});
