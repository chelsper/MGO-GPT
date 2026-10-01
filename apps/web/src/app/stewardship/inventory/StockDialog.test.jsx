import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StockDialog from "./StockDialog";
const item = { id: "1", name: "Blanket", on_hand: null, stock_version: 0 };
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ viewerKey: "auth-2", id: "1", stockEvents: [] })));
});
it("keeps unknown stock distinct from zero and saves only a confirmed physical count", async () => {
  const saved = vi.fn();
  render(<StockDialog item={item} viewerKey="auth-2" onSaved={saved} onClose={vi.fn()} />);
  expect(screen.getByText("Not counted")).toBeVisible();
  expect(screen.getByRole("combobox")).toHaveValue("opening");
  expect(screen.getByRole("button", { name: "Save stock change" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Total on hand"), { target: { value: "0" } });
  expect(screen.getByText("After this change: 0 on hand.")).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox"));
  fetch.mockResolvedValueOnce(Response.json({ viewerKey: "auth-2", items: [{ ...item, on_hand: 0, stock_version: 1 }] }));
  fireEvent.click(screen.getByRole("button", { name: "Save stock change" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ operation: "stock", kind: "opening", quantity: 0, stockVersion: 0, confirmed: true });
});
it("requires a reason for a recount and clears confirmation on edits", async () => {
  render(<StockDialog item={{ ...item, on_hand: 8, stock_version: 2 }} viewerKey="auth-2" onSaved={vi.fn()} onClose={vi.fn()} />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "adjustment" } });
  fireEvent.change(screen.getByLabelText("Total on hand"), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Save stock change" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Physical recount" } });
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Save stock change" })).toBeEnabled();
  expect(screen.getByText("After this change: 6 on hand.")).toBeVisible();
});
it("preserves a draft and blocks repeat saves after uncertain stock updates", async () => {
  const close = vi.fn();
  render(<StockDialog item={item} viewerKey="auth-2" onSaved={vi.fn()} onClose={close} />);
  fireEvent.change(screen.getByLabelText("Total on hand"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fetch.mockResolvedValueOnce(Response.json({ error: "Reload inventory" }, { status: 409 }));
  fireEvent.click(screen.getByRole("button", { name: "Save stock change" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Total on hand")).toHaveValue(12);
  expect(screen.getByRole("button", { name: "Save stock change" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Close and reload" }));
  expect(close).toHaveBeenCalledWith(true);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not save when closing an unsubmitted change", async () => {
  const close = vi.fn();
  render(<StockDialog item={item} viewerKey="auth-2" onSaved={vi.fn()} onClose={close} />);
  fireEvent.change(screen.getByLabelText("Total on hand"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByText("Discard this unsaved stock change?")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(close).toHaveBeenCalledWith(false);
  expect(fetch).toHaveBeenCalledTimes(1);
});
