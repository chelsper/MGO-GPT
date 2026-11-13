import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ImportPractice from "./ImportPractice";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Practice must not fetch"); }));
  vi.spyOn(Storage.prototype, "setItem");
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(Storage.prototype.setItem).not.toHaveBeenCalled();
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function choose(id) { fireEvent.click(screen.getByRole("button", { name: new RegExp(id) })); }
function reviewContacts() {
  fireEvent.click(screen.getByRole("radio", { name: /Include sample emails/ }));
  fireEvent.click(screen.getByRole("button", { name: "Review fictional records" }));
}
function simulate(name) {
  fireEvent.click(screen.getByRole("button", { name: "Select ready examples" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed the selected sample changes/ }));
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("import practice walkthrough", () => {
  it("has visible boundaries and no upload, real record links, or retained values", () => {
    const { container } = render(<ImportPractice />);
    expect(screen.getByText("Practice only - fictional records")).toBeVisible();
    expect(screen.getByText(/Real files cannot be uploaded here/)).toBeVisible();
    expect(screen.getByText(/Practice results do not validate a real import/)).toBeVisible();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/constituency-import");
    expect(screen.getByRole("button", { name: "Review fictional records" })).toBeDisabled();
  });
  it("completes a new-record example only with selection and explicit approval", () => {
    render(<ImportPractice />); reviewContacts();
    expect(screen.getByRole("checkbox", { name: "Select Jordan Sample" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select Avery Example" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Simulate approved creation" })).toBeDisabled();
    simulate("Simulate approved creation");
    expect(screen.getByText(/2 verified in simulation/)).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Jordan Sample" })).getByText("Needs attention")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Simulate approved creation" })).not.toBeInTheDocument();
  });
  it("demonstrates read-only recovery of an uncertain update without a resend option", () => {
    render(<ImportPractice />); choose("Update existing contacts"); reviewContacts(); simulate("Simulate approved updates");
    expect(screen.getByText("Uncertain result - do not resend")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Simulate approved updates" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simulate read-only verification" }));
    expect(screen.getByText(/Simulated read-only verification found/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Simulate read-only verification" })).not.toBeInTheDocument();
  });
  it("demonstrates all custom-field outcomes and resets after changing examples", () => {
    render(<ImportPractice />); choose("Add custom fields");
    expect(screen.getByText("Sample category: Practice Interest (Text)")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Review fictional records" }));
    expect(screen.getByRole("checkbox", { name: "Select Jordan Sample" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select Morgan Fictional" })).toBeDisabled();
    simulate("Simulate approved updates");
    expect(screen.getByText(/1 verified in simulation/)).toBeVisible();
    choose("Update existing contacts");
    expect(screen.getByRole("button", { name: "Review fictional records" })).toBeDisabled();
    expect(screen.queryByText(/1 verified in simulation/)).not.toBeInTheDocument();
  });
  it("holds incorrect mappings and clears confirmation after changing the selection", () => {
    render(<ImportPractice />);
    const column = screen.getByRole("combobox", { name: "First Name column" });
    const correct = column.value;
    fireEvent.change(column, { target: { value: "" } });
    fireEvent.click(screen.getByRole("radio", { name: /Include sample emails/ }));
    expect(screen.getByRole("button", { name: "Review fictional records" })).toBeDisabled();
    fireEvent.change(column, { target: { value: correct } });
    fireEvent.click(screen.getByRole("button", { name: "Review fictional records" }));
    fireEvent.click(screen.getByRole("button", { name: "Select ready examples" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Avery Example" }));
    expect(screen.getByRole("checkbox", { name: /I reviewed/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Back to sample setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Review fictional records" }));
    expect(screen.getByRole("checkbox", { name: "Select Avery Example" })).not.toBeChecked();
  });
  it("does not claim contacts were imported when intentionally omitted", () => {
    render(<ImportPractice />); choose("Update existing contacts");
    fireEvent.click(screen.getByRole("radio", { name: "Leave email addresses unchanged" }));
    fireEvent.click(screen.getByRole("button", { name: "Review fictional records" }));
    expect(screen.getAllByText("No change needed")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Simulate approved updates" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish practice with no changes" }));
    expect(screen.getByText(/0 verified in simulation; 3 need no change; 0 need attention/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Restart this practice" }));
    expect(screen.getByRole("button", { name: "Review fictional records" })).toBeDisabled();
  });
});
