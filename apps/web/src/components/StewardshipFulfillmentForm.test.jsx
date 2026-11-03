import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import StewardshipFulfillmentForm from "./StewardshipFulfillmentForm";
import StewardshipFulfillmentSummary from "./StewardshipFulfillmentSummary";
const row = {
  id: 12,
  request_viewer_id: "2",
  request_version: 1,
  source_pending_action_id: 10,
  request_type: "Stewardship: Personal gift",
  constituent_name: "Fictional Donor",
  status: "Open",
  stewardship_gift_item_id: "4",
  stewardship_gift_item_snapshot: { name: "Test Blanket" },
};
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const open = () =>
  fireEvent.click(screen.getByRole("button", { name: "Complete request" }));
const complete = () => {
  fireEvent.change(screen.getByLabelText("Shared completion note"), {
    target: { value: "Handed to donor" },
  });
  fireEvent.change(screen.getByLabelText("Date it happened"), {
    target: { value: "2000-10-01" },
  });
  fireEvent.click(
    screen.getByLabelText("I confirm this outcome and date are accurate."),
  );
};
it("opens without provider calls and cancel returns focus to the originating control", async () => {
  render(<StewardshipFulfillmentForm request={row} onSaved={vi.fn()} />);
  open();
  expect(screen.getByLabelText("Outcome")).toHaveValue("received");
  fireEvent.change(screen.getByLabelText("Shared completion note"), {
    target: { value: "Keep this draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Complete request" }),
    ).toHaveFocus(),
  );
  open();
  expect(screen.getByLabelText("Shared completion note")).toHaveValue(
    "Keep this draft",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("saves one combined command with no implicit stock, action, or task", async () => {
  const saved = vi.fn();
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      viewerKey: "2",
      request: { ...row, status: "Completed" },
    }),
  });
  render(<StewardshipFulfillmentForm request={row} onSaved={saved} />);
  open();
  complete();
  fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    stage: "received",
    itemId: "4",
    stockQuantity: 0,
    actionId: null,
    followUp: null,
    confirmed: true,
  });
});
it("requires read-only recovery after a lost response, without repeating POST", async () => {
  const saved = vi.fn();
  fetch.mockRejectedValueOnce(new Error("Connection lost"));
  render(<StewardshipFulfillmentForm request={row} onSaved={saved} />);
  open();
  complete();
  fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
  await screen.findByText("Connection lost");
  expect(
    screen.getByRole("button", { name: "Save completion" }),
  ).toBeDisabled();
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      viewerKey: "2",
      request: {
        ...row,
        request_version: 2,
        status: "Completed",
        stewardship_fulfillment: { stage: "received" },
      },
    }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Check saved status" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(
    1,
  );
});
it("preserves the draft when a saved-status check confirms no write", async () => {
  fetch.mockRejectedValueOnce(new Error("Offline"));
  render(<StewardshipFulfillmentForm request={row} onSaved={vi.fn()} />);
  open();
  complete();
  fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
  await screen.findByText("Offline");
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ viewerKey: "2", request: row }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Check saved status" }));
  await screen.findByText(/No new fulfillment is recorded/);
  expect(screen.getByLabelText("Shared completion note")).toHaveValue(
    "Handed to donor",
  );
  expect(screen.getByRole("button", { name: "Save completion" })).toBeEnabled();
});
it("keeps an existing receipt and blocks duplicate stock deduction", () => {
  render(
    <StewardshipFulfillmentForm
      request={{
        ...row,
        stewardship_received_item: { id: "40", received_on: "2000-10-01" },
      }}
      onSaved={vi.fn()}
    />,
  );
  open();
  expect(screen.queryByText(/Deduct this newly/)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Date it happened")).toHaveValue("2000-10-01");
});
it("shows prepared versus sent wording and never sends hidden stock or follow-up controls", async () => {
  const saved = vi.fn();
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      viewerKey: "2",
      request: { ...row, status: "In Progress" },
    }),
  });
  render(<StewardshipFulfillmentForm request={row} onSaved={saved} />);
  open();
  complete();
  fireEvent.click(
    screen.getByLabelText(
      "Deduct this newly received item from counted inventory.",
    ),
  );
  fireEvent.change(screen.getByLabelText("Outcome"), {
    target: { value: "prepared" },
  });
  expect(screen.getByText(/request stays in progress/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save progress" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    stage: "prepared",
    stockQuantity: 0,
    followUp: null,
    actionId: null,
  });
});
it("provides a late read-only action link without requiring another completion", () => {
  render(
    <StewardshipFulfillmentForm
      request={{
        ...row,
        status: "Completed",
        stewardship_received_item: { id: "40" },
        stewardship_fulfillment: {
          stage: "received",
          date: "2000-10-01",
          note: "Done",
        },
      }}
      onSaved={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Link existing NXT action" }),
  );
  expect(screen.getByLabelText("Date it happened")).toHaveAttribute("readonly");
  expect(screen.getByLabelText("Existing NXT action system ID")).toBeRequired();
  expect(screen.queryByText(/Add a next step/)).not.toBeInTheDocument();
});
it("shows delivery and NXT status separately with an optional MGO next-step link", () => {
  render(
    <StewardshipFulfillmentSummary
      request={{
        ...row,
        owner_user_id: 2,
        stewardship_follow_up_status: "Done",
        stewardship_fulfillment: {
          stage: "sent",
          date: "2000-10-01",
          note: "Dispatched",
          followUpId: "55",
        },
      }}
    />,
  );
  expect(
    screen.getByText("Dispatched, not confirmed received."),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/No NXT action has been created/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Open MGO follow-up" }),
  ).toHaveAttribute(
    "href",
    "/follow-ups?tab=next-steps&nextStepId=55&status=Done",
  );
});
it("preserves a new draft after an unchanged saved-status check on a prepared request", async () => {
  const current = {
    ...row,
    request_version: 2,
    stewardship_fulfillment: {
      stage: "prepared",
      date: "2000-09-30",
      note: "Ready",
    },
  };
  const saved = vi.fn();
  fetch.mockRejectedValueOnce(new Error("Offline"));
  render(<StewardshipFulfillmentForm request={current} onSaved={saved} />);
  open();
  complete();
  fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
  await screen.findByText("Offline");
  fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ viewerKey: "2", request: current }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Check saved status" }));
  await screen.findByText(/No new fulfillment is recorded/);
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Shared completion note")).toHaveValue(
    "Handed to donor",
  );
});
it("allows a replacement receipt without silently deducting stock or replacing a linked action", async () => {
  const saved = vi.fn();
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      viewerKey: "2",
      request: { ...row, status: "Completed" },
    }),
  });
  render(
    <StewardshipFulfillmentForm
      request={{
        ...row,
        status: "Completed",
        request_version: 4,
        stewardship_fulfillment: {
          stage: "received",
          date: "2000-10-02",
          actionId: "501",
          receiptId: "40",
        },
      }}
      onSaved={saved}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Record corrected receipt" }),
  );
  complete();
  expect(
    screen.getByText(/History and previous stock deductions are kept/),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Save completion" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    date: "2000-10-01",
    stockQuantity: 0,
    actionId: null,
  });
});
it("marks an update seen for only its own version and displays the next update", async () => {
  const current = {
    ...row,
    fulfillment_unread: true,
    stewardship_fulfillment: {
      stage: "prepared",
      date: "2000-10-01",
      note: "Ready",
      version: 2,
    },
  };
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ viewerKey: "2", acknowledged: true }),
  });
  const view = render(
    <StewardshipFulfillmentSummary request={current} showNotice />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Mark update seen" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Mark update seen" }),
    ).toBeNull(),
  );
  view.rerender(
    <StewardshipFulfillmentSummary
      request={{
        ...current,
        stewardship_fulfillment: {
          ...current.stewardship_fulfillment,
          stage: "sent",
          version: 3,
        },
      }}
      showNotice
    />,
  );
  expect(
    screen.getByRole("button", { name: "Mark update seen" }),
  ).toBeEnabled();
});
it("offers completion for a reopened non-gift request, retaining its existing NXT link", () => {
  render(
    <StewardshipFulfillmentForm
      request={{
        ...row,
        status: "Open",
        request_type: "Stewardship: Campus visit",
        stewardship_gift_item_id: null,
        stewardship_fulfillment: {
          stage: "sent",
          date: "2000-10-01",
          note: "Previous dispatch",
          actionId: "501",
        },
      }}
      onSaved={vi.fn()}
    />,
  );
  open();
  expect(screen.getByLabelText("Outcome")).toHaveValue("completed");
  expect(
    screen.queryByRole("option", { name: "Received by the donor" }),
  ).toBeNull();
  expect(
    screen.queryByRole("option", { name: "Prepared / ready for hand-off" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Save completion" }),
  ).toBeDisabled();
});
