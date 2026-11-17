import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Family from "./LifetimeFamilyGroups";

afterEach(cleanup);
const person = { id: "1", lookupId: "D-1", name: "Morgan Example", constituentType: "individual" };
const spouse = { ...person, id: "2", lookupId: "D-2", name: "Taylor Example" };
const org = { id: "9", lookupId: "F-9", name: "Example Family Foundation", recordKey: "o".repeat(64), constituentType: "organization" };
const household = { id: "base", automatic: true, members: [person, spouse], rows: [{ recordKey: "h".repeat(64), name: "Morgan & Taylor Example", archived: false }] };
const snapshot = { rows: [org, { ...org, societyKey: "other" }], sharedGroups: [household], giftReviewAvailable: true };
const link = { key: "l".repeat(64), householdKey: household.rows[0].recordKey, organizationKey: org.recordKey, householdName: household.rows[0].name, organizationName: org.name, matched: true };
const props = () => ({ snapshot, links: [], canManage: true, busy: false, revision: "one", request: {}, onOpen: vi.fn(), onClose: vi.fn(), onCommand: vi.fn().mockResolvedValue(true) });
function choose() {
  fireEvent.change(screen.getByLabelText("Household"), { target: { value: household.rows[0].recordKey } });
  fireEvent.change(screen.getByLabelText("Foundation or organization"), { target: { value: org.recordKey } });
}

it("requires exact choices and explicit full-giving consent before submitting only saved keys", async () => {
  const p = props(); render(<Family {...p} />);
  expect(screen.getByRole("region", { name: "Link foundation to household" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "Confirm family link" })).toBeDisabled();
  choose();
  expect(screen.getByText(/even those not soft credited/)).toBeVisible();
  expect(screen.getByText(/not copied to the new group/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirm family link" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Confirm family link" }));
  await waitFor(() => expect(p.onClose).toHaveBeenCalledOnce());
  expect(p.onCommand).toHaveBeenCalledExactlyOnceWith("link-family", { householdKey: household.rows[0].recordKey, recordKey: org.recordKey });
});

it("cancel never submits and changing records or revision clears the full-giving consent", () => {
  const p = props(); const { rerender } = render(<Family {...p} />); choose(); fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Household"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Household"), { target: { value: household.rows[0].recordKey } });
  expect(screen.getByRole("checkbox")).not.toBeChecked(); fireEvent.click(screen.getByRole("checkbox"));
  rerender(<Family {...p} revision="two" />); expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(p.onClose).toHaveBeenCalledOnce(); expect(p.onCommand).not.toHaveBeenCalled();
});

it("preselects a row shortcut but never consents automatically", () => {
  const p = props(); render(<Family {...p} request={{ recordKey: org.recordKey, householdKey: household.rows[0].recordKey }} />);
  expect(screen.getByLabelText("Foundation or organization")).toHaveValue(org.recordKey);
  expect(screen.getByRole("checkbox")).not.toBeChecked(); expect(p.onCommand).not.toHaveBeenCalled();
});

it("does not close or discard the form after a failed save", async () => {
  const p = props(); p.onCommand.mockResolvedValue(false); render(<Family {...p} />); choose();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Confirm family link" }));
  await waitFor(() => expect(p.onCommand).toHaveBeenCalledOnce()); expect(p.onClose).not.toHaveBeenCalled();
});

it("prevents reassigning an already linked foundation, even when the link needs review", () => {
  const p = props(); render(<Family {...p} links={[{ ...link, matched: false }]} />); choose();
  expect(screen.getByText(/already linked to/)).toBeVisible(); expect(screen.getByText(/This family group is not combined/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirm family link" })).toBeDisabled(); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

it("shows viewers saved family links but no mutation controls", () => {
  const p = props(); render(<Family {...p} links={[link]} canManage={false} />);
  expect(screen.getByRole("heading", { name: `${link.householdName} + ${link.organizationName}` })).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument(); expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});

it("requires confirmation to unlink, allows cancellation, and preserves unrelated links", async () => {
  const p = props(); render(<Family {...p} request={null} links={[link]} />);
  fireEvent.click(screen.getByRole("button", { name: "Unlink organization" }));
  expect(screen.getByText(/Other links and all gift credit remain/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Keep linked" })); expect(p.onCommand).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Unlink organization" })); fireEvent.click(screen.getByRole("button", { name: "Confirm unlink" }));
  await waitFor(() => expect(p.onCommand).toHaveBeenCalledExactlyOnceWith("unlink-family", { familyLinkKey: link.key }));
});

it("disables mutation and scope controls while another operation is running", () => {
  const p = props(); render(<Family {...p} busy links={[link]} />);
  for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  for (const select of screen.getAllByRole("combobox")) expect(select).toBeDisabled();
});

it("blocks missing evidence and targets missing from the saved report", () => {
  const p = props(); render(<Family {...p} snapshot={{ ...snapshot, giftReviewAvailable: false, sharedGroups: [] }} />);
  expect(screen.getByText(/First confirm an individual household/)).toBeVisible(); expect(screen.getByText(/Refresh gift history once/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirm family link" })).toBeDisabled();
});

it("paginates saved links and resets page and pending unlink when searching", () => {
  const p = props(), links = Array.from({ length: 11 }, (_, i) => ({ ...link, key: String(i), organizationName: `Foundation ${i}` }));
  render(<Family {...p} links={links} request={null} />);
  expect(screen.getAllByRole("button", { name: "Unlink organization" })).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", { name: "Next family links" }));
  expect(screen.getAllByRole("button", { name: "Unlink organization" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Unlink organization" }));
  fireEvent.change(screen.getByLabelText("Find a family link"), { target: { value: "Foundation 0" } });
  expect(screen.queryByRole("button", { name: "Confirm unlink" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Foundation 0$/ })).toBeVisible(); expect(p.onCommand).not.toHaveBeenCalled();
});
