import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import CampaignFundAssignments from "./CampaignFundAssignments";

const funds = [
  { fund_id: "1", fund_name: "Scholarship Fund", fund_priority: "unassigned", original_cents: 10000 },
  { fund_id: "2", fund_name: "Innovation Fund", fund_priority: "entrepreneurship-innovation", original_cents: 20000 },
];
afterEach(cleanup);
const selectFund = name => fireEvent.click(screen.getByRole("checkbox", { name: `Select ${name}` }));
const viewAssigned = () => fireEvent.click(screen.getByRole("button", { name: /^Assigned \(/ }));
const target = priority => fireEvent.change(screen.getByLabelText("Assign selected funds to"), { target: { value: priority } });

it("defaults to unassigned funds and keeps assigned funds separately accessible", () => {
  const command = vi.fn();
  render(<CampaignFundAssignments data={{ funds }} command={command} pending={false} />);
  expect(screen.getByRole("button", { name: "Unassigned (1)" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("table", { name: "Unassigned funds" })).toHaveTextContent("Scholarship Fund");
  expect(screen.queryByRole("checkbox", { name: "Select Innovation Fund" })).not.toBeInTheDocument();
  viewAssigned();
  expect(screen.getByRole("table", { name: "Assigned funds" })).toHaveTextContent("Innovation Fund");
  expect(screen.queryByRole("checkbox", { name: "Select Scholarship Fund" })).not.toBeInTheDocument();
  expect(command).not.toHaveBeenCalled();
});

it("moves successfully saved funds, allows reassignment, and can return them to Unassigned", async () => {
  const command = vi.fn();
  function Harness() {
    const [items, setItems] = useState(funds);
    async function save(operation, input) {
      command(operation, input);
      setItems(current => current.map(f => input.fundIds.includes(f.fund_id) ? { ...f, fund_priority: input.priority } : f));
      return true;
    }
    return <CampaignFundAssignments data={{ funds: items }} command={save} pending={false} />;
  }
  render(<Harness />);
  selectFund("Scholarship Fund");
  fireEvent.click(screen.getByRole("button", { name: "Save 1 fund" }));
  expect(await screen.findByRole("status")).toHaveTextContent("1 fund assigned to Scholarships");
  expect(screen.getByText(/All funds have a priority/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Assigned (2)" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View assigned funds" }));
  selectFund("Scholarship Fund"); target("campus-planning");
  fireEvent.click(screen.getByRole("button", { name: "Save 1 fund" }));
  expect(await screen.findByRole("status")).toHaveTextContent("1 fund assigned to Campus Planning");
  expect(within(screen.getByRole("table")).getByText("Campus Planning")).toBeInTheDocument();
  selectFund("Scholarship Fund"); target("unassigned");
  fireEvent.click(screen.getByRole("button", { name: "Save 1 fund" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 fund returned to Unassigned"));
  expect(screen.queryByRole("checkbox", { name: "Select Scholarship Fund" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Unassigned (1)" }));
  expect(screen.getByRole("checkbox", { name: "Select Scholarship Fund" })).not.toBeChecked();
  expect(command.mock.calls).toEqual([
    ["funds", { fundIds: ["1"], priority: "scholarships" }],
    ["funds", { fundIds: ["1"], priority: "campus-planning" }],
    ["funds", { fundIds: ["1"], priority: "unassigned" }],
  ]);
});

it("keeps a failed save selected without claiming that it moved", async () => {
  const command = vi.fn().mockResolvedValue(false);
  render(<CampaignFundAssignments data={{ funds }} command={command} pending={false} />);
  selectFund("Scholarship Fund");
  fireEvent.click(screen.getByRole("button", { name: "Save 1 fund" }));
  await waitFor(() => expect(command).toHaveBeenCalledOnce());
  expect(screen.getByRole("checkbox", { name: "Select Scholarship Fund" })).toBeChecked();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("clears selection and search when switching areas, and searches names or IDs within an area", () => {
  render(<CampaignFundAssignments data={{ funds }} command={vi.fn()} pending={false} />);
  selectFund("Scholarship Fund");
  fireEvent.change(screen.getByLabelText("Find a fund"), { target: { value: "1" } });
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  selectFund("Scholarship Fund"); viewAssigned();
  expect(screen.getByLabelText("Find a fund")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Save selected funds" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Find a fund"), { target: { value: "scholarship" } });
  expect(screen.getByText("No assigned funds match your search.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByRole("checkbox", { name: "Select Innovation Fund" })).toBeInTheDocument();
});

it("paginates all funds, clears hidden selections, and clamps after the final-page fund moves", async () => {
  const many = Array.from({ length: 101 }, (_, i) => ({ ...funds[0], fund_id: String(i + 1), fund_name: `Fund ${i + 1}` }));
  const command = vi.fn().mockResolvedValue(true);
  const { rerender } = render(<CampaignFundAssignments data={{ funds: many }} command={command} pending={false} />);
  expect(screen.getAllByRole("checkbox")).toHaveLength(100);
  selectFund("Fund 1"); fireEvent.click(screen.getByRole("button", { name: "Next funds" }));
  expect(screen.getByText("Showing 101-101 of 101 unassigned funds.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save selected funds" })).toBeDisabled();
  selectFund("Fund 101"); fireEvent.click(screen.getByRole("button", { name: "Save 1 fund" }));
  await waitFor(() => expect(command).toHaveBeenCalledWith("funds", { fundIds: ["101"], priority: "scholarships" }));
  rerender(<CampaignFundAssignments data={{ funds: many.map(f => f.fund_id === "101" ? { ...f, fund_priority: "scholarships" } : f) }} command={command} pending={false} />);
  expect(screen.getByText("Showing 1-100 of 100 unassigned funds.")).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Fund assignment pages" })).not.toBeInTheDocument();
});

it("never submits a selected fund that no longer belongs to the displayed area", () => {
  const command = vi.fn();
  const { rerender } = render(<CampaignFundAssignments data={{ funds }} command={command} pending={false} />);
  selectFund("Scholarship Fund");
  rerender(<CampaignFundAssignments data={{ funds: funds.map(f => ({ ...f, fund_priority: "scholarships" })) }} command={command} pending={false} />);
  expect(screen.getByRole("button", { name: "Save selected funds" })).toBeDisabled();
  expect(command).not.toHaveBeenCalled();
});

it.each([{ pending: true }, { sourceChanged: true }])("disables assignments while locked: %j", ({ pending = false, sourceChanged = false }) => {
  render(<CampaignFundAssignments data={{ funds, sourceChanged }} command={vi.fn()} pending={pending} />);
  expect(screen.getByRole("checkbox")).toBeDisabled();
  expect(screen.getByLabelText("Assign selected funds to")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save selected funds" })).toBeDisabled();
});
