import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReceivedItems } from "./page";
import { getBreadcrumbs } from "@/utils/appNavigation";
import { getReturnDestination } from "@/utils/workflowNavigation";
const item = {
  id: "1",
  request_id: "22",
  request_version: 3,
  item_id: "12",
  item_snapshot: { name: "Blanket" },
  constituent_id: "100",
  constituent_name: "Example Donor",
  received_on: "2020-10-01",
  owner_name: "Example Officer",
  recorded_by_name: "Staff Member",
  note: "Hand delivered",
};
const response = (changes) =>
  Response.json({
    sessionKey: "auth-user",
    viewerKey: "2",
    canManage: true,
    items: [item],
    next: null,
    ...changes,
  });
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response()),
  ),
);
afterEach(() => vi.unstubAllGlobals());
it("shows who received what, date and recorder, with item/recipient filters and no NXT call", async () => {
  render(
    <ReceivedItems sessionKey="auth-user" initialFilters={{ itemId: "12" }} />,
  );
  await screen.findByText("Example Donor");
  expect(screen.getByText("Oct 1, 2020")).toBeVisible();
  expect(screen.getByText("Staff Member")).toBeVisible();
  expect(fetch.mock.calls[0][0]).toContain("itemId=12");
  fireEvent.click(
    screen.getByRole("button", { name: "More for this recipient" }),
  );
  await waitFor(() =>
    expect(fetch.mock.calls.at(-1)[0]).toContain("constituentId=100"),
  );
  expect(fetch.mock.calls.at(-1)[0]).not.toContain("itemId=");
  expect(
    screen.getByText(/Earlier NXT gift-item history has not been imported/),
  ).toBeVisible();
  expect(
    getBreadcrumbs("/stewardship/inventory/recipients", {
      canManageWorkspace: true,
    }).at(-1).label,
  ).toBe("Received Items");
  expect(getReturnDestination("/stewardship/inventory/recipients").label).toBe(
    "Back to Received Items",
  );
});
it("searches only on request, without polling or searching each keystroke", async () => {
  render(<ReceivedItems sessionKey="auth-user" />);
  await screen.findByText("Example Donor");
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Blanket" },
  });
  expect(fetch).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Search", exact: true }));
  await waitFor(() =>
    expect(fetch.mock.calls.at(-1)[0]).toContain("search=Blanket"),
  );
});
it("shows no unsupported never-received claim for an empty view", async () => {
  fetch.mockResolvedValueOnce(response({ items: [] }));
  render(<ReceivedItems sessionKey="auth-user" />);
  await screen.findByText("No recorded receipts in this view");
  expect(
    screen.getByText(/does not mean the person has never received a gift/),
  ).toBeVisible();
});
it("keeps fundraiser history read-only and handles safe return navigation", async () => {
  fetch.mockResolvedValueOnce(response({ canManage: false }));
  render(
    <ReceivedItems
      sessionKey="auth-user"
      returnTo="/follow-ups?tab=next-steps&nextStepId=10"
    />,
  );
  await screen.findByText("Example Donor");
  expect(
    screen.queryByRole("button", { name: "Correct this entry" }),
  ).toBeNull();
  expect(
    screen.getByRole("link", { name: "Back to Follow-ups & Discussion" }),
  ).toHaveAttribute("href", "/follow-ups?tab=next-steps&nextStepId=10");
  expect(
    screen.getByText(/Showing receipts linked to your fundraiser workspace/),
  ).toBeVisible();
});
it("does not display another viewer's history", async () => {
  fetch.mockResolvedValueOnce(response({ sessionKey: "different" }));
  render(<ReceivedItems sessionKey="auth-user" />);
  await screen.findByRole("alert");
  expect(screen.queryByText("Example Donor")).toBeNull();
});
it("requires a correction reason and reloads after a confirmed void", async () => {
  render(<ReceivedItems sessionKey="auth-user" />);
  await screen.findByText("Example Donor");
  fireEvent.click(screen.getByRole("button", { name: "Correct this entry" }));
  expect(
    screen.getByRole("button", { name: "Void receipt and keep history" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Correction reason"), {
    target: { value: "Wrong date" },
  });
  fetch
    .mockResolvedValueOnce(
      Response.json({
        viewerKey: "2",
        receipt: { id: "1", voided_at: "2020-10-02" },
      }),
    )
    .mockResolvedValueOnce(response({ items: [] }));
  fireEvent.click(
    screen.getByRole("button", { name: "Void receipt and keep history" }),
  );
  await screen.findByText(/Receipt voided/);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    operation: "void",
    id: "1",
    requestId: "22",
    version: 3,
    viewerKey: "2",
    reason: "Wrong date",
  });
  await screen.findByText("No recorded receipts in this view");
});
it("paginates and retains a way back from an emptied later page", async () => {
  fetch.mockResolvedValueOnce(response({ next: "1" }));
  render(<ReceivedItems sessionKey="auth-user" />);
  await screen.findByText("Example Donor");
  fetch.mockResolvedValueOnce(response({ items: [] }));
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await screen.findByText("No recorded receipts in this view");
  expect(fetch.mock.calls[1][0]).toContain("before=1");
  expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
});
