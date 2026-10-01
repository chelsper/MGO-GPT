import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StewardshipReceiptForm from "./StewardshipReceiptForm";
const request = {
  id: 22,
  request_version: 3,
  request_viewer_id: "2",
  status: "Open",
  constituent_name: "Example Donor",
  stewardship_gift_item_id: "12",
  stewardship_gift_item_snapshot: { name: "Blanket" },
};
afterEach(() => vi.unstubAllGlobals());
function fill() {
  fireEvent.click(screen.getByRole("button", { name: "Record received item" }));
  fireEvent.change(screen.getByLabelText("Date received"), {
    target: { value: "2020-10-01" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "I confirm this recipient received this item." }));
}
it("requires actual receipt confirmation and submits the saved item/request version, not donor text", async () => {
  const saved = vi.fn();
  const receipt = {
    id: "1",
    request_id: "22",
    request_version: 4,
    received_on: "2020-10-01",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ viewerKey: "2", receipt })),
  );
  render(<StewardshipReceiptForm request={request} onSaved={saved} />);
  fireEvent.click(screen.getByRole("button", { name: "Record received item" }));
  expect(
    screen.getByRole("button", { name: "Save received item" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Date received"), {
    target: { value: "2020-10-01" },
  });
  expect(
    screen.getByRole("button", { name: "Save received item" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "I confirm this recipient received this item." }));
  fireEvent.click(screen.getByRole("button", { name: "Save received item" }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(receipt));
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    operation: "record",
    requestId: "22",
    version: 3,
    viewerKey: "2",
    itemId: "12",
    token: expect.any(String),
    receivedOn: "2020-10-01",
    note: "",
    confirmed: true,
    stockQuantity: 0,
  });
});
it("deducts only an explicitly selected quantity for a new delivery", async () => {
  const saved = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ viewerKey: "2", receipt: { id: "1", request_id: "22" } })));
  render(<StewardshipReceiptForm request={request} onSaved={saved} />);
  fill();
  fireEvent.click(screen.getByRole("checkbox", { name: /Deduct this newly delivered/ }));
  fireEvent.change(screen.getByLabelText("Quantity delivered"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Save received item" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[0][1].body).stockQuantity).toBe(2);
});
it("prevents a repeat submission after an uncertain result and keeps the draft", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Saved status unknown");
    }),
  );
  render(<StewardshipReceiptForm request={request} onSaved={vi.fn()} />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Save received item" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Date received")).toHaveValue("2020-10-01");
  expect(
    screen.getByRole("button", { name: "Save received item" }),
  ).toBeDisabled();
  expect(fetch).toHaveBeenCalledOnce();
});
it("rejects a response from another viewer", async () => {
  const saved = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ viewerKey: "7", receipt: { id: "1", request_id: "22" } }),
    ),
  );
  render(<StewardshipReceiptForm request={request} onSaved={saved} />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Save received item" }));
  await screen.findByRole("alert");
  expect(saved).not.toHaveBeenCalled();
});
it("does not offer recording while unsaved, missing a gift, declined, or already received", () => {
  const view = render(
    <StewardshipReceiptForm request={request} disabled onSaved={vi.fn()} />,
  );
  expect(
    screen.getByRole("button", { name: "Record received item" }),
  ).toBeDisabled();
  view.rerender(
    <StewardshipReceiptForm
      request={{ ...request, stewardship_gift_item_id: null }}
    />,
  );
  expect(screen.getByText(/Save a gift preference first/)).toBeVisible();
  view.rerender(
    <StewardshipReceiptForm request={{ ...request, status: "Declined" }} />,
  );
  expect(screen.getByText(/Reopen this request/)).toBeVisible();
  view.rerender(
    <StewardshipReceiptForm
      request={{ ...request, stewardship_received_item: { id: "1" } }}
    />,
  );
  expect(screen.getByText(/Receipt is recorded/)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Record received item" }),
  ).toBeNull();
});
