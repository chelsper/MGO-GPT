import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ProspectRanking from "./ProspectRanking";

const snapshot = { workspaceId: "44", version: "a".repeat(32), prospects: [
  { id: "10", name: "Alex Example", askType: "Major Gift" },
  { id: "11", name: "Blair Example", askType: "Annual Gift" },
  { id: "12", name: "Casey Example" },
] };
let fetchMock;
let saved;
function response(payload, status = 200) { return { ok: status === 200, status, json: async () => payload }; }
async function open() {
  render(<ProspectRanking workspaceId={44} workspaceName="Selected MGO" onSaved={saved} />);
  fireEvent.click(screen.getByRole("button", { name: "Reorder prospects" }));
  await screen.findByRole("button", { name: "Drag Alex Example to reorder" });
}
function names() {
  return within(screen.getByRole("list", { name: "Active prospect ranking" })).getAllByRole("listitem").map((row) =>
    within(row).getByRole("button", { name: /Drag .* to reorder/ }).getAttribute("aria-label"));
}

beforeEach(() => {
  saved = vi.fn();
  fetchMock = vi.fn().mockResolvedValue(response(snapshot));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("prospect ranking draft", () => {
  it("loads all active rows only on open and provides keyboard/touch instructions", async () => {
    render(<ProspectRanking workspaceId={44} workspaceName="Selected MGO" onSaved={saved} />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reorder prospects" }));
    await screen.findByRole("button", { name: "Drag Alex Example to reorder" });
    expect(fetchMock).toHaveBeenCalledWith("/api/prospects/reorder?workspaceId=44", expect.objectContaining({ cache: "no-store" }));
    expect(screen.getByText(/regardless of page filters/)).toBeInTheDocument();
    expect(screen.getByText(/hold the handle/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save order" })).toBeDisabled();
  });
  it("moves directly to a position and saves once with the original version", async () => {
    await open();
    fireEvent.change(screen.getByRole("combobox", { name: "Position for Casey Example" }), { target: { value: "0" } });
    expect(names()[0]).toContain("Casey");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(response({ success: true, workspaceId: "44", orderedIds: ["12", "10", "11"] }));
    fireEvent.click(screen.getByRole("button", { name: "Save order" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(["12", "10", "11"]));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ workspaceId: "44", orderedIds: ["12", "10", "11"], version: snapshot.version });
    expect(screen.getByText("Prospect order saved.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("cancels without saving and reopens the saved order", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Move Casey Example to top" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reorder prospects" }));
    await screen.findByRole("button", { name: "Drag Alex Example to reorder" });
    expect(names()[0]).toContain("Alex");
  });
  it("retains a dirty draft when discard is declined", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Move Casey Example to top" }));
    window.confirm.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Close ranking" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(names()[0]).toContain("Casey");
  });
  it("disables repeat writes and closing while saving", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Move Casey Example to top" }));
    let finish;
    fetchMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Save order" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Saving..." }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => finish(response({ success: true, workspaceId: "44", orderedIds: ["12", "10", "11"] })));
  });
  it.each([409, 500])("preserves the draft and requires reload after error %s", async (status) => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Move Casey Example to top" }));
    fetchMock.mockResolvedValue(response({ error: "Reload the ranking before continuing." }, status));
    fireEvent.click(screen.getByRole("button", { name: "Save order" }));
    await screen.findByRole("alert");
    expect(names()[0]).toContain("Casey");
    expect(screen.getByRole("button", { name: "Save order" })).toBeDisabled();
    expect(saved).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(response(snapshot));
    fireEvent.click(screen.getByRole("button", { name: "Reload current ranking" }));
    await waitFor(() => expect(names()[0]).toContain("Alex"));
  });
  it("does not call a malformed success response saved", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Move Casey Example to top" }));
    fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new Error("HTML response"); } });
    fireEvent.click(screen.getByRole("button", { name: "Save order" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not confirm");
    expect(saved).not.toHaveBeenCalled();
  });
  it("fails closed if the loading response belongs to another workspace", async () => {
    fetchMock.mockResolvedValue(response({ ...snapshot, workspaceId: "55" }));
    render(<ProspectRanking workspaceId={44} workspaceName="Selected MGO" onSaved={saved} />);
    fireEvent.click(screen.getByRole("button", { name: "Reorder prospects" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save order" })).toBeDisabled();
  });
});
