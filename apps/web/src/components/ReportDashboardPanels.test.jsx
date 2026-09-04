import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardValueFingerprint } from "@/app/api/utils/dashboardConfiguration";
import ReportDashboardPanels from "./ReportDashboardPanels";

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
