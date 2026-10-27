import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PortfolioOpportunityPanel from "./PortfolioOpportunityPanel";

const person = { name: "Fictional Donor", constituentId: "100" };
const context = { viewerId: 2, workspaceId: 44, constituentId: "100", ownerName: "Selected MGO", authorName: "Admin Author", prospectId: null, opportunities: [], truncated: false };
const success = { verifiedOpportunityId: "812", blackbaudConstituentId: "100", blackbaudSync: { status: "synced" }, portfolioProspect: { id: 7, user_id: 44 } };
const reply = (body, ok = true) => ({ ok, json: async () => body });
let props;
beforeEach(() => {
  sessionStorage.clear();
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute("open"); });
  props = { person, viewerId: 2, workspaceId: 44, onClose: vi.fn(), onSaved: vi.fn() };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(context)));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const saveButton = () => screen.getByRole("button", { name: "Create opportunity in NXT" });
const mount = async () => {
  const view = render(<PortfolioOpportunityPanel {...props} />);
  await waitFor(() => expect(screen.getByText("Selected MGO")).toBeVisible());
  return view;
};
const fill = () => {
  fireEvent.change(screen.getByLabelText("Opportunity name"), { target: { value: "Scholarship gift" } });
  fireEvent.change(screen.getByLabelText("Amount ($)"), { target: { value: "25000" } });
  fireEvent.change(screen.getByLabelText("Expected date"), { target: { value: "2027-06-01" } });
};

it("opens with authoritative workspace credit, discloses Top Prospects creation and performs only one saved-data read", async () => {
  await mount();
  expect(screen.getByRole("dialog", { name: "Add opportunity" })).toHaveTextContent("Fictional Donor");
  expect(screen.getByText(/Entered by Admin Author/)).toBeVisible();
  expect(screen.getByText(/also adds the constituent to Top Prospects/)).toBeVisible();
  expect(screen.getByText(/not a live NXT check/)).toBeVisible();
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/portfolio-opportunities?viewerId=2&workspaceId=44&constituentId=100", expect.objectContaining({ cache: "no-store" }));
  expect(saveButton()).toBeEnabled();
  expect(screen.getByLabelText("App notes (optional)")).not.toBeVisible();
});
it("lists existing opportunities and warns about a matching title without blocking a genuinely separate gift", async () => {
  fetch.mockResolvedValue(reply({ ...context, prospectId: 7, opportunities: [{ id: 1, title: "Scholarship gift", current_stage: "Cultivation", estimated_amount: 5000, expected_date: "2027-06-01" }] }));
  await mount(); fill();
  expect(screen.getByText(/already uses this name/)).toBeVisible();
  expect(screen.getByText(/\$5,000.00/)).toBeVisible();
  expect(screen.queryByText(/also adds the constituent to Top Prospects/)).toBeNull();
  expect(saveButton()).toBeEnabled();
});
it("creates and verifies once, leaving the portfolio mounted and calling its cache update only after success", async () => {
  await mount(); fill();
  fetch.mockResolvedValue(reply(success));
  fireEvent.click(saveButton());
  await waitFor(() => expect(screen.getByText("Opportunity saved in the app and NXT.")).toBeVisible());
  expect(fetch).toHaveBeenCalledTimes(2);
  const [url, request] = fetch.mock.calls[1];
  expect(url).toBe("/api/submissions/opportunity-update");
  expect(JSON.parse(request.body)).toMatchObject({ opportunityTitle: "Scholarship gift", askAmount: 25000, expectedDate: "2027-06-01",
    opportunityStage: "Cultivation", createNewOpportunity: true, createNewConstituent: false,
    blackbaudConstituentId: "100", portfolioContext: { viewerId: 2, workspaceId: 44, constituentId: "100" } });
  expect(props.onSaved).toHaveBeenCalledExactlyOnceWith(success);
  expect(props.onClose).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Create opportunity in NXT" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Back to portfolio" }));
  expect(props.onClose).toHaveBeenCalledOnce();
});
it("blocks double-clicks, closing and advanced navigation while saving", async () => {
  await mount(); fill();
  let resolve;
  fetch.mockImplementation(() => new Promise(done => { resolve = done; }));
  fireEvent.click(saveButton());
  fireEvent.submit(screen.getByRole("dialog").querySelector("form"));
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(props.onClose).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("link", { name: /full opportunity form/ })).toBeNull();
  await act(async () => resolve(reply(success)));
});
it.each(["network", "malformed", "receipt", "unverified", "wrong constituent", "receipt with notSubmitted"])("locks %s saves across reopening rather than resending", async mode => {
  const view = await mount(); fill();
  if (mode === "network") fetch.mockRejectedValue(new Error("Lost response"));
  if (mode === "malformed") fetch.mockResolvedValue({ ok: true, json: async () => { throw new Error("invalid JSON"); } });
  if (mode.startsWith("receipt")) fetch.mockResolvedValue(reply({ error: "Verify NXT submission", writeReceipt: { id: "900" }, notSubmitted: mode.endsWith("notSubmitted") }, false));
  if (mode === "unverified") fetch.mockResolvedValue(reply({ id: 9 }));
  if (mode === "wrong constituent") fetch.mockResolvedValue(reply({ ...success, blackbaudConstituentId: "101" }));
  fireEvent.click(saveButton());
  await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
  expect(saveButton()).toBeDisabled();
  expect(props.onSaved).not.toHaveBeenCalled();
  view.unmount(); fetch.mockResolvedValue(reply(context)); await mount();
  expect(saveButton()).toBeDisabled();
  expect(screen.getByRole("link", { name: /Saved NXT submissions/ })).toHaveAttribute("href", "/nxt-write-recovery");
  expect(sessionStorage.getItem("portfolio-opportunity-attempt:2:44:100")).not.toMatch(/Fictional|25000|Scholarship/);
});
it("allows correction when the server explicitly confirms nothing was submitted", async () => {
  await mount(); fill();
  fetch.mockResolvedValue(reply({ error: "Correct the date", notSubmitted: true }, false));
  fireEvent.click(saveButton());
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Correct the date"));
  expect(saveButton()).toBeEnabled();
  expect(sessionStorage.getItem("portfolio-opportunity-attempt:2:44:100")).toBeNull();
});
it.each(["viewer", "workspace", "constituent", "unavailable"])("blocks saving if the %s check fails, without pretending there are no existing opportunities", async mode => {
  const data = { ...context };
  if (mode !== "unavailable") data[`${mode}Id`] = 999;
  fetch.mockResolvedValue(reply(data, mode !== "unavailable"));
  render(<PortfolioOpportunityPanel {...props} />);
  await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
  expect(saveButton()).toBeDisabled();
  expect(screen.queryByText(/No open opportunities/)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("supports unsaved exit, advanced full form, focus return, and scrolling restoration", async () => {
  const opener = document.createElement("button"); document.body.append(opener); opener.focus();
  const view = await mount(); fill();
  fireEvent.click(screen.getByRole("button", { name: "Close Add opportunity" }));
  expect(screen.getByRole("alert", { name: "Unsaved opportunity" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Opportunity name")).toHaveFocus();
  const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("link", { name: /full opportunity form/ }));
  expect(screen.getByText(/draft will not transfer/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Discard and open full form" }).getAttribute("href")).toContain("100");
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
  expect(props.onClose).toHaveBeenCalledOnce();
  view.unmount(); expect(opener).toHaveFocus(); expect(document.body.style.overflow).toBe(""); opener.remove();
});
it.each(["complete", "verified"])("reads an exact %s receipt without another write or claiming incomplete reconciliation succeeded", async state => {
  sessionStorage.setItem("portfolio-opportunity-attempt:2:44:100", JSON.stringify({ receiptId: "900" }));
  await mount();
  fetch.mockResolvedValue(reply({ workspace: { id: 44 }, receipts: [{ id: "900", kind: "opportunity", constituentId: "100", state, remoteId: "812" }] }));
  fireEvent.click(screen.getByRole("button", { name: "Check saved status" }));
  await waitFor(() => expect(screen.getByText(state === "complete" ? "Opportunity saved in the app and NXT." : "Existing NXT opportunity verified.")).toBeVisible());
  expect(fetch.mock.calls[1]).toEqual(["/api/nxt-write-recovery", { cache: "no-store" }]);
  expect(props.onSaved).not.toHaveBeenCalled();
});
it.each(["wrong workspace", "wrong receipt", "wrong constituent", "wrong kind", "unresolved"])("does not unlock recovery for %s", async mode => {
  sessionStorage.setItem("portfolio-opportunity-attempt:2:44:100", JSON.stringify({ receiptId: "900" }));
  await mount();
  fetch.mockResolvedValue(reply({ workspace: { id: mode === "wrong workspace" ? 45 : 44 }, receipts: [{
    id: mode === "wrong receipt" ? "901" : "900", kind: mode === "wrong kind" ? "action" : "opportunity",
    constituentId: mode === "wrong constituent" ? "101" : "100", state: mode === "unresolved" ? "review" : "complete", remoteId: "812",
  }] }));
  fireEvent.click(screen.getByRole("button", { name: "Check saved status" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Nothing was resent"));
  expect(saveButton()).toBeDisabled();
});
