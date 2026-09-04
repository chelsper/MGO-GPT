import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_LIMITS, validateDashboardConfiguration } from "@/app/api/utils/dashboardConfiguration";
import ReportDashboardBuilder from "./ReportDashboardBuilder";
import ReportDashboardPanels from "./ReportDashboardPanels";

const empty = { version: 1, panels: [] };
const json = (payload, ok = true) => ({ ok, json: async () => payload });
let latest, changes;

function Editor({ initial = empty, disabled = false, snapshot = null }) {
  const [value, setValue] = useState(initial);
  latest = value;
  return <>
    <ReportDashboardBuilder value={value} disabled={disabled} onChange={(next) => { changes(next); setValue(next); }} />
    <ReportDashboardPanels configuration={value} snapshot={snapshot} />
  </>;
}

function startPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Add panel" }));
}

function setQuery(queryId = "123") {
  fireEvent.change(screen.getByLabelText("Value source"), { target: { value: "query_count" } });
  fireEvent.change(screen.getByLabelText("Query ID"), { target: { value: queryId } });
}

beforeEach(() => { changes = vi.fn(); vi.stubGlobal("fetch", vi.fn()); vi.stubGlobal("confirm", vi.fn(() => false)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ReportDashboardBuilder", () => {
  it("creates a valid panel and edits source, static zero, labels, width and note without a network request", () => {
    render(<Editor />);
    startPanel();
    const key = latest.panels[0].values[0].key;
    expect(validateDashboardConfiguration(latest)).toBe("");
    setQuery();
    fireEvent.change(screen.getByLabelText("Refresh policy"), { target: { value: "frozen" } });
    expect(latest.panels[0].values[0]).toMatchObject({ key, source: "query_count", queryId: "123", refreshPolicy: "frozen" });
    fireEvent.change(screen.getByLabelText("Value source"), { target: { value: "static" } });
    fireEvent.change(screen.getByLabelText("Static value", { selector: "input" }), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Panel title"), { target: { value: "Engagement" } });
    fireEvent.change(screen.getByLabelText("Row 1 label"), { target: { value: "Households" } });
    fireEvent.change(screen.getByLabelText("Column 1 label"), { target: { value: "FY26" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Manually verified" } });
    fireEvent.change(screen.getByLabelText("Panel width"), { target: { value: "full" } });
    expect(latest.panels[0]).toMatchObject({ title: "Engagement", width: "full", rows: [{ label: "Households" }], columns: [{ label: "FY26" }], values: [{ key, source: "static", staticValue: 0, note: "Manually verified" }] });
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(validateDashboardConfiguration(latest)).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps a blank static value unknown instead of coercing it to zero", () => {
    render(<Editor />);
    startPanel();
    const input = screen.getByLabelText("Static value", { selector: "input" });
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(latest.panels[0].values[0].staticValue).toBeNull();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
  });

  it("preserves cell keys on layout changes and blocks destructive narrowing without executing queries", () => {
    render(<Editor />);
    startPanel();
    setQuery();
    const singleValue = structuredClone(latest.panels[0].values);
    fireEvent.change(screen.getByLabelText("Layout"), { target: { value: "metric" } });
    expect(screen.getByRole("button", { name: "Add row" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add column" })).toBeDisabled();
    expect(latest.panels[0].values).toEqual(singleValue);
    fireEvent.change(screen.getByLabelText("Layout"), { target: { value: "table" } });
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    const original = structuredClone(latest.panels[0].values);
    for (const layout of ["metric", "rows"]) {
      expect(within(screen.getByLabelText("Layout")).getByRole("option", { name: layout === "metric" ? "Metric" : "Rows" })).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Layout"), { target: { value: layout } });
      expect(latest.panels[0].layout).toBe("table");
      expect(latest.panels[0].values).toEqual(original);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("removes only the selected dimension's cells and cannot remove the last row or column", () => {
    render(<Editor />);
    startPanel();
    expect(screen.getByRole("button", { name: "Remove row 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove column 1" })).toBeDisabled();
    const retained = latest.panels[0].values[0].key;
    fireEvent.change(screen.getByLabelText("Layout"), { target: { value: "table" } });
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(latest.panels[0].values).toHaveLength(4);
    expect(new Set(latest.panels[0].values.map((cell) => cell.key)).size).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "Remove row 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove column 2" }));
    expect(latest.panels[0].values).toHaveLength(1);
    expect(latest.panels[0].values[0].key).toBe(retained);
    expect(validateDashboardConfiguration(latest)).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Remove panel" }));
    expect(latest.panels).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("requires confirmation to remove zero, query, or noted values and preserves the draft on cancel", () => {
    render(<Editor />);
    startPanel();
    fireEvent.change(screen.getByLabelText("Static value", { selector: "input" }), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove panel" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("1 populated value"));
    expect(latest.panels[0].values[0].staticValue).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove row 1" }));
    expect(latest.panels[0].rows).toHaveLength(2);
    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove row 1" }));
    expect(latest.panels[0].rows).toHaveLength(1);
    setQuery();
    fireEvent.change(screen.getByLabelText("Layout"), { target: { value: "table" } });
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove column 1" }));
    expect(latest.panels[0].columns).toHaveLength(2);
    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove column 1" }));
    expect(latest.panels[0].columns).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Keep this note" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove panel" }));
    expect(latest.panels).toHaveLength(1);
    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove panel" }));
    expect(latest.panels).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tests only after a click and keeps a zero test result separate from preview and configuration", async () => {
    fetch.mockResolvedValue(json({ queryId: "123", value: 0, donor: "DO NOT DISPLAY", url: "https://private.invalid" }));
    render(<Editor />);
    startPanel();
    setQuery();
    expect(screen.getByText(/Counts CSV data rows.*one constituent per row.*aggregate row counts as 1/)).toBeInTheDocument();
    const before = structuredClone(latest);
    const calls = changes.mock.calls.length;
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Test query" }));
    expect(await screen.findByText("Test count: 0. Not saved to the dashboard.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/reports/dashboards/test-query", expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queryId: "123" }) }));
    expect(latest).toEqual(before);
    expect(changes).toHaveBeenCalledTimes(calls);
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
    expect(screen.queryByText(/DO NOT DISPLAY|private.invalid/)).not.toBeInTheDocument();
  });

  it("hides old test feedback and ignores an in-flight response when the query changes", async () => {
    let resolve;
    fetch.mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(<Editor />);
    startPanel();
    setQuery();
    fireEvent.click(screen.getByRole("button", { name: "Test query" }));
    expect(screen.getByRole("button", { name: "Testing query..." })).toBeDisabled();
    const signal = fetch.mock.calls[0][1].signal;
    fireEvent.change(screen.getByLabelText("Query ID"), { target: { value: "456" } });
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(json({ queryId: "123", value: 99 })));
    expect(screen.queryByText(/Test count:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test query" })).toBeEnabled();
    fetch.mockResolvedValue(json({ queryId: "456", value: 7 }));
    fireEvent.click(screen.getByRole("button", { name: "Test query" }));
    expect(await screen.findByText(/Test count: 7/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Query ID"), { target: { value: "789" } });
    expect(screen.queryByText(/Test count:/)).not.toBeInTheDocument();
  });

  it.each([
    json({ error: "Sensitive URL: https://private.invalid" }, false),
    json({ queryId: "123", value: null }),
    json({ queryId: "123", value: "0" }),
    json({ queryId: "456", value: 8 }),
    json({ queryId: "123", value: -1 }),
  ])("shows safe feedback for failed or malformed tests", async (result) => {
    fetch.mockResolvedValue(result);
    render(<Editor />);
    startPanel();
    setQuery();
    fireEvent.click(screen.getByRole("button", { name: "Test query" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not test this query");
    expect(screen.queryByText(/Sensitive URL|Test count:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test query" })).toBeEnabled();
  });

  it("validates IDs before testing and enforces the query count limit", () => {
    render(<Editor />);
    startPanel();
    setQuery("bad-id");
    expect(screen.getByRole("button", { name: "Test query" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Query ID"), { target: { value: "123" } });
    for (let index = 1; index < DASHBOARD_LIMITS.queries; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Add row" }));
      fireEvent.change(screen.getAllByLabelText("Value source")[index], { target: { value: "query_count" } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    const finalSource = screen.getAllByLabelText("Value source")[DASHBOARD_LIMITS.queries];
    expect(within(finalSource).getByRole("option", { name: "Saved query count" })).toBeDisabled();
    fireEvent.change(finalSource, { target: { value: "query_count" } });
    expect(latest.panels[0].values[DASHBOARD_LIMITS.queries].source).toBe("static");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("honors disabled for every edit and test button", () => {
    const initial = { version: 1, panels: [{ key: "p", title: "Panel", layout: "rows", width: "half", rows: [{ key: "r", label: "Row" }], columns: [{ key: "c", label: "Count" }], values: [{ key: "v", rowKey: "r", columnKey: "c", source: "query_count", queryId: "123" }] }] };
    const { container } = render(<Editor initial={initial} disabled />);
    for (const element of container.querySelectorAll("button, input, select, textarea")) expect(element).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Test query" }));
    expect(changes).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("repairs legacy dimensionless metrics before emitting a draft without replacing their value", () => {
    const initial = { version: 1, panels: [{ key: "p", title: "Metric", layout: "metric", width: "half", rows: [], columns: [], values: [{ key: "v", rowKey: "", columnKey: "", source: "static", staticValue: 0 }] }] };
    render(<Editor initial={initial} />);
    fireEvent.change(screen.getByLabelText("Static value", { selector: "input" }), { target: { value: "42" } });
    expect(latest.panels[0].values).toHaveLength(1);
    expect(latest.panels[0].values[0]).toMatchObject({ key: "v", staticValue: 42 });
    expect(latest.panels[0].rows).toHaveLength(1);
    expect(latest.panels[0].columns).toHaveLength(1);
    expect(validateDashboardConfiguration(latest)).toBe("");
    fireEvent.change(screen.getByLabelText("Layout"), { target: { value: "table" } });
    expect(latest.panels[0].values[0]).toMatchObject({ key: "v", staticValue: 42 });
    expect(validateDashboardConfiguration(latest)).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates metrics with exactly one row and column and prevents removing either", () => {
    render(<Editor />);
    startPanel();
    fireEvent.change(screen.getByLabelText("Layout"), { target: { value: "metric" } });
    expect(latest.panels[0].rows).toHaveLength(1);
    expect(latest.panels[0].columns).toHaveLength(1);
    expect(latest.panels[0].values).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Remove row 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove column 1" })).toBeDisabled();
    expect(validateDashboardConfiguration(latest)).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("enforces the panel and cell limits before adding more content", () => {
    const makePanel = (index, count = 1) => ({
      key: `p${index}`, title: `Panel ${index}`, layout: "rows", width: "half",
      rows: Array.from({ length: count }, (_, row) => ({ key: `r${row}`, label: `Row ${row}` })),
      columns: [{ key: "c", label: "Count" }],
      values: Array.from({ length: count }, (_, row) => ({ key: `v${index}-${row}`, rowKey: `r${row}`, columnKey: "c", source: "static", staticValue: null })),
    });
    const { unmount } = render(<Editor initial={{ version: 1, panels: Array.from({ length: DASHBOARD_LIMITS.panels }, (_, index) => makePanel(index)) }} />);
    expect(screen.getByRole("button", { name: "Add panel" })).toBeDisabled();
    unmount();
    render(<Editor initial={{ version: 1, panels: [makePanel(1, DASHBOARD_LIMITS.values)] }} />);
    expect(screen.getByRole("button", { name: "Add panel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add row" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add column" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
