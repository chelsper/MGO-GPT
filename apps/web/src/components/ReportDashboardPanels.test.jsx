import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardTableFingerprint, getDashboardValueFingerprint } from "@/app/api/utils/dashboardConfiguration";
import ReportDashboardPanels, {
  reorderDashboardPanels,
  setDashboardPanelWidth,
} from "./ReportDashboardPanels";

const query = (key, rowKey, columnKey, queryId) => ({ key, rowKey, columnKey, source: "query_count", queryId, refreshPolicy: "refreshable" });
const panel = {
  key: "engagement", title: "Engagement", layout: "table", width: "full",
  rows: [{ key: "a", label: "Alumni" }, { key: "b", label: "Families" }],
  columns: [{ key: "previous", label: "FY25" }, { key: "current", label: "FY26" }],
  values: [query("b-current", "b", "current", "4"), query("a-previous", "a", "previous", "1"), query("a-current", "a", "current", "2"), query("b-previous", "b", "previous", "3")],
};
const saved = (definition, value, extra = {}) => ({ key: definition.key, value, status: "ready", definitionFingerprint: getDashboardValueFingerprint(definition), refreshedAt: "2026-09-01T12:00:00Z", ...extra });

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ReportDashboardPanels", () => {
  it("aligns an actual table by row/column keys and snapshot value keys, not array order", () => {
    const byKey = Object.fromEntries(panel.values.map((value) => [value.key, value]));
    render(<ReportDashboardPanels configuration={{ version: 1, panels: [panel] }} snapshot={{ values: [saved(byKey["b-previous"], 30), saved(byKey["a-current"], 0), saved(byKey["b-current"], 40), saved(byKey["a-previous"], 10)] }} />);
    const table = screen.getByRole("table", { name: "Engagement" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Label", "FY25", "FY26"]);
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByRole("rowheader")).toHaveTextContent("Alumni");
    expect(within(rows[1]).getAllByRole("cell")[0]).toHaveTextContent(/^10As of/);
    expect(within(rows[1]).getAllByRole("cell")[1]).toHaveTextContent(/^0As of/);
    expect(within(rows[2]).getAllByRole("cell")[0]).toHaveTextContent(/^30As of/);
    expect(within(rows[2]).getAllByRole("cell")[1]).toHaveTextContent(/^40As of/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses draft labels/static zero/note rather than snapshot configuration or old static value", () => {
    const definition = { key: "zero", rowKey: "a", columnKey: "current", source: "static", staticValue: 0, note: "Verified manually" };
    const draft = { ...panel, title: "Draft title", layout: "metric", width: "half", rows: [{ key: "a", label: "Draft row" }], columns: [{ key: "current", label: "Count" }], values: [definition] };
    render(<ReportDashboardPanels configuration={{ version: 1, panels: [draft] }} snapshot={{ configuration: panel, values: [saved(definition, 90)] }} />);
    expect(screen.getByRole("heading", { name: "Draft title" })).toBeInTheDocument();
    expect(screen.getByText("Draft row")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Static value")).toBeInTheDocument();
    expect(screen.getByText("Verified manually")).toBeInTheDocument();
    expect(screen.queryByText("90")).not.toBeInTheDocument();
  });

  it("shows server-provided manual provenance, never IDs or a static Frozen badge, and hides it after value edits", () => {
    const definition = { key: "manual", rowKey: "", columnKey: "", source: "static", staticValue: 0, refreshPolicy: "frozen" };
    const metric = { ...panel, layout: "metric", rows: [], columns: [], values: [definition] };
    const snapshot = { values: [saved(definition, 0, { asOf: "2026-09-03T12:00:00Z", updatedBy: { id: "private-user-id", name: "Example Editor", email: "private@example.test" }, provenance: "manual" })] };
    const { rerender } = render(<ReportDashboardPanels configuration={{ panels: [metric] }} snapshot={snapshot} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Static value")).toBeInTheDocument();
    expect(screen.getByText(/As of Sep 3, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Updated by Example Editor")).toBeInTheDocument();
    expect(screen.queryByText(/Frozen|private-user-id|private@example/)).not.toBeInTheDocument();
    rerender(<ReportDashboardPanels configuration={{ panels: [{ ...metric, values: [{ ...definition, staticValue: 9 }] }] }} snapshot={snapshot} />);
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.queryByText(/Updated by|As of/)).not.toBeInTheDocument();
  });

  it("shows absent, null and changed-source query snapshots as not refreshed, never zero", () => {
    const [one, two, three] = panel.values;
    render(<ReportDashboardPanels configuration={{ version: 1, panels: [panel] }} snapshot={{ values: [saved(one, null), saved({ ...two, queryId: "old" }, 22), { key: three.key, value: 6 }] }} />);
    expect(screen.getAllByText("Not refreshed")).toHaveLength(4);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("22")).not.toBeInTheDocument();
  });

  it("keeps frozen/stale status and as-of dates on successful values after layout edits", () => {
    const definition = { ...panel.values[0], refreshPolicy: "frozen", note: "Prior year baseline" };
    const draft = { ...panel, layout: "rows", rows: [panel.rows[1]], columns: [panel.columns[1]], values: [definition] };
    render(<ReportDashboardPanels configuration={{ version: 1, panels: [draft] }} snapshot={{ values: [saved(definition, 12, { status: "stale", frozenAt: "2026-08-15T12:00:00Z" })] }} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Frozen")).toBeInTheDocument();
    expect(screen.getByText(/As of Aug 15, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Last successful value; refresh failed")).toBeInTheDocument();
    expect(screen.getByText("Prior year baseline")).toBeInTheDocument();
  });

  it("leaves a missing table coordinate in place and labels all columns in non-table layouts", () => {
    const sparse = { ...panel, values: [{ key: "one", rowKey: "a", columnKey: "previous", source: "static", staticValue: 1 }] };
    const { rerender } = render(<ReportDashboardPanels configuration={{ panels: [sparse] }} />);
    expect(screen.getAllByRole("cell")).toHaveLength(4);
    expect(screen.getAllByText("Not refreshed")).toHaveLength(3);
    rerender(<ReportDashboardPanels configuration={{ panels: [{ ...sparse, layout: "rows" }] }} />);
    expect(screen.getAllByText("FY25")).toHaveLength(2);
    expect(screen.getAllByText("FY26")).toHaveLength(2);
  });

  it("assigns half/full width classes and handles an empty draft", () => {
    const { rerender } = render(<ReportDashboardPanels configuration={{ panels: [panel, { ...panel, key: "half", title: "Half", width: "half" }] }} />);
    expect(screen.getAllByRole("region", { name: "Half" })[0].className).toContain("half");
    expect(screen.getAllByRole("region", { name: "Engagement" })[0].className).toContain("full");
    rerender(<ReportDashboardPanels configuration={null} />);
    expect(screen.getByText(/No panels yet/)).toBeInTheDocument();
  });
});

const resultsPanel = { key: "query-table", title: "Query results", layout: "query_results", width: "full", queryId: "777", refreshPolicy: "refreshable", columnSettings: [], rows: [], columns: [], values: [] };
const savedTable = (definition = resultsPanel, patch = {}) => ({ key: definition.key, panelKey: definition.key, queryId: definition.queryId, headers: ["Name", "Gift"], rows: [["Example Person", "$120.0000"]], dataSource: "query-results-csv-v1", definitionFingerprint: getDashboardTableFingerprint(definition), refreshedAt: "2026-09-01T12:00:00Z", frozenAt: null, status: "ready", error: null, ...patch });

describe("ReportDashboardPanels query tables", () => {
  it("renders snapshot tables by panel key alongside existing numeric panels without using config data as cells", () => {
    const second = { ...resultsPanel, key: "second", title: "Second query", queryId: "888", width: "half" };
    render(<ReportDashboardPanels configuration={{ panels: [resultsPanel, panel, second] }} snapshot={{
      values: panel.values.map((definition) => saved(definition, 42)),
      tables: [savedTable(second, { rows: [["Second Person", "0"]] }), savedTable()],
    }} />);
    const table = screen.getByRole("table", { name: "Query results" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Name", "Gift"]);
    expect(within(table).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Example Person", "$120.0000"]);
    expect(within(screen.getByRole("table", { name: "Second query" })).getByRole("cell", { name: "Second Person" })).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Engagement" })).getAllByRole("cell")).toHaveLength(4);
    expect(screen.getByRole("region", { name: "Query results" }).className).toContain("full");
    expect(screen.getByRole("region", { name: "Second query" }).className).toContain("half");
    expect(screen.queryByText("Add rows and columns to this panel.")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses draft title, width, labels and formats without invalidating source-only snapshot matching", () => {
    const draft = { ...resultsPanel, title: "Draft table", width: "half", refreshPolicy: "frozen", columnSettings: [{ header: "Name", label: "Constituent", format: "text" }, { header: "Gift", label: "Donation", format: "currency" }] };
    render(<ReportDashboardPanels configuration={{ panels: [draft] }} snapshot={{ configuration: { panels: [resultsPanel] }, tables: [savedTable()] }} />);
    expect(screen.getByRole("table", { name: "Draft table" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Constituent" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Donation" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "$120.00" })).toBeInTheDocument();
    expect(screen.getByText("Frozen")).toBeInTheDocument();
    expect(screen.getByText(/As of Sep 1, 2026/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains prior rows after a failed refresh and shows frozen/as-of status without raw error details", () => {
    const frozen = { ...resultsPanel, refreshPolicy: "frozen" };
    const { rerender } = render(<ReportDashboardPanels configuration={{ panels: [frozen] }} snapshot={{ tables: [savedTable(frozen)] }} />);
    rerender(<ReportDashboardPanels configuration={{ panels: [frozen] }} snapshot={{ tables: [savedTable(frozen, { status: "stale", frozenAt: "2026-08-20T12:00:00Z", error: "private@example.invalid" })] }} />);
    expect(screen.getByRole("cell", { name: "Example Person" })).toBeInTheDocument();
    expect(screen.getByText("Last successful table; refresh failed")).toBeInTheDocument();
    expect(screen.getByText("Frozen")).toBeInTheDocument();
    expect(screen.getByText(/As of Aug 20, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/private@example/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("distinguishes never loaded, failed missing, successful empty and stale empty results", () => {
    const { rerender } = render(<ReportDashboardPanels configuration={{ panels: [resultsPanel] }} />);
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    rerender(<ReportDashboardPanels configuration={{ panels: [resultsPanel] }} snapshot={{ tables: [savedTable(resultsPanel, { rows: null, status: "missing", error: "Do not show this raw error" })] }} />);
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
    expect(screen.getByText("Query refresh failed")).toBeInTheDocument();
    expect(screen.queryByText(/As of|Do not show/)).not.toBeInTheDocument();
    rerender(<ReportDashboardPanels configuration={{ panels: [resultsPanel] }} snapshot={{ tables: [savedTable(resultsPanel, { rows: [] })] }} />);
    expect(screen.getByText(/No rows returned.*successfully/)).toBeInTheDocument();
    expect(screen.queryByText("Not refreshed")).not.toBeInTheDocument();
    rerender(<ReportDashboardPanels configuration={{ panels: [resultsPanel] }} snapshot={{ tables: [savedTable(resultsPanel, { rows: [], status: "stale", error: "failure" })] }} />);
    expect(screen.getByText(/No rows returned.*successfully/)).toBeInTheDocument();
    expect(screen.getByText("Last successful table; refresh failed")).toBeInTheDocument();
  });

  it.each([
    { definitionFingerprint: undefined }, { definitionFingerprint: "wrong" }, { dataSource: "strict-csv-row-count-v1" },
    { key: "other" }, { panelKey: "other" }, { queryId: "888" }, { rows: null }, { rows: [["Example", 0]] },
    { headers: ["Name", "Name"] }, { status: "missing" }, { status: "unsupported" },
  ])("rejects mismatched or malformed saved table data", (patch) => {
    render(<ReportDashboardPanels configuration={{ panels: [resultsPanel] }} snapshot={{ tables: [savedTable(resultsPanel, patch)] }} />);
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/Example Person|As of/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("immediately hides cached rows when the draft query changes and does not substitute preview/config rows", () => {
    const snapshot = { tables: [savedTable()] };
    const { rerender } = render(<ReportDashboardPanels configuration={{ panels: [resultsPanel] }} snapshot={snapshot} />);
    expect(screen.getByRole("cell", { name: "Example Person" })).toBeInTheDocument();
    rerender(<ReportDashboardPanels configuration={{ panels: [{ ...resultsPanel, queryId: "888", headers: ["Private"], rows: [["Not snapshot data"]] }] }} snapshot={snapshot} />);
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/Example Person|Not snapshot data|As of/)).not.toBeInTheDocument();
  });

  it("opens list panels in a full-screen dialog without fetching new data", () => {
    render(<ReportDashboardPanels configuration={{ panels: [resultsPanel] }} snapshot={{ tables: [savedTable()] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Open full view of Query results" }));
    const dialog = screen.getByRole("dialog", { name: "Query results full view" });
    expect(within(dialog).getByRole("cell", { name: "Example Person" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close full view" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("provides drag, keyboard order and width controls only in arrange mode", () => {
    const second = { ...resultsPanel, key: "second", title: "Second query", queryId: "888", width: "half" };
    const onMovePanel = vi.fn();
    const onWidthChange = vi.fn();
    render(
      <ReportDashboardPanels
        configuration={{ panels: [resultsPanel, second] }}
        arrangeMode
        onMovePanel={onMovePanel}
        onWidthChange={onWidthChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Move Second query earlier" }));
    expect(onMovePanel).toHaveBeenCalledWith("second", "query-table");
    fireEvent.click(screen.getByRole("button", { name: "Use half width for Query results" }));
    expect(onWidthChange).toHaveBeenCalledWith("query-table", "half");
    fireEvent.dragStart(screen.getByRole("button", { name: "Drag Query results to reorder" }));
    fireEvent.drop(screen.getByRole("heading", { name: "Second query" }).closest("section"));
    expect(onMovePanel).toHaveBeenLastCalledWith("query-table", "second");
  });

  it("reorders and resizes immutable dashboard drafts", () => {
    const second = { ...resultsPanel, key: "second", title: "Second query", width: "half" };
    const configuration = { version: 1, panels: [resultsPanel, second] };
    const reordered = reorderDashboardPanels(configuration, "second", "query-table");
    expect(reordered.panels.map((item) => item.key)).toEqual(["second", "query-table"]);
    expect(configuration.panels.map((item) => item.key)).toEqual(["query-table", "second"]);
    const resized = setDashboardPanelWidth(reordered, "query-table", "half");
    expect(resized.panels.find((item) => item.key === "query-table").width).toBe("half");
  });
});
