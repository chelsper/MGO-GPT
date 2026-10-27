import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PortfolioActionPanel from "./PortfolioActionPanel";

const person = { name: "Fictional Donor", constituentId: "100", prospectId: 7 };
const profile = { user: { id: 2, name: "Admin Author", role: "admin" }, workspaceUser: { id: 44, name: "Selected MGO", role: "mgo" }, actingAsUser: { id: 44 } };
const reply = (body, ok = true) => ({ ok, json: async () => body });
let props;
beforeEach(() => {
  sessionStorage.clear();
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.removeAttribute("open"); });
  props = { person, viewerId: 2, workspaceId: 44, onClose: vi.fn(), onSaved: vi.fn() };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(profile)));
  vi.spyOn(window, "confirm").mockReturnValue(false);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const saveButton = () => screen.getByRole("button", { name: "Save action in NXT" });
const mount = async (overrides = {}) => {
  const view = render(<PortfolioActionPanel {...props} {...overrides} />);
  await waitFor(() => expect(screen.getByText("Selected MGO")).toBeVisible());
  return view;
};
const fill = () => {
  fireEvent.change(screen.getByLabelText("Action date"), { target: { value: "2026-01-12" } });
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Discussed scholarships" } });
};

it("opens with constituent and authoritative credit, making no NXT reads or writes", async () => {
  await mount();
  expect(screen.getByRole("dialog", { name: "Log action" })).toHaveTextContent("Fictional Donor");
  expect(screen.getByText(/Entered by Admin Author/)).toBeVisible();
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/users/profile", expect.objectContaining({ cache: "no-store" }));
  expect(saveButton()).toBeEnabled();
  expect(screen.getByLabelText("Action notes")).not.toBeVisible();
});

it.each(["prospect", "portfolio"])("uses the shared %s writer once and preserves next steps", async mode => {
  await mount({ person: { ...person, prospectId: mode === "prospect" ? 7 : null } });
  fill();
  fetch.mockResolvedValue(reply({ blackbaudAction: { verifiedActionId: "812", syncWarning: "" } }));
  fireEvent.click(saveButton());
  await waitFor(() => expect(screen.getByText("Action saved in NXT.")).toBeVisible());
  const [url, request] = fetch.mock.calls[1];
  expect(url).toBe(mode === "prospect" ? "/api/prospects/7/actions" : "/api/submissions/donor-update");
  expect(JSON.parse(request.body)).toMatchObject({ actionDate: "2026-01-12", summary: "Discussed scholarships",
    portfolioContext: { viewerId: 2, workspaceId: 44, constituentId: "100" } });
  expect(JSON.parse(request.body)).not.toHaveProperty("nextStep");
  expect(props.onSaved).toHaveBeenCalledTimes(1);
  expect(props.onClose).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Save action in NXT" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Back to portfolio" }));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(window.confirm).not.toHaveBeenCalled();
});

it("blocks double-clicks, closing and full-form navigation while the POST is in flight", async () => {
  await mount(); fill();
  let resolve;
  fetch.mockImplementation(() => new Promise(done => { resolve = done; }));
  fireEvent.click(saveButton());
  fireEvent.submit(screen.getByRole("dialog").querySelector("form"));
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(props.onClose).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("link", { name: /full action form/ })).toBeNull();
  await act(async () => resolve(reply({ blackbaudAction: { verifiedActionId: "812" } })));
});

it.each(["network", "malformed", "receipt", "unverified"])("locks %s responses and retains the recovery state across reopening", async mode => {
  const view = await mount(); fill();
  if (mode === "network") fetch.mockRejectedValue(new Error("Lost response"));
  if (mode === "malformed") fetch.mockResolvedValue({ ok: true, json: async () => { throw new Error("invalid JSON"); } });
  if (mode === "receipt") fetch.mockResolvedValue(reply({ error: "NXT submission needs verification", writeReceipt: { id: "900" } }, false));
  if (mode === "unverified") fetch.mockResolvedValue(reply({ id: "app-only" }));
  fireEvent.click(saveButton());
  await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
  expect(saveButton()).toBeDisabled();
  expect(screen.getByRole("link", { name: /Saved NXT submissions/ })).toHaveAttribute("href", "/nxt-write-recovery");
  expect(props.onSaved).not.toHaveBeenCalled();
  view.unmount();
  fetch.mockResolvedValue(reply(profile));
  await mount();
  expect(saveButton()).toBeDisabled();
  expect(screen.getByRole("button", { name: "Check saved status" })).toBeEnabled();
  expect(sessionStorage.getItem("portfolio-action-attempt:2:44:100")).not.toContain("Fictional");
});

it("allows correction only when the server explicitly confirms nothing was submitted", async () => {
  await mount(); fill();
  fetch.mockResolvedValue(reply({ error: "Correct the date", notSubmitted: true }, false));
  fireEvent.click(saveButton());
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Correct the date"));
  expect(saveButton()).toBeEnabled();
  expect(sessionStorage.getItem("portfolio-action-attempt:2:44:100")).toBeNull();
});

it.each(["different viewer", "different workspace", "executive", "unavailable"])("fails closed for %s", async mode => {
  const data = structuredClone(profile);
  if (mode === "different viewer") data.user.id = 3;
  if (mode === "different workspace") data.workspaceUser.id = 45;
  if (mode === "executive") data.user.role = "executive";
  fetch.mockResolvedValue(reply(data, mode !== "unavailable"));
  render(<PortfolioActionPanel {...props} />);
  await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
  expect(saveButton()).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("warns before discarding, leaving, or reloading a dirty draft; restores focus and scrolling on unmount", async () => {
  const opener = document.createElement("button"); document.body.append(opener); opener.focus();
  const view = await mount(); fill();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(screen.getByRole("alert", { name: "Unsaved action" })).toHaveTextContent("Discard this unsaved action?");
  expect(props.onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  const leaving = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leaving); expect(leaving.defaultPrevented).toBe(true);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  fireEvent(screen.getByRole("link", { name: /full action form/ }), click);
  expect(click.defaultPrevented).toBe(true);
  expect(screen.getByRole("link", { name: "Discard and open full form" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  fireEvent.click(screen.getByRole("button", { name: "Close Log action" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
  expect(props.onClose).toHaveBeenCalledOnce();
  view.unmount(); expect(opener).toHaveFocus(); expect(document.body.style.overflow).toBe(""); opener.remove();
});

it("checks a saved receipt read-only without replaying the action", async () => {
  sessionStorage.setItem("portfolio-action-attempt:2:44:100", JSON.stringify({ receiptId: "900", startedAt: "2026-01-01T10:00:00Z" }));
  await mount();
  fetch.mockResolvedValue(reply({ workspace: { id: 44 }, receipts: [{ id: "900", kind: "action", constituentId: "100", state: "complete", remoteId: "812" }] }));
  fireEvent.click(screen.getByRole("button", { name: "Check saved status" }));
  await waitFor(() => expect(screen.getByText("Action saved in NXT.")).toBeVisible());
  expect(fetch.mock.calls[1]).toEqual(["/api/nxt-write-recovery", { cache: "no-store" }]);
  expect(sessionStorage.getItem("portfolio-action-attempt:2:44:100")).toBeNull();
});

it.each(["wrong workspace", "no receipt", "unresolved"])("does not unlock an uncertain save with %s", async mode => {
  sessionStorage.setItem("portfolio-action-attempt:2:44:100", JSON.stringify({ receiptId: "900" }));
  await mount();
  fetch.mockResolvedValue(reply({ workspace: { id: mode === "wrong workspace" ? 45 : 44 }, receipts: mode === "no receipt" ? []
    : [{ id: "900", kind: "action", constituentId: "100", state: mode === "unresolved" ? "review" : "complete", remoteId: "812" }] }));
  fireEvent.click(screen.getByRole("button", { name: "Check saved status" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Nothing was resent"));
  expect(saveButton()).toBeDisabled();
});
