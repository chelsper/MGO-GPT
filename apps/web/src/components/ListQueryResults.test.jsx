import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ListQueryResults from "./ListQueryResults";
import ListSourceEditor from "./ListSourceEditor";
import { useState } from "react";
afterEach(() => vi.unstubAllGlobals());
const snapshot = {
  total: 2,
  headers: ["System ID", "Name", "Amount", "Current lead fundraiser"],
  tableRows: [
    ["100", "Example Donor", "1250", "Current Person"],
    ["101", "Another Donor", "250", ""],
  ],
};
it("changes visible columns, order, labels, currency formatting, and search without fetching", () => {
  vi.stubGlobal("fetch", vi.fn());
  render(
    <ListQueryResults
      snapshot={snapshot}
      title="Example list"
      defaults={[
        { header: "Amount", label: "Gift", format: "currency", visible: true },
      ]}
    />,
  );
  const table = screen.getByRole("table", { name: "Example list" });
  expect(within(table).getAllByRole("columnheader")[0]).toHaveTextContent(
    "Gift",
  );
  expect(within(table).getByText("$1,250.00")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Columns"));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "System ID", exact: true }),
  );
  expect(
    within(table).queryByRole("columnheader", { name: "System ID" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Rename, format & reorder"));
  fireEvent.click(screen.getByRole("button", { name: "Move Amount down" }));
  fireEvent.change(screen.getByLabelText("Label for Name"), {
    target: { value: "Constituent" },
  });
  expect(
    within(table).getByRole("columnheader", { name: "Constituent" }),
  ).toBeInTheDocument();
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Search saved output" }),
    { target: { value: "Another" } },
  );
  expect(within(table).queryByText("Example Donor")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("provides the supplied query as an unsaved opt-in and requires no NXT reads to validate it", () => {
  vi.stubGlobal("fetch", vi.fn());
  function Editor() {
    const [value, setValue] = useState({
      version: 1,
      source: "custom_field",
      fieldCategory: "Prospect Research",
      fieldDescription: "Future. Made. Phase II",
    });
    return (
      <ListSourceEditor
        value={value}
        onChange={setValue}
        reportKey="future-made-phase-ii"
      />
    );
  }
  render(<Editor />);
  fireEvent.click(
    screen.getByRole("button", { name: "Use supplied Future. Made. query" }),
  );
  expect(screen.getByLabelText("List source")).toHaveValue("query_json");
  expect(
    JSON.parse(screen.getByLabelText("NXT query JSON").value).select_fields,
  ).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "Check JSON" }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "Valid constituent query: 6 output fields",
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Include current lead fundraiser" }),
  );
  expect(
    screen.getByLabelText(/Constituent system record ID output header/),
  ).toHaveValue("");
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps the compact column menu keyboard accessible and hides technical IDs", () => {
  vi.stubGlobal("fetch", vi.fn());
  render(
    <ListQueryResults
      snapshot={{
        ...snapshot,
        headers: ["QRECID", "Name", "Amount", "Current lead fundraiser"],
      }}
      title="Test list"
    />,
  );
  expect(screen.queryByText("QRECID")).not.toBeInTheDocument();
  const toggle = screen.getByText("Columns");
  expect(toggle.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(toggle);
  expect(toggle.closest("details")).toHaveAttribute("open");
  for (const checkbox of screen.getAllByRole("checkbox"))
    fireEvent.click(checkbox);
  expect(
    screen.getByText(/no columns are selected for display/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Name", exact: true }));
  expect(screen.getByRole("table")).toBeInTheDocument();
  fireEvent.keyDown(toggle.closest("details"), { key: "Escape" });
  expect(toggle.closest("details")).not.toHaveAttribute("open");
  expect(toggle).toHaveFocus();
  expect(fetch).not.toHaveBeenCalled();
});
