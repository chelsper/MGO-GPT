import { fireEvent, render, screen, cleanup, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImportMatchReview from "./ImportMatchReview";
import { ManualNxtMatchSearchPanel } from "@/app/constituency-import/page";
import { rejectedImportMatchPreview } from "@/utils/importMatchReview";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
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

  it("immediately displays all stored suggestions with comparison fields and rejection before selection", () => {
    const onReject = vi.fn();
    const onSelect = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const suggestions = [{ ...row.match, email: "first@example.com", address: "42 Main St", postalCode: "32211" }, { blackbaudConstituentId: "456", name: "Second Person" }];
    render(<ImportMatchReview row={{ ...row, match: null, matchCandidates: suggestions }} saved reviewer runId="42" autoLoad onReject={onReject} onSelect={onSelect} />);
    expect(screen.getByText("first@example.com")).toBeInTheDocument();
    expect(screen.getByText("42 Main St, 32211")).toBeInTheDocument();
    expect(screen.getByText("Second Person")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Not a match" })).toHaveLength(2);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Not a match" })[0]);
    expect(onReject).toHaveBeenCalledWith(expect.objectContaining({ blackbaudConstituentId: "123" }));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Use this match" })[1]);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ blackbaudConstituentId: "456" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows legacy duplicate candidates even when a preflight approval was left set", () => {
    render(<ImportMatchReview row={{ ...row, match: null, createApprovedAt: "2026-09-08", blackbaudResult: { duplicateCheckAt: "2026-09-08", duplicateCandidate: { constituentId: "456", name: "Held Person" } } }} saved reviewer runId="42" />);
    expect(screen.getByText("Held Person")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not a match" })).toBeEnabled();
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://renxt.blackbaud.com/constituents/456");
  });

  it("loads missing legacy suggestions once without making the reviewer search", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [row.match] }) });
    vi.stubGlobal("fetch", fetch);
    const props = { row: { ...row, match: null }, saved: true, reviewer: true, runId: "42", autoLoad: true };
    const view = render(<ImportMatchReview {...props} />);
    await screen.findByText("NXT Person");
    expect(screen.getByRole("button", { name: "Not a match" })).toBeEnabled();
    expect(fetch).toHaveBeenCalledWith("/api/constituency-import/runs/42/rows/9/match", expect.objectContaining({ body: JSON.stringify({ action: "suggestions" }) }));
    view.rerender(<ImportMatchReview {...props} busy />);
    view.rerender(<ImportMatchReview {...props} />);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("shows a recoverable error instead of pretending a failed lookup means no matches", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: "NXT is throttled" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [row.match] }) });
    vi.stubGlobal("fetch", fetch);
    render(<ImportMatchReview row={{ ...row, match: null }} saved reviewer runId="42" autoLoad />);
    expect(await screen.findByRole("alert")).toHaveTextContent("not a confirmed nonmatch");
    expect(screen.queryByText(/No remaining suggested matches/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry suggested matches" }));
    await screen.findByText("NXT Person");
    await waitFor(() => expect(screen.getByRole("button", { name: "Not a match" })).toBeEnabled());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps rejected candidates out of suggestions on saved-run reload, but retains their history", () => {
    render(<ImportMatchReview row={{ ...row, match: null, matchCandidates: [row.match, { blackbaudConstituentId: "456", name: "Remaining" }], rejectedMatches: [{ constituentId: "123", name: "NXT Person" }] }} saved reviewer runId="42" />);
    const suggestions = within(screen.getByRole("region", { name: "Suggested NXT matches" }));
    expect(suggestions.queryByText("NXT Person")).not.toBeInTheDocument();
    expect(suggestions.getByText("Remaining")).toBeInTheDocument();
    expect(screen.getByText("Rejected matches (1)")).toBeInTheDocument();
  });

  it("does not load every row in the all-records view or start lookups during other operations", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const props = { row: { ...row, match: null }, saved: true, reviewer: true, runId: "42" };
    const view = render(<ImportMatchReview {...props} autoLoad={false} />);
    expect(fetch).not.toHaveBeenCalled();
    view.rerender(<ImportMatchReview {...props} autoLoad busy />);
    expect(fetch).not.toHaveBeenCalled();
  });
});
