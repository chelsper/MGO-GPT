import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  GiftChoice,
  StaffGiftChoice,
  SavedGiftPreference,
} from "./StewardshipGiftChoice";
afterEach(() => vi.unstubAllGlobals());
it("retains historical selections without offering them as fresh choices", () => {
  const change = vi.fn();
  render(
    <GiftChoice
      choices={[{ id: "2", name: "New item" }]}
      value="1"
      current={{ id: "1", name: "Archived item" }}
      onChange={change}
    />,
  );
  expect(screen.getByRole("combobox")).toHaveValue("1");
  expect(
    screen.getByText(/saved selection is no longer offered/),
  ).toBeVisible();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
  expect(change).toHaveBeenCalledWith("2");
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
  expect(change).toHaveBeenLastCalledWith(null);
});
it("allows help-me-choose on an empty catalog and disables choices on a failed read", () => {
  const view = render(
    <GiftChoice choices={[]} value={null} onChange={vi.fn()} />,
  );
  expect(screen.getByRole("combobox")).toBeEnabled();
  expect(
    screen.getByText(/No items are currently marked available/),
  ).toBeVisible();
  view.rerender(<GiftChoice choices={null} value={null} onChange={vi.fn()} />);
  expect(screen.getByRole("combobox")).toBeDisabled();
  expect(screen.getByText(/You can still ask for help/)).toBeVisible();
});
it("rejects another staff viewer's options and never polls", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        viewerKey: "other",
        giftChoices: [{ id: "1", name: "Wrong viewer" }],
      }),
    ),
  );
  render(<StaffGiftChoice viewerKey="2" value={null} onChange={vi.fn()} />);
  await screen.findByText(/Gift choices are unavailable/);
  expect(screen.queryByRole("option", { name: "Wrong viewer" })).toBeNull();
  fireEvent.focus(window);
  expect(fetch).toHaveBeenCalledOnce();
  fetch.mockResolvedValueOnce(
    Response.json({
      viewerKey: "2",
      giftChoices: [{ id: "1", name: "Available gift" }],
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Reload gift choices" }));
  await screen.findByRole("option", { name: "Available gift" });
});
it("labels saved preferences as neither a reservation nor proof of delivery", () => {
  render(
    <SavedGiftPreference
      request={{ stewardship_gift_item_snapshot: { name: "Old gift name" } }}
    />,
  );
  expect(screen.getByText(/Old gift name/)).toBeVisible();
  expect(
    screen.getByText(/Not a reservation or confirmation of delivery/),
  ).toBeVisible();
});
it("shows an explicit receipt instead of an unconfirmed preference", () => {
  render(<SavedGiftPreference request={{ stewardship_gift_item_snapshot: { name: "Preference" }, stewardship_received_item: {
    item_snapshot: { name: "Recorded blanket" }, received_on: "2020-10-01", recorded_by_name: "Staff Member",
  } }} />);
  expect(screen.getByText("Received:")).toBeVisible();
  expect(screen.getByText(/Recorded blanket/)).toBeVisible();
  expect(screen.getByText(/Not synced to NXT/)).toBeVisible();
  expect(screen.queryByText("Gift preference:")).toBeNull();
});
