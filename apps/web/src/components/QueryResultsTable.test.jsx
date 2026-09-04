import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUERY_RESULTS_LIMITS } from "@/app/api/utils/dashboardConfiguration";
import QueryResultsTable from "./QueryResultsTable";

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const cells = () => within(screen.getByRole("table")).getAllByRole("cell").map((cell) => cell.textContent);

describe("QueryResultsTable", () => {
  it("renders actual escaped strings and preserves amounts, blanks, leading zeros, and formula-like text by default", () => {
    const headers = ["<img src=x onerror=alert(1)>", "Amount", "Code", "Formula", "Blank"];
    const rows = [["<script>alert(1)</script>", "$1,234.5000", "00001", '=HYPERLINK("https://example.invalid")', ""]];
    const { container } = render(<QueryResultsTable title="Synthetic results" headers={headers} rows={rows} />);
    expect(cells()).toEqual(rows[0]);
    expect(screen.getByRole("columnheader", { name: headers[0] })).toBeInTheDocument();
    expect(container.querySelector("script, img, a, iframe")).toBeNull();
    expect(screen.getByRole("region", { name: "Synthetic results table scroll area" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("table", { name: "Synthetic results" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("applies optional labels and number/currency formats only to exact headers, leaving unparseable values unchanged", () => {
    const rows = [["0010.5000", "($1,234.50)", "0012.00"], ["", "=1+2", "raw"], ["N/A", "EUR 20", "raw"], ["12,34", "9007199254740993", "raw"]];
    render(<QueryResultsTable headers={["Amount", "Gift", "Amount "]} rows={rows} columnSettings={[
      { header: "Amount", label: "Displayed amount", format: "number" },
      { header: "Gift", format: "currency" },
      { header: "amount ", label: "Must not match", format: "number" },
    ]} />);
    expect(screen.getByRole("columnheader", { name: "Displayed amount" })).toBeInTheDocument();
    expect(screen.queryByText("Must not match")).not.toBeInTheDocument();
    expect(cells()).toEqual(["10.5", "-$1,234.50", "0012.00", "", "=1+2", "raw", "N/A", "EUR 20", "raw", "12,34", "9007199254740993", "raw"]);
  });

  it("sorts all rows, not only the visible page, paginates 25 rows, and never mutates the data", () => {
    const rows = Array.from({ length: 52 }, (_, index) => [String(52 - index), `Person ${index}`]);
    const original = structuredClone(rows);
    render(<QueryResultsTable headers={["Count", "Name"]} rows={rows} columnSettings={[{ header: "Count", format: "number" }]} />);
    expect(screen.getAllByRole("row")).toHaveLength(26);
    expect(screen.getByText("Rows 1-25 of 52; page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Count" }));
    expect(screen.getByText("Rows 1-25 of 52; page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Count" })).toHaveAttribute("aria-sort", "ascending");
    expect(cells().slice(0, 4)).toEqual(["1", "Person 51", "2", "Person 50"]);
    fireEvent.click(screen.getByRole("button", { name: "Count" }));
    expect(screen.getByRole("columnheader", { name: "Count" })).toHaveAttribute("aria-sort", "descending");
    expect(cells()[0]).toBe("52");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(cells()[0]).toBe("52");
    expect(rows).toEqual(original);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sorts default text without numeric coercion and keeps tied rows stable", () => {
    render(<QueryResultsTable headers={["Value", "Order"]} rows={[["2", "first"], ["10", "second"], ["2", "third"]]} />);
    fireEvent.click(screen.getByRole("button", { name: "Value" }));
    expect(cells()).toEqual(["10", "second", "2", "first", "2", "third"]);
    fireEvent.click(screen.getByRole("button", { name: "Value" }));
    expect(cells()).toEqual(["2", "first", "2", "third", "10", "second"]);
  });

  it("keeps a successful empty table distinct from unknown and clamps pagination when results shrink", () => {
    const { rerender } = render(<QueryResultsTable headers={["Name"]} rows={Array.from({ length: 26 }, () => ["Example"])} />);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    rerender(<QueryResultsTable headers={["Name"]} rows={[["One"]]} />);
    expect(screen.getByText("Rows 1-1 of 1; page 1 of 1")).toBeInTheDocument();
    expect(cells()).toEqual(["One"]);
    rerender(<QueryResultsTable headers={["Name"]} rows={[]} />);
    expect(screen.getByText(/No rows returned.*successfully/)).toBeInTheDocument();
    expect(screen.queryByText("Not refreshed")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    rerender(<QueryResultsTable headers={["Name"]} rows={null} />);
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it.each([
    { headers: ["Name"], rows: [[42]] },
    { headers: ["Name"], rows: [[{ text: "unsafe" }]] },
    { headers: ["Name", "Name"], rows: [["one", "two"]] },
    { headers: ["Name"], rows: [["one", "two"]] },
    { headers: Array.from({ length: QUERY_RESULTS_LIMITS.columns + 1 }, (_, i) => `Column ${i}`), rows: [] },
    { headers: ["Name"], rows: Array.from({ length: QUERY_RESULTS_LIMITS.rows + 1 }, () => ["Example"]) },
    { headers: ["Name"], rows: [["x".repeat(QUERY_RESULTS_LIMITS.cellCharacters + 1)]] },
    { headers: ["Name"], rows: Array.from({ length: 1000 }, () => ["x".repeat(2000)]) },
  ])("rejects malformed or over-limit data using the shared validator", (data) => {
    render(<QueryResultsTable {...data} />);
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
