import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import OpportunityEditor from "./OpportunityEditor";
const fields = { name: "Scholarship", status: "Cultivation", purpose: "Campaign", ask_amount: 1000, expected_date: "2027-01-01", ask_date: null, funded_amount: null, funded_date: null, inactive: false };
const context = { state: "ready", fields, version: "a".repeat(64), copyCount: 2 };
let fetch;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  fetch = vi.fn().mockImplementation(async () => Response.json(context)); vi.stubGlobal("fetch", fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const props = () => ({ row: { id: "1", title: "Scholarship", constituentName: "Demo Donor" }, operation: "edit", onClose: vi.fn(), onSaved: vi.fn() });

it("loads fresh fields on demand and saves only edits with the checked version", async () => {
  const callbacks = props(); render(<OpportunityEditor {...callbacks} />);
  expect(await screen.findByLabelText("Opportunity title")).toHaveValue("Scholarship");
  expect(screen.getByRole("button", { name: "Save to NXT and app" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Expected date"), { target: { value: "2028-01-01" } });
  fetch.mockResolvedValueOnce(Response.json({ state: "complete", message: "Saved" }));
  fireEvent.click(screen.getByRole("button", { name: "Save to NXT and app" }));
  await waitFor(() => expect(callbacks.onClose).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ operation: "edit", version: context.version, fields: { expected_date: "2028-01-01" }, confirmArchive: false });
});
it("requires explicit archive confirmation", async () => {
  render(<OpportunityEditor {...props()} operation="archive" />);
  const button = await screen.findByRole("button", { name: "Archive in NXT and app" });
  expect(button).toBeDisabled(); expect(fetch).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("checkbox")); expect(button).toBeEnabled();
});
it("keeps a definitively rejected draft editable rather than asking for sync recovery", async () => {
  render(<OpportunityEditor {...props()} />);
  fireEvent.change(await screen.findByLabelText("Opportunity title"), { target: { value: "Updated" } });
  fetch.mockResolvedValueOnce(Response.json({ error: "Correct this field." }, { status: 400 }));
  fireEvent.click(screen.getByRole("button", { name: "Save to NXT and app" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Correct this field.");
  expect(screen.getByLabelText("Opportunity title")).toHaveValue("Updated");
  expect(screen.queryByRole("button", { name: "Check sync status" })).not.toBeInTheDocument();
});
it("never offers blind resubmission after a lost response", async () => {
  const callbacks = props(); render(<OpportunityEditor {...callbacks} />);
  fireEvent.change(await screen.findByLabelText("Opportunity title"), { target: { value: "Updated" } });
  fetch.mockRejectedValueOnce(new Error("Network connection lost"));
  fireEvent.click(screen.getByRole("button", { name: "Save to NXT and app" }));
  const check = await screen.findByRole("button", { name: "Check sync status" });
  expect(screen.queryByRole("button", { name: "Save to NXT and app" })).not.toBeInTheDocument();
  fetch.mockResolvedValueOnce(Response.json({ state: "complete", message: "Verified" }));
  fireEvent.click(check); await waitFor(() => expect(callbacks.onClose).toHaveBeenCalled());
  expect(fetch.mock.calls.map(call => call[1].method)).toEqual(["GET", "PATCH", "POST"]);
});
it("opens pending receipts directly in verification mode and does not send on opening", async () => {
  fetch.mockResolvedValueOnce(Response.json({ state: "pending", message: "Needs verification" }, { status: 202 }));
  render(<OpportunityEditor {...props()} />);
  expect(await screen.findByRole("button", { name: "Check sync status" })).toBeEnabled();
  expect(fetch).toHaveBeenCalledOnce(); expect(screen.queryByLabelText("Opportunity title")).not.toBeInTheDocument();
});
